"""Comandos `seed_demo` (idempotente, solo DML) y `bootstrap_admin` (solo el primer admin)."""

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts.models import User
from apps.auctions.models import Auction
from apps.catalog.models import Listing

pytestmark = pytest.mark.django_db

DEMO_PASSWORD = "Demo-Local-Segura-2026"


def test_seed_demo_requires_password_and_is_idempotent(monkeypatch):
    monkeypatch.delenv("LANCEX_DEMO_PASSWORD", raising=False)
    with pytest.raises(CommandError):
        call_command("seed_demo")
    call_command("seed_demo", password=DEMO_PASSWORD)
    first = (Listing.objects.filter(title__startswith="[DEMO]").count(), Auction.objects.count())
    call_command("seed_demo", password=DEMO_PASSWORD)
    assert (Listing.objects.filter(title__startswith="[DEMO]").count(), Auction.objects.count()) == first
    mechanisms = set(Auction.objects.filter(status="scheduled").values_list("mechanism", "closing_policy"))
    assert {
        ("ascending", "fixed"),
        ("ascending", "soft_close"),
        ("sealed", "fixed"),
        ("ascending", "candle"),
        ("reverse", "fixed"),
    } <= mechanisms
    assert User.objects.get(email="admin@demo.lancex.test").platform_role == "admin"


def test_seed_demo_refuses_production(settings):
    settings.APP_ENV = "production"
    with pytest.raises(CommandError):
        call_command("seed_demo", password=DEMO_PASSWORD)


def test_bootstrap_admin_only_once():
    User.objects.filter(platform_role="admin").update(platform_role="user")
    call_command("bootstrap_admin", email="Root@Ejemplo.com", display_name="Raíz", password=DEMO_PASSWORD)
    assert User.objects.get(email="root@ejemplo.com").platform_role == "admin"
    with pytest.raises(CommandError):
        call_command("bootstrap_admin", email="otro@ejemplo.com", display_name="Otro", password=DEMO_PASSWORD)


def test_bootstrap_admin_rejects_weak_password():
    User.objects.filter(platform_role="admin").update(platform_role="user")
    with pytest.raises(CommandError):
        call_command("bootstrap_admin", email="debil@ejemplo.com", display_name="Débil", password="123")
