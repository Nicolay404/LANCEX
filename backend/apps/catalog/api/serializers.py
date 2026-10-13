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


class UploadUrlInput(StrictInputMixin, serializers.Serializer):
    content_type = serializers.CharField(max_length=40)
    size_bytes = serializers.IntegerField(min_value=1)


class ImageConfirmInput(StrictInputMixin, serializers.Serializer):
    storage_path = serializers.CharField(max_length=200)
    position = serializers.IntegerField(min_value=0, max_value=5)


class RequirementInput(StrictInputMixin, serializers.Serializer):
    code = serializers.CharField(max_length=10)
    description = serializers.CharField(max_length=300)


class ProcurementRequestInput(StrictInputMixin, serializers.Serializer):
    organization_id = serializers.UUIDField()
    title = serializers.CharField(max_length=120)
    specifications = serializers.CharField(max_length=5000)
    quantity = serializers.CharField(max_length=20)  # texto decimal; el servicio valida hasta 3 decimales
    unit = serializers.CharField(max_length=20)
    mandatory_requirements = RequirementInput(many=True, required=False)
    delivery_deadline = serializers.DateField()
    delivery_location = serializers.CharField(max_length=120)


def procurement_payload(obj) -> dict:
    """Detalle público de una necesidad B2B."""
    return {
        "id": str(obj.pk),
        "buyer_organization": {"id": str(obj.buyer_organization_id), "legal_name": obj.buyer_organization.legal_name},
        "title": obj.title,
        "specifications": obj.specifications,
        "quantity": f"{obj.quantity:.3f}",
        "unit": obj.unit,
        "mandatory_requirements": obj.mandatory_requirements,
        "delivery_deadline": obj.delivery_deadline,
        "delivery_location": obj.delivery_location,
        "created_at": obj.created_at,
    }
