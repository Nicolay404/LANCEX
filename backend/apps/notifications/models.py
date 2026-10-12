"""Notificaciones internas y seguimiento (MODELO-DE-DATOS-INICIAL.md). managed = False."""

from django.conf import settings
from django.db import models

from apps.core.models import ClockTimestamp


class NotificationQuerySet(models.QuerySet):
    def visible_to(self, user) -> "NotificationQuerySet":
        if user is None or not user.is_authenticated:
            return self.none()
        return self.filter(user_id=user.pk)


class Notification(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="user_id", related_name="+"
    )
    type = models.CharField(max_length=40)
    auction_id = models.UUIDField(null=True, blank=True)
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(db_default=ClockTimestamp())
    read_at = models.DateTimeField(null=True, blank=True)

    objects = NotificationQuerySet.as_manager()

    class Meta:
        managed = False
        db_table = "notification"

    def __str__(self) -> str:
        return f"{self.type}->{self.user_id}"


class Watchlist(models.Model):
    pk = models.CompositePrimaryKey("user_id", "auction_id")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="user_id", related_name="+"
    )
    auction = models.ForeignKey(
        "auctions.Auction", on_delete=models.DO_NOTHING, db_column="auction_id", related_name="+"
    )
    created_at = models.DateTimeField(db_default=ClockTimestamp())

    class Meta:
        managed = False
        db_table = "watchlist"

    def __str__(self) -> str:
        return f"{self.user_id} sigue {self.auction_id}"
