"""StrictInputMixin: rechaza campos desconocidos con UNKNOWN_FIELD (T03, T04)."""

import logging

import pytest
from rest_framework import serializers

from apps.core.errors import UnknownFieldError
from apps.core.serializers import StrictInputMixin


class ProfileInput(StrictInputMixin, serializers.Serializer):
    display_name = serializers.CharField(max_length=60)
    id = serializers.UUIDField(read_only=True)


class BidInput(StrictInputMixin, serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class WrapperInput(StrictInputMixin, serializers.Serializer):
    bid = BidInput()


def test_accepts_only_declared_writable_fields():
    s = ProfileInput(data={"display_name": "Ana"})
    assert s.is_valid(), s.errors
    assert s.validated_data == {"display_name": "Ana"}


def test_rejects_privilege_escalation_field():
    with pytest.raises(UnknownFieldError) as exc:
        ProfileInput(data={"display_name": "Ana", "platform_role": "admin"}).is_valid()
    assert exc.value.code == "UNKNOWN_FIELD"
    assert exc.value.status_code == 400
    assert exc.value.details == {"fields": ["platform_role"]}


def test_rejects_read_only_fields_instead_of_ignoring_them():
    with pytest.raises(UnknownFieldError) as exc:
        ProfileInput(data={"display_name": "Ana", "id": "00000000-0000-0000-0000-000000000000"}).is_valid()
    assert exc.value.details["fields"] == ["id"]


def test_rejects_server_computed_fields_on_bids():
    payload = {"amount": "1.00", "status": "accepted", "winner_user_id": "x"}
    with pytest.raises(UnknownFieldError) as exc:
        BidInput(data=payload).is_valid()
    assert exc.value.details["fields"] == ["status", "winner_user_id"]


def test_nested_serializers_are_strict_too():
    with pytest.raises(UnknownFieldError) as exc:
        WrapperInput(data={"bid": {"amount": "5.00", "seq": 1}}).is_valid()
    assert exc.value.details["fields"] == ["seq"]


def test_partial_update_is_still_strict():
    with pytest.raises(UnknownFieldError):
        ProfileInput(data={"is_active": False}, partial=True).is_valid()


def test_reported_field_names_are_bounded():
    payload = {f"{'x' * 100}{i}": 1 for i in range(50)}
    with pytest.raises(UnknownFieldError) as exc:
        BidInput(data=payload).is_valid()
    fields = exc.value.details["fields"]
    assert len(fields) == 20
    assert all(len(name) <= 64 for name in fields)


def test_rejection_is_logged_as_security_event_without_values(caplog):
    with caplog.at_level(logging.WARNING, logger="lancex.security"), pytest.raises(UnknownFieldError):
        ProfileInput(data={"display_name": "Ana", "platform_role": "admin"}).is_valid()
    record = next(r for r in caplog.records if getattr(r, "event", None) == "unknown_field_rejected")
    assert record.fields == ["platform_role"]
    assert "admin" not in caplog.text  # se registra el nombre del campo, no su valor


def test_regular_validation_errors_still_use_drf():
    s = BidInput(data={"amount": "abc"})
    assert not s.is_valid()
    assert "amount" in s.errors
