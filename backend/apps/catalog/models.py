"""Catálogo (MODELO-DE-DATOS-INICIAL.md §Catálogo). Tablas gestionadas por SQL: managed = False."""

import uuid
from enum import StrEnum

from django.conf import settings
from django.db import models

from apps.core.models import ClockTimestamp, choices_of


class ItemCondition(StrEnum):
    NEW = "new"
    USED = "used"
    REFURBISHED = "refurbished"


class Category(models.Model):
    id = models.SmallAutoField(primary_key=True)
    name = models.CharField(max_length=60)
    slug = models.SlugField(max_length=60, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = "category"

    def __str__(self) -> str:
        return self.name


class ListingQuerySet(models.QuerySet):
    def visible_to(self, user) -> "ListingQuerySet":
        """Las publicaciones solo las ve su dueño por esta vía (ADR-0006). El resto: 404."""
        if user is None or not user.is_authenticated:
            return self.none()
        return self.filter(owner_user_id=user.pk)


class Listing(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="owner_user_id", related_name="listings"
    )
    category = models.ForeignKey(Category, on_delete=models.DO_NOTHING, db_column="category_id", related_name="+")
    title = models.CharField(max_length=120)
    description = models.TextField()
    item_condition = models.CharField(max_length=20, choices=choices_of(ItemCondition))
    location_city = models.CharField(max_length=80)
    created_at = models.DateTimeField(db_default=ClockTimestamp())
    updated_at = models.DateTimeField(db_default=ClockTimestamp())

    objects = ListingQuerySet.as_manager()

    class Meta:
        managed = False
        db_table = "listing"

    def __str__(self) -> str:
        return self.title
