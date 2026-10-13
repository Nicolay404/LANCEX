"""Entradas estrictas de subastas. Los importes llegan como texto y los valida el dominio."""

from rest_framework import serializers

from apps.auctions.domain.money import parse_amount, parse_non_negative_amount, parse_unit_price
from apps.core.serializers import StrictInputMixin


class AmountField(serializers.Field):
    """Importe como string decimal. Lo valida el dominio: >2 decimales -> INVALID_AMOUNT_PRECISION."""

    def to_internal_value(self, data):
        return parse_amount(data, field=self.field_name)

    def to_representation(self, value):
        return f"{value:.2f}"


class UnitPriceField(serializers.Field):
    """Precio unitario de la inversa: hasta 4 decimales."""

    def to_internal_value(self, data):
        return parse_unit_price(data, field=self.field_name)


class NonNegativeAmountField(serializers.Field):
    def to_internal_value(self, data):
        return parse_non_negative_amount(data, field=self.field_name)


class AuctionCreateInput(StrictInputMixin, serializers.Serializer):
    mechanism = serializers.ChoiceField(choices=["ascending", "reverse", "sealed"])
    closing_policy = serializers.ChoiceField(choices=["fixed", "soft_close", "candle"])
    proxy_enabled = serializers.BooleanField(default=False)
    listing_id = serializers.UUIDField(required=False)  # ascendente y sellada
    organization_id = serializers.UUIDField(required=False)  # inversa: compradora
    procurement_request_id = serializers.UUIDField(required=False)  # inversa: necesidad B2B
    reference_budget = AmountField(required=False, allow_null=True)
    min_decrement = AmountField(required=False, allow_null=True)
    starting_price = AmountField(required=False, allow_null=True)
    min_increment = AmountField(required=False, allow_null=True)  # obligatorio en ascendente (lo valida el dominio)
    reserve_price = AmountField(required=False, allow_null=True)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    soft_close_window_s = serializers.IntegerField(required=False, allow_null=True)
    soft_close_extension_s = serializers.IntegerField(required=False, allow_null=True)
    soft_close_max_total_s = serializers.IntegerField(required=False, allow_null=True)
    candle_window_s = serializers.IntegerField(required=False, allow_null=True)


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
    candle_window_s = serializers.IntegerField(required=False, allow_null=True)
    title = serializers.CharField(max_length=120, required=False)
    description = serializers.CharField(max_length=5000, required=False)


class ReverseOfferInput(StrictInputMixin, serializers.Serializer):
    unit_price = UnitPriceField()
    shipping_cost = NonNegativeAmountField()
    organization_id = serializers.UUIDField(required=False)


class ComplianceItemInput(StrictInputMixin, serializers.Serializer):
    code = serializers.CharField(max_length=10)
    complies = serializers.BooleanField()
    comment = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class ParticipantRegisterInput(StrictInputMixin, serializers.Serializer):
    organization_id = serializers.UUIDField()
    compliance = ComplianceItemInput(many=True)


class ParticipantDecisionInput(StrictInputMixin, serializers.Serializer):
    status = serializers.ChoiceField(choices=["admitted", "rejected"])
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


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
