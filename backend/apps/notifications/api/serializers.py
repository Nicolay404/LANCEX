from rest_framework import serializers

from apps.core.serializers import StrictInputMixin


class MarkReadInput(StrictInputMixin, serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, max_length=200)
    all = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if not attrs.get("all") and not attrs.get("ids"):
            raise serializers.ValidationError("Envía `ids` o `all: true`.")
        return attrs


class NotificationSerializer(serializers.Serializer):
    """Solo datos públicos del evento (lista blanca aplicada al crearla)."""

    id = serializers.IntegerField()
    type = serializers.CharField()
    auction_id = serializers.UUIDField(allow_null=True)
    data = serializers.DictField()
    created_at = serializers.DateTimeField()
    read_at = serializers.DateTimeField(allow_null=True)
