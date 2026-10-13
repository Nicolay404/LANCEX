"""Datos de demostración (LX-13, MODELO-DE-DATOS-INICIAL.md §Datos de demostración). Solo DML, idempotente.

    $env:LANCEX_DEMO_PASSWORD="..."; python manage.py seed_demo

Crea: categorías, 6 usuarios (4 `user`, 1 `moderator`, 1 `admin`), 2 organizaciones verificadas
(compradora y proveedora) y una subasta de cada modalidad con horarios relativos a la hora de
PostgreSQL. Todo pasa por los servicios (mismas reglas, auditoría y validaciones que la API).

- Se niega a correr con `APP_ENV=production`.
- Contraseña de las cuentas demo: `--password` o `LANCEX_DEMO_PASSWORD` (sin valor por defecto: la base
  es compartida y un admin con contraseña conocida sería un riesgo).
- Idempotente: si ya existen las subastas `[DEMO]`, no crea más.
"""

import os
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.auctions.services import lifecycle, participants
from apps.catalog.models import Category, Listing
from apps.catalog.services import procurement
from apps.core.capabilities import PlatformRole
from apps.core.time import time_source
from apps.organizations import services as organizations
from apps.organizations.models import Organization

CATEGORIES = [
    ("Vehículos", "vehiculos"),
    ("Tecnología", "tecnologia"),
    ("Hogar y muebles", "hogar-y-muebles"),
    ("Maquinaria y equipos", "maquinaria-y-equipos"),
    ("Arte y colección", "arte-y-coleccion"),
    ("Inmuebles", "inmuebles"),
    ("Insumos y suministros", "insumos-y-suministros"),
    ("Otros", "otros"),
]
USERS = [
    ("ana", "Ana Demo", PlatformRole.USER),
    ("beto", "Beto Demo", PlatformRole.USER),
    ("carla", "Carla Demo", PlatformRole.USER),
    ("diego", "Diego Demo", PlatformRole.USER),
    ("moderador", "Moderador Demo", PlatformRole.MODERATOR),
    ("admin", "Admin Demo", PlatformRole.ADMIN),
]
DOMAIN = "demo.lancex.test"
MARK = "[DEMO]"


class Command(BaseCommand):
    help = "Carga datos de demostración idempotentes (solo DML)."

    def add_arguments(self, parser):
        parser.add_argument("--password", default=None, help="Mejor por la variable LANCEX_DEMO_PASSWORD.")

    def handle(self, *args, password=None, **options):
        if getattr(settings, "APP_ENV", "local") == "production":
            raise CommandError("seed_demo no corre con APP_ENV=production.")
        password = password or os.environ.get("LANCEX_DEMO_PASSWORD")
        if not password:
            raise CommandError("Indica la contraseña demo con --password o LANCEX_DEMO_PASSWORD.")

        categories = self._categories()
        users = self._users(password)
        if Listing.objects.filter(title__startswith=MARK).exists():
            self.stdout.write("Las subastas [DEMO] ya existen: no se crean de nuevo.")
            return
        buyer_org, supplier_org = self._organizations(users)
        self._auctions(users, categories, buyer_org, supplier_org)
        self.stdout.write(
            self.style.SUCCESS("Datos demo listos. Usuarios: " + ", ".join(f"{u}@{DOMAIN}" for u, _, _ in USERS))
        )

    def _categories(self) -> dict[str, Category]:
        for name, slug in CATEGORIES:
            Category.objects.get_or_create(slug=slug, defaults={"name": name, "is_active": True})
        return {c.slug: c for c in Category.objects.all()}

    def _users(self, password: str) -> dict[str, User]:
        result = {}
        for key, name, role in USERS:
            email = f"{key}@{DOMAIN}"
            user = User.objects.filter(email=email).first()
            if user is None:
                user = User.objects.create_user(email=email, password=password, display_name=name, platform_role=role)
            result[key] = user
        return result

    def _organizations(self, users):
        moderator = users["moderador"]
        buyer = Organization.objects.filter(legal_name=f"{MARK} Compras Loja S.A.").first()
        if buyer is None:
            buyer = organizations.create_organization(
                users["carla"],
                legal_name=f"{MARK} Compras Loja S.A.",
                ruc="1790000000001",
                is_buyer=True,
                is_supplier=False,
            )
            organizations.decide_verification(moderator, buyer.pk, status="verified", note="Organización demo")
        supplier = Organization.objects.filter(legal_name=f"{MARK} Suministros del Sur").first()
        if supplier is None:
            supplier = organizations.create_organization(
                users["diego"],
                legal_name=f"{MARK} Suministros del Sur",
                ruc="1790000000002",
                is_buyer=False,
                is_supplier=True,
            )
            organizations.decide_verification(moderator, supplier.pk, status="verified", note="Organización demo")
        return buyer, supplier

    def _listing(self, owner, category, title, description, condition="used"):
        return Listing.objects.create(
            owner_user=owner,
            category=category,
            title=f"{MARK} {title}",
            description=description,
            item_condition=condition,
            location_city="Loja",
        )

    @transaction.atomic
    def _auctions(self, users, cats, buyer_org, supplier_org):
        now = time_source.db_now()
        ana, beto, carla = users["ana"], users["beto"], users["carla"]

        def create(owner, listing, **rules):
            rules.setdefault("starts_at", now - timedelta(minutes=1))
            rules.setdefault("ends_at", now + timedelta(hours=2))
            auction = lifecycle.create_draft(owner, listing_id=listing.pk, **rules)
            return lifecycle.publish(owner, auction.pk)

        create(
            ana,
            self._listing(ana, cats["tecnologia"], "Laptop ThinkPad T14", "16 GB RAM, SSD 512 GB"),
            mechanism="ascending",
            closing_policy="fixed",
            starting_price=Decimal("300.00"),
            min_increment=Decimal("10.00"),
            reserve_price=Decimal("450.00"),
        )
        create(
            ana,
            self._listing(ana, cats["vehiculos"], "Bicicleta de montaña", "Aro 29, poco uso"),
            mechanism="ascending",
            closing_policy="soft_close",
            proxy_enabled=True,
            starting_price=Decimal("120.00"),
            min_increment=Decimal("5.00"),
        )
        create(
            beto,
            self._listing(beto, cats["arte-y-coleccion"], "Cuadro al óleo", "Paisaje lojano, 60x80 cm"),
            mechanism="sealed",
            closing_policy="fixed",
            starting_price=Decimal("80.00"),
        )
        create(
            beto,
            self._listing(beto, cats["hogar-y-muebles"], "Juego de comedor", "Madera de cedro, 6 sillas"),
            mechanism="ascending",
            closing_policy="candle",
            candle_window_s=600,
            starting_price=Decimal("200.00"),
            min_increment=Decimal("10.00"),
            ends_at=now + timedelta(minutes=40),
        )

        need = procurement.create_request(
            carla,
            organization_id=buyer_org.pk,
            title=f"{MARK} Resmas de papel A4",
            specifications="Papel bond 75 g/m2, caja de 10 resmas",
            quantity="100.000",
            unit="caja",
            mandatory_requirements=[{"code": "R1", "description": "Entrega con factura electrónica"}],
            delivery_deadline=(now + timedelta(days=30)).date(),
            delivery_location="Loja, centro",
        )
        reverse = lifecycle.create_draft(
            carla,
            organization_id=buyer_org.pk,
            procurement_request_id=need.pk,
            mechanism="reverse",
            closing_policy="fixed",
            reference_budget=Decimal("2500.00"),
            min_decrement=Decimal("10.00"),
            starts_at=now + timedelta(minutes=30),
            ends_at=now + timedelta(hours=3),
        )
        lifecycle.publish(carla, reverse.pk)
        participants.register(
            users["diego"],
            reverse.pk,
            organization_id=supplier_org.pk,
            compliance=[{"code": "R1", "complies": True, "comment": "Emitimos factura electrónica"}],
        )
