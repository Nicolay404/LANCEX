"""Contratos de organizaciones: entrada estricta y salida con lista blanca."""

from rest_framework import serializers

from apps.core.serializers import StrictInputMixin


class OrganizationCreateInput(StrictInputMixin, serializers.Serializer):
    legal_name = serializers.CharField(max_length=160)
    ruc = serializers.CharField(max_length=13)
    is_buyer = serializers.BooleanField()
    is_supplier = serializers.BooleanField()


class OrganizationUpdateInput(StrictInputMixin, serializers.Serializer):
    legal_name = serializers.CharField(max_length=160, required=False)
    ruc = serializers.CharField(max_length=13, required=False)
    is_buyer = serializers.BooleanField(required=False)
    is_supplier = serializers.BooleanField(required=False)


class MemberAddInput(StrictInputMixin, serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class TransferOwnershipInput(StrictInputMixin, serializers.Serializer):
    new_owner_user_id = serializers.UUIDField()
    password = serializers.CharField(max_length=128, write_only=True, trim_whitespace=False)


class VerificationDecisionInput(StrictInputMixin, serializers.Serializer):
    status = serializers.ChoiceField(choices=["verified", "rejected"])
    note = serializers.CharField(min_length=3, max_length=300)


def organization_payload(org, membership, members) -> dict:
    """Vista de miembro: sin emails de los demás (minimización de datos)."""
    return {
        "id": str(org.pk),
        "legal_name": org.legal_name,
        "ruc": org.ruc,
        "is_buyer": org.is_buyer,
        "is_supplier": org.is_supplier,
        "verification_status": org.verification_status,
        "verification_note": org.verification_note,
        "created_at": org.created_at,
        "my_role": membership.role,
        "members": [
            {
                "user_id": str(m.user_id),
                "display_name": m.user.display_name,
                "role": m.role,
                "status": m.status,
            }
            for m in members
        ],
    }


def review_payload(org) -> dict:
    return {
        "id": str(org.pk),
        "legal_name": org.legal_name,
        "ruc": org.ruc,
        "is_buyer": org.is_buyer,
        "is_supplier": org.is_supplier,
        "verification_status": org.verification_status,
        "verification_note": org.verification_note,
        "created_at": org.created_at,
        "created_by": {"id": str(org.created_by_user_id), "display_name": org.created_by_user.display_name},
    }
