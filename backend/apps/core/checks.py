"""System checks de autorización (ADR-0006, SEGURIDAD-Y-AUTORIZACION §3.2).

Recorre todo el URLConf al arrancar (`check`, `runserver`, `pytest`) y falla si una vista no
declara su permiso. Así una vista nueva sin permiso no puede ni levantar el servidor.

- lancex.E001: vista sin permiso declarado (`public = True` o `required_capability`).
- lancex.E002: capacidad declarada que no existe en el catálogo (errata = permiso inválido).
- lancex.E003: vista que sobrescribe `get_permissions` (no verificable estáticamente).
- lancex.E004: el permiso global por defecto no es `DenyAll`.
"""

from __future__ import annotations

from collections.abc import Iterator

from django.conf import settings
from django.core.checks import Error, Tags, register
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.views import APIView

from .capabilities import unknown_capabilities
from .permissions import LancexPermission

DENY_ALL_PATH = "apps.core.permissions.DenyAll"


def iter_url_patterns(resolver: URLResolver | None = None, prefix: str = "") -> Iterator[tuple[str, URLPattern]]:
    resolver = resolver or get_resolver()
    for entry in resolver.url_patterns:
        route = prefix + str(entry.pattern)
        if isinstance(entry, URLResolver):
            yield from iter_url_patterns(entry, route)
        else:
            yield route, entry


def view_class_of(pattern: URLPattern) -> type | None:
    callback = pattern.callback
    return getattr(callback, "cls", None) or getattr(callback, "view_class", None)


def _expand(permission_class: type) -> list[type]:
    """Incluye los permisos internos de `ByMethod`."""
    inner = getattr(permission_class, "method_permissions", None) or {}
    return [permission_class, *(p for p in inner.values() if p is not permission_class)]


def declared_capabilities(permission_classes) -> tuple[bool, list[str]]:
    """Devuelve (declara_permiso, capacidades) para una lista de permisos de DRF."""
    declared = False
    capabilities: list[str] = []
    for permission_class in permission_classes:
        for perm in _expand(permission_class):
            if not (isinstance(perm, type) and issubclass(perm, LancexPermission)):
                continue
            if perm.public:
                declared = True
            if perm.required_capability:
                declared = True
                capabilities.append(perm.required_capability)
    return declared, capabilities


def check_view_permissions(urlconf: str | None = None) -> list[Error]:
    errors: list[Error] = []
    resolver = get_resolver(urlconf)
    for route, pattern in iter_url_patterns(resolver):
        view_class = view_class_of(pattern)
        label = f"/{route} ({getattr(view_class, '__qualname__', pattern.lookup_str)})"

        if view_class is None or not issubclass(view_class, APIView):
            if not getattr(pattern.callback, "public", False):
                errors.append(
                    Error(
                        f"La vista {label} no es de DRF y no declara `public = True`.",
                        hint="Usa una APIView con permission_classes de apps.core.permissions.",
                        id="lancex.E001",
                    )
                )
            continue

        if "get_permissions" in vars(view_class):
            errors.append(
                Error(
                    f"La vista {label} sobrescribe get_permissions().",
                    hint="Declara el permiso con permission_classes (usa ByMethod para permisos por método).",
                    id="lancex.E003",
                )
            )

        declared, capabilities = declared_capabilities(view_class.permission_classes)
        if not declared:
            errors.append(
                Error(
                    f"La vista {label} no declara permiso (public = True o required_capability).",
                    hint="permission_classes = [Public] o [HasCapability(Cap.X)]. El global es DenyAll.",
                    id="lancex.E001",
                )
            )
        if unknown := unknown_capabilities(capabilities):
            errors.append(
                Error(
                    f"La vista {label} declara capacidades inexistentes: {', '.join(unknown)}.",
                    hint="Usa las constantes Cap / OrgCap de apps.core.capabilities.",
                    id="lancex.E002",
                )
            )
    return errors


@register(Tags.security)
def authorization_check(app_configs=None, **kwargs) -> list[Error]:
    errors: list[Error] = []
    default_permissions = settings.REST_FRAMEWORK.get("DEFAULT_PERMISSION_CLASSES", [])
    if list(default_permissions) != [DENY_ALL_PATH]:
        errors.append(
            Error(
                "REST_FRAMEWORK['DEFAULT_PERMISSION_CLASSES'] debe ser exactamente [DenyAll].",
                id="lancex.E004",
            )
        )
    errors.extend(check_view_permissions())
    return errors
