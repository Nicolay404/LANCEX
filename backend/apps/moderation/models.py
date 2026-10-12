"""Reportes de usuarios (MODELO-DE-DATOS-INICIAL.md §report). managed = False."""

import uuid
from enum import StrEnum

from django.conf import settings
from django.db import models

from apps.core.models import ClockTimestamp, choices_of


class TargetType(StrEnum):
    AUCTION = "auction"
    LISTING = "listing"
    USER = "user"


class Reason(StrEnum):
    FRAUD = "fraud"
    PROHIBITED_ITEM = "prohibited_item"
    MISLEADING = "misleading"
    OTHER = "other"


class Report(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reporter_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="reporter_user_id", related_name="+"
    )
    target_type = models.CharField(max_length=20, choices=choices_of(TargetType))
    target_id = models.UUIDField()
    reason = models.CharField(max_length=30, choices=choices_of(Reason))
    detail = models.CharField(max_length=500, default="")
    status = models.CharField(max_length=20, default="open")
    resolution_note = models.CharField(max_length=300, null=True, blank=True)
    resolved_by_user_id = models.UUIDField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(db_default=ClockTimestamp())

    class Meta:
        managed = False
        db_table = "report"

    def __str__(self) -> str:
        return f"{self.target_type}:{self.target_id} ({self.reason})"
