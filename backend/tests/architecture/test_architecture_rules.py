"""Reglas de arquitectura verificadas automáticamente (fitness functions).

Convierten las ADR en pruebas: si alguien (persona o IA) rompe una regla, CI falla.
- ADR-0003: sin carpetas migrations/, modelos managed = False con db_table explícito.
- ADR-0005: `domain` en Python puro; dependencias api -> services -> domain; ninguna app
  importa la capa `api` de otra.
- ADR-0004: la hora de negocio no sale del reloj de la laptop.
- ADR-0006: nunca `fields = "__all__"`.
"""

import ast
import re
import subprocess
import sys
from pathlib import Path

import pytest
from django.apps import apps as django_apps

pytestmark = pytest.mark.architecture

BACKEND = Path(__file__).resolve().parents[2]
APPS = BACKEND / "apps"
LANCEX_APPS = sorted(p.name for p in APPS.iterdir() if (p / "apps.py").exists())


def python_files(root: Path):
    return [p for p in root.rglob("*.py") if ".venv" not in p.parts]


def imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:  # import relativo -> absoluto
                package = ".".join(path.relative_to(BACKEND).with_suffix("").parts[: -node.level])
                modules.add(f"{package}.{node.module}" if node.module else package)
            elif node.module:
                modules.add(node.module)
    return modules


def test_no_django_migrations_folders():
    found = [str(p.relative_to(BACKEND)) for p in APPS.rglob("migrations") if p.is_dir()]
    assert found == [], f"ADR-0003: LANCEX no usa migraciones de Django: {found}"


def test_every_lancex_model_is_unmanaged_with_explicit_table():
    offenders = []
    for model in django_apps.get_models():
        if not model.__module__.startswith("apps."):
            continue
        meta = model._meta
        explicit_table = "db_table" in meta.original_attrs
        if meta.managed or not explicit_table:
            offenders.append(f"{meta.label} (managed={meta.managed}, db_table explícito={explicit_table})")
    assert offenders == [], f"ADR-0003: modelos deben ser managed=False con db_table: {offenders}"


@pytest.mark.parametrize("path", python_files(APPS / "auctions" / "domain"), ids=lambda p: p.name)
def test_domain_is_pure_python(path):
    forbidden = {m for m in imported_modules(path) if m.split(".")[0] in {"django", "rest_framework"}}
    forbidden |= {m for m in imported_modules(path) if re.match(r"apps\.\w+\.(models|api|services)", m)}
    assert not forbidden, f"ADR-0005: el dominio no importa Django ni capas externas: {forbidden}"


LAPTOP_CLOCK_CALLS = {"timezone.now", "datetime.now", "datetime.utcnow", "datetime.today", "date.today", "time.time"}


def clock_calls(path: Path) -> list[str]:
    """Llamadas reales (AST) al reloj local; ignora comentarios y docstrings."""
    found = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            owner = node.func.value
            name = owner.id if isinstance(owner, ast.Name) else getattr(owner, "attr", None)
            if f"{name}.{node.func.attr}" in LAPTOP_CLOCK_CALLS:
                found.append(f"{name}.{node.func.attr} (línea {node.lineno})")
    return found


@pytest.mark.parametrize(
    "path",
    [p for app in LANCEX_APPS for layer in ("domain", "services") for p in python_files(APPS / app / layer)],
    ids=lambda p: str(p.relative_to(APPS)),
)
def test_business_layers_never_read_the_laptop_clock(path):
    calls = clock_calls(path)
    assert not calls, f"ADR-0004: usa TimeSource.db_now() en lugar de {calls}"


def test_clock_rule_detects_real_calls(tmp_path):
    sample = tmp_path / "svc.py"
    sample.write_text(
        '"""Nunca timezone.now() aquí."""\nfrom django.utils import timezone\nx = timezone.now()\n', encoding="utf-8"
    )
    assert clock_calls(sample) == ["timezone.now (línea 3)"]


def test_layer_dependencies_point_inwards():
    """services y domain no dependen de api; ninguna app importa la capa api de otra."""
    violations = []
    for path in python_files(APPS):
        rel = path.relative_to(APPS).parts
        app, layer = rel[0], rel[1] if len(rel) > 2 else None
        for module in imported_modules(path):
            match = re.match(r"apps\.(\w+)\.api\b", module)
            if not match:
                continue
            if layer in {"services", "domain"} or match.group(1) != app:
                violations.append(f"{'/'.join(rel)} -> {module}")
    assert violations == [], f"ADR-0005: dependencias api -> services -> domain: {violations}"


def test_no_serializer_exposes_all_fields():
    offenders = [
        str(p.relative_to(BACKEND))
        for p in python_files(APPS)
        if re.search(r"fields\s*=\s*['\"]__all__['\"]", p.read_text(encoding="utf-8"))
    ]
    assert offenders == [], f"ADR-0006: lista blanca de campos obligatoria: {offenders}"


@pytest.mark.parametrize("command", ["makemigrations", "migrate", "flush", "sqlflush", "loaddata", "createsuperuser"])
def test_manage_py_refuses_forbidden_commands(command):
    result = subprocess.run(  # noqa: S603
        [sys.executable, "manage.py", command], cwd=BACKEND, capture_output=True, text=True, timeout=60, check=False
    )
    assert result.returncode == 2
    assert "ADR-0003" in result.stderr
