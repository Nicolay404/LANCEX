"""Auditoría de negocio append-only (ADR-0002, MODELO-DE-DATOS-INICIAL.md §audit_event).

`lancex_app` solo tiene INSERT y SELECT; un trigger rechaza UPDATE/DELETE. Por eso el modelo
tampoco ofrece save() sobre filas existentes ni delete().
"""

from django.db import models

from apps.core.models import ClockTimestamp


class AuditEvent(models.Model):
    id = models.BigAutoField(primary_key=True)
    occurred_at = models.DateTimeField(db_default=ClockTimestamp())
    actor_user_id = models.UUIDField(null=True, blank=True)
    action = models.CharField(max_length=60)
    entity_type = models.CharField(max_length=40)
    entity_id = models.UUIDField(null=True, blank=True)
    auction_id = models.UUIDField(null=True, blank=True)
    request_id = models.CharField(max_length=64, null=True, blank=True)
    data = models.JSONField(default=dict)

    class Meta:
        managed = False
        db_table = "audit_event"

    def __str__(self) -> str:
        return f"{self.action} {self.entity_type}:{self.entity_id}"

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise PermissionError("audit_event es append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("audit_event es append-only.")
