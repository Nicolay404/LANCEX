"""Contratos de entrada (estrictos) y salida (lista blanca) de autenticación y cuenta."""

from rest_framework import serializers

from apps.core.capabilities import CapabilitySet
from apps.core.serializers import StrictInputMixin

# --- Entrada ---------------------------------------------------------------------------


class RegisterInput(StrictInputMixin, serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    display_name = serializers.CharField(max_length=60)


class LoginInput(StrictInputMixin, serializers.Serializer):
    email = serializers.CharField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class ProfileUpdateInput(StrictInputMixin, serializers.Serializer):
    display_name = serializers.CharField(max_length=60)


class PasswordChangeInput(StrictInputMixin, serializers.Serializer):
    current_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


# --- Salida (UserMe: única fuente para construir la interfaz, ADR-0006) -----------------


class UserMeOrganizationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    legal_name = serializers.CharField()
    role = serializers.CharField()
    verification_status = serializers.CharField()
    is_buyer = serializers.BooleanField()
    is_supplier = serializers.BooleanField()
    capabilities = serializers.ListField(child=serializers.CharField())


class UserMeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    display_name = serializers.CharField()
    platform_role = serializers.CharField()
    capabilities = serializers.ListField(child=serializers.CharField())
    organizations = UserMeOrganizationSerializer(many=True)
    server_time = serializers.DateTimeField()


def build_user_me(user, capabilities: CapabilitySet, memberships, server_time) -> dict:
    organizations = [
        {
            "id": m.organization_id,
            "legal_name": m.organization.legal_name,
            "role": m.role,
            "verification_status": m.organization.verification_status,
            "is_buyer": m.organization.is_buyer,
            "is_supplier": m.organization.is_supplier,
            "capabilities": sorted(capabilities.by_organization.get(str(m.organization_id), ())),
        }
        for m in memberships
    ]
    return UserMeSerializer(
        {
            "id": user.pk,
            "email": user.email,
            "display_name": user.display_name,
            "platform_role": user.platform_role,
            "capabilities": sorted(capabilities.global_caps),
            "organizations": organizations,
            "server_time": server_time,
        }
    ).data
