"""Organizaciones B2B (MODELO-DE-DATOS-INICIAL.md). Tablas gestionadas por SQL: managed = False.

Se adelantan a LX-06 porque el cálculo de capacidades contextuales (LX-17) las necesita.
"""

import uuid

from django.conf import settings
from django.db import models
from django.db.models.functions import Now

from apps.core.capabilities import MembershipRole, MembershipStatus, VerificationStatus
from apps.core.models import choices_of


class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    legal_name = models.CharField(max_length=160)
    ruc = models.CharField(max_length=13, unique=True)
    is_buyer = models.BooleanField(default=False)
    is_supplier = models.BooleanField(default=False)
    verification_status = models.CharField(
        max_length=20, choices=choices_of(VerificationStatus), default=VerificationStatus.PENDING
    )
    verification_note = models.CharField(max_length=300, null=True, blank=True)
    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="created_by_user_id", related_name="+"
    )
    created_at = models.DateTimeField(db_default=Now())

    class Meta:
        managed = False
        db_table = "organization"

    def __str__(self) -> str:
        return self.legal_name


class OrganizationMembership(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.DO_NOTHING, db_column="organization_id", related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="user_id", related_name="memberships"
    )
    role = models.CharField(max_length=20, choices=choices_of(MembershipRole))
    status = models.CharField(max_length=20, choices=choices_of(MembershipStatus), default=MembershipStatus.ACTIVE)
    created_at = models.DateTimeField(db_default=Now())

    class Meta:
        managed = False
        db_table = "organization_membership"
        unique_together = [("organization", "user")]

    def __str__(self) -> str:
        return f"{self.user_id} @ {self.organization_id} ({self.role})"
