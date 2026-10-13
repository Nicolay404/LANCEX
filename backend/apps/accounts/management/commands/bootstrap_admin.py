"""Crea el PRIMER admin de la plataforma (reemplaza a `createsuperuser`, ROLES-Y-PERMISOS.md §6).

    python manage.py bootstrap_admin --email admin@ejemplo.com --display-name "Admin LANCEX"

La contraseña se toma de `--password` o de la variable `LANCEX_ADMIN_PASSWORD` (nunca hay valor
por defecto). Solo funciona si todavía no existe ningún admin.
"""

import os

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.accounts.services.validation import check_password_strength, clean_display_name, normalize_email
from apps.audit.services import record
from apps.core.capabilities import PlatformRole
from apps.core.errors import LancexError


class Command(BaseCommand):
    help = "Crea el primer admin (solo si no existe ninguno)."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--display-name", required=True)
        parser.add_argument("--password", default=None, help="Mejor por la variable LANCEX_ADMIN_PASSWORD.")

    def handle(self, *args, email, display_name, password, **options):
        password = password or os.environ.get("LANCEX_ADMIN_PASSWORD")
        if not password:
            raise CommandError("Indica la contraseña con --password o LANCEX_ADMIN_PASSWORD.")
        if User.objects.filter(platform_role=PlatformRole.ADMIN).exists():
            raise CommandError("Ya existe un admin. Los siguientes se asignan desde /admin/users/{id}/role/.")
        email = normalize_email(email)
        try:
            name = clean_display_name(display_name)
            check_password_strength(password, User(email=email, display_name=name))
        except LancexError as exc:
            raise CommandError(f"Datos no válidos: {exc.details}") from None
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError("Ese email ya tiene cuenta: usa otro (las cuentas de staff no compran ni venden).")
        with transaction.atomic():
            admin = User.objects.create_user(
                email=email, password=password, display_name=name, platform_role=PlatformRole.ADMIN
            )
            record(
                "user_role_changed",
                actor_user_id=None,
                entity_type="user",
                entity_id=admin.pk,
                data={"from": None, "to": "admin", "reason": "bootstrap_admin"},
            )
        self.stdout.write(self.style.SUCCESS(f"Admin creado: {email}"))
