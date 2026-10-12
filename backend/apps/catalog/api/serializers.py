"""Contratos de catálogo: entrada estricta y salida con lista blanca por audiencia."""

from rest_framework import serializers

from apps.catalog.models import ItemCondition
from apps.core.models import choices_of
from apps.core.serializers import StrictInputMixin


class CategorySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()


class CategoryRefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class ListingInput(StrictInputMixin, serializers.Serializer):
    category_id = serializers.IntegerField(min_value=1)
    title = serializers.CharField(max_length=120)
    description = serializers.CharField(max_length=5000)
    item_condition = serializers.ChoiceField(choices=choices_of(ItemCondition))
    location_city = serializers.CharField(max_length=80)


class ListingOwnerSerializer(serializers.Serializer):
    """Vista del dueño. Sin datos de otros usuarios."""

    id = serializers.UUIDField()
    category = CategoryRefSerializer()
    title = serializers.CharField()
    description = serializers.CharField()
    item_condition = serializers.CharField()
    location_city = serializers.CharField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    editable = serializers.BooleanField()
