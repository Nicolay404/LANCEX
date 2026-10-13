"""Entradas estrictas de subastas. Los importes llegan como texto y los valida el dominio."""

from rest_framework import serializers

from apps.auctions.domain.money import parse_amount
from apps.core.serializers import StrictInputMixin


class AmountField(serializers.Field):
    """Importe como string decimal. Lo valida el dominio: >2 decimales -> INVALID_AMOUNT_PRECISION."""

    def to_internal_value(self, data):
        return parse_amount(data, field=self.field_name)

    def to_representation(self, value):
        return f"{value:.2f}"


class AuctionCreateInput(StrictInputMixin, serializers.Serializer):
    mechanism = serializers.ChoiceField(choices=["ascending", "reverse", "sealed"])
    closing_policy = serializers.ChoiceField(choices=["fixed", "soft_close", "candle"])
    proxy_enabled = serializers.BooleanField(default=False)
    listing_id = serializers.UUIDField()
    starting_price = AmountField()
    min_increment = AmountField(required=False, allow_null=True)  # obligatorio en ascendente (lo valida el dominio)
    reserve_price = AmountField(required=False, allow_null=True)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    soft_close_window_s = serializers.IntegerField(required=False, allow_null=True)
    soft_close_extension_s = serializers.IntegerField(required=False, allow_null=True)
    soft_close_max_total_s = serializers.IntegerField(required=False, allow_null=True)


class AuctionUpdateInput(StrictInputMixin, serializers.Serializer):
    closing_policy = serializers.ChoiceField(choices=["fixed", "soft_close", "candle"], required=False)
    proxy_enabled = serializers.BooleanField(required=False)
    starting_price = AmountField(required=False)
    min_increment = AmountField(required=False)
    reserve_price = AmountField(required=False, allow_null=True)
    starts_at = serializers.DateTimeField(required=False)
    ends_at = serializers.DateTimeField(required=False)
    soft_close_window_s = serializers.IntegerField(required=False, allow_null=True)
    soft_close_extension_s = serializers.IntegerField(required=False, allow_null=True)
    soft_close_max_total_s = serializers.IntegerField(required=False, allow_null=True)
    title = serializers.CharField(max_length=120, required=False)
    description = serializers.CharField(max_length=5000, required=False)


class CancelInput(StrictInputMixin, serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=300)


class BidInput(StrictInputMixin, serializers.Serializer):
    amount = AmountField()


class ProxyLimitInput(StrictInputMixin, serializers.Serializer):
    max_amount = AmountField()


class SealedOfferInput(StrictInputMixin, serializers.Serializer):
    amount = AmountField()


def validated(serializer_class, data, **kwargs) -> dict:
    serializer = serializer_class(data=data, **kwargs)
    serializer.is_valid(raise_exception=True)
    return dict(serializer.validated_data)
