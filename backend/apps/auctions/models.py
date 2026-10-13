"""Subastas (MODELO-DE-DATOS-INICIAL.md §Subastas). Tablas gestionadas por SQL: managed = False.

Las columnas privadas (`reserve_price`, `candle_seed`, `candle_close_at`) existen en el modelo,
pero solo los serializadores por audiencia deciden si salen (matriz de visibilidad).
"""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.auctions.domain.state import Status
from apps.core.models import ClockTimestamp

PUBLIC_STATUSES = (Status.SCHEDULED, Status.ACTIVE, Status.CLOSED, Status.CANCELLED)


class AuctionQuerySet(models.QuerySet):
    def visible_to(self, user) -> "AuctionQuerySet":
        """Publicadas: todos. Borradores: solo su dueño (para el resto, 404)."""
        public = Q(status__in=PUBLIC_STATUSES)
        if user is None or not user.is_authenticated:
            return self.filter(public)
        return self.filter(public | Q(status=Status.DRAFT, owner_user_id=user.pk))


class Auction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="owner_user_id", related_name="+"
    )
    organization_id = models.UUIDField(null=True, blank=True)
    listing = models.ForeignKey(
        "catalog.Listing",
        on_delete=models.DO_NOTHING,
        db_column="listing_id",
        null=True,
        blank=True,
        related_name="auctions",
    )
    procurement_request_id = models.UUIDField(null=True, blank=True)
    mechanism = models.CharField(max_length=20)
    closing_policy = models.CharField(max_length=20)
    proxy_enabled = models.BooleanField(default=False)
    status = models.CharField(max_length=20, default=Status.DRAFT)
    outcome = models.CharField(max_length=20, null=True, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    starting_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    reserve_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)  # PRIVADO
    min_increment = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    reference_budget = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    min_decrement = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    original_ends_at = models.DateTimeField(null=True, blank=True)
    soft_close_window_s = models.IntegerField(null=True, blank=True)
    soft_close_extension_s = models.IntegerField(null=True, blank=True)
    soft_close_max_total_s = models.IntegerField(null=True, blank=True)
    candle_window_s = models.IntegerField(null=True, blank=True)
    candle_commitment = models.CharField(max_length=64, null=True, blank=True)
    candle_seed = models.BinaryField(null=True, blank=True)  # PRIVADO hasta el cierre
    candle_close_at = models.DateTimeField(null=True, blank=True)  # PRIVADO hasta el cierre
    rules_snapshot = models.JSONField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    current_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    leader_user_id = models.UUIDField(null=True, blank=True)
    leader_organization_id = models.UUIDField(null=True, blank=True)
    bid_count = models.IntegerField(default=0)
    active_offer_count = models.IntegerField(default=0)
    version = models.BigIntegerField(default=0)
    winner_user_id = models.UUIDField(null=True, blank=True)
    winner_organization_id = models.UUIDField(null=True, blank=True)
    final_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=300, null=True, blank=True)
    settlement_status = models.CharField(max_length=20, null=True, blank=True)
    settlement_note = models.CharField(max_length=300, null=True, blank=True)
    created_at = models.DateTimeField(db_default=ClockTimestamp())
    updated_at = models.DateTimeField(db_default=ClockTimestamp())

    objects = AuctionQuerySet.as_manager()

    class Meta:
        managed = False
        db_table = "auction"

    def __str__(self) -> str:
        return f"{self.mechanism}:{self.id}"


class Bid(models.Model):
    """Libro de pujas aceptadas. lancex_app solo puede INSERT/SELECT (y UPDATE de `counted`)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    auction = models.ForeignKey(Auction, on_delete=models.DO_NOTHING, db_column="auction_id", related_name="bids")
    seq = models.IntegerField()
    bidder_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="bidder_user_id", related_name="+"
    )
    organization_id = models.UUIDField(null=True, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    unit_price = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    shipping_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    source = models.CharField(max_length=10)
    proxy_limit_id = models.UUIDField(null=True, blank=True)
    idempotency_key = models.UUIDField(null=True, blank=True)
    accepted_at = models.DateTimeField(db_default=ClockTimestamp())
    counted = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = "bid"

    def __str__(self) -> str:
        return f"{self.auction_id}#{self.seq}"


class ProxyBidLimit(models.Model):
    """PRIVADO: máximo proxy de un usuario. Nunca se serializa salvo para su propio dueño."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    auction = models.ForeignKey(Auction, on_delete=models.DO_NOTHING, db_column="auction_id", related_name="+")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="user_id", related_name="+"
    )
    max_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, default="active")
    created_at = models.DateTimeField(db_default=ClockTimestamp())
    updated_at = models.DateTimeField(db_default=ClockTimestamp())

    class Meta:
        managed = False
        db_table = "proxy_bid_limit"

    def __str__(self) -> str:
        return f"proxy:{self.auction_id}:{self.user_id}:{self.status}"


class SealedOffer(models.Model):
    """PRIVADO hasta el cierre: ofertas de sobre cerrado (una vigente por participante)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    auction = models.ForeignKey(Auction, on_delete=models.DO_NOTHING, db_column="auction_id", related_name="+")
    bidder_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="bidder_user_id", related_name="+"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    seq = models.IntegerField()
    is_current = models.BooleanField(default=True)
    status = models.CharField(max_length=20, default="submitted")
    idempotency_key = models.UUIDField()
    submitted_at = models.DateTimeField(db_default=ClockTimestamp())
    revealed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "sealed_offer"

    def __str__(self) -> str:
        return f"sealed:{self.auction_id}#{self.seq}"


class JobHeartbeat(models.Model):
    """Último ciclo de `close_due_auctions` por laptop (`DEV_NAME`); alimenta la salud del admin."""

    dev = models.CharField(max_length=40, primary_key=True)
    job = models.CharField(max_length=40)
    last_run_at = models.DateTimeField()
    last_closed_count = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = "job_heartbeat"

    def __str__(self) -> str:
        return f"{self.dev}:{self.job}"
