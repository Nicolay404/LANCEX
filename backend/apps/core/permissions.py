"""Permisos de DRF basados en capacidades (ADR-0006).

Uso en una vista (obligatorio declarar uno; el check lancex.E001 lo verifica):

    permission_classes = [Public]                                   # public = True
    permission_classes = [HasCapability(Cap.BID_PLACE)]             # required_capability
    permission_classes = [HasOrgCapability(OrgCap.AUCTION_CREATE_REVERSE)]
    permission_classes = [ByMethod(GET=Public, POST=HasCapability(Cap.LISTING_MANAGE_OWN))]

`DenyAll` es el permiso global por defecto: una vista que olvida declarar permiso no responde
a nadie, y además el arranque falla por el system check.
"""

from __future__ import annotations

import logging
import uuid
from typing import ClassVar

from django.conf import settings
from django.utils.module_loading import import_string
from rest_framework.permissions import BasePermission

from .capabilities import ANONYMOUS, CapabilitySet, Principal, compute

security_logger = logging.getLogger("lancex.security")

_CACHE_ATTR = "_lancex_capabilities"


# --- Cálculo por petición ----------------------------------------------------------------


def _load_principal(user) -> Principal:
    if user is None or not user.is_authenticated:
        return ANONYMOUS
    loader = import_string(settings.LANCEX_PRINCIPAL_LOADER)
    return loader(user)


def get_capabilities(request) -> CapabilitySet:
    """Capacidades de la petición, calculadas desde la base una sola vez por petición.

    Nunca se guardan en la sesión ni se aceptan del cliente: un cambio de rol o una
    suspensión surten efecto en la petición siguiente.
    """
    http_request = getattr(request, "_request", request)  # DRF Request -> HttpRequest
    cached = getattr(http_request, _CACHE_ATTR, None)
    if cached is None:
        cached = compute(_load_principal(getattr(request, "user", None)))
        setattr(http_request, _CACHE_ATTR, cached)
    return cached


def _deny(request, view, reason: str, **extra) -> bool:
    security_logger.warning(
        "Acceso denegado",
        extra={"event": "authz_denied", "reason": reason, "view": type(view).__name__, **extra},
    )
    return False


# --- Clases de permiso -------------------------------------------------------------------


class LancexPermission(BasePermission):
    """Base de los permisos declarativos. El check inspecciona estos atributos."""

    public: ClassVar[bool] = False
    required_capability: ClassVar[str | None] = None
    organization_scoped: ClassVar[bool] = False


class DenyAll(LancexPermission):
    """Permiso global por defecto: niega todo."""

    def has_permission(self, request, view) -> bool:
        return _deny(request, view, "no_permission_declared")


class Public(LancexPermission):
    """Endpoint accesible sin sesión (catálogo, login, registro...)."""

    public = True

    def has_permission(self, request, view) -> bool:
        return True


class _CapabilityPermission(LancexPermission):
    def has_permission(self, request, view) -> bool:
        if get_capabilities(request).has(self.required_capability):
            return True
        return _deny(request, view, "missing_capability", capability=self.required_capability)


class _OrgCapabilityPermission(LancexPermission):
    organization_scoped = True
    organization_param: ClassVar[str] = "organization_id"

    def has_permission(self, request, view) -> bool:
        org_id = self._organization_id(request, view)
        if org_id and get_capabilities(request).has_in_organization(self.required_capability, org_id):
            return True
        return _deny(request, view, "missing_org_capability", capability=self.required_capability)

    def _organization_id(self, request, view) -> str | None:
        raw = view.kwargs.get(self.organization_param)
        if raw is None:
            raw = request.query_params.get(self.organization_param)
        if raw is None and isinstance(request.data, dict):
            raw = request.data.get(self.organization_param)
        try:
            return str(uuid.UUID(str(raw))) if raw is not None else None
        except ValueError:
            return None


def HasCapability(capability: str) -> type[LancexPermission]:  # noqa: N802 - se usa como clase
    """Fábrica de permiso para una capacidad global."""
    return type(
        f"HasCapability[{capability}]",
        (_CapabilityPermission,),
        {"required_capability": str(capability)},
    )


def HasOrgCapability(capability: str, organization_param: str = "organization_id") -> type[LancexPermission]:  # noqa: N802
    """Fábrica de permiso para una capacidad contextual de organización.

    El `organization_id` se toma de la URL, de la query o del cuerpo; el servicio vuelve a
    validar la membresía dentro de su transacción.
    """
    return type(
        f"HasOrgCapability[{capability}]",
        (_OrgCapabilityPermission,),
        {"required_capability": str(capability), "organization_param": organization_param},
    )


class _ByMethodPermission(LancexPermission):
    method_permissions: ClassVar[dict[str, type[LancexPermission]]] = {}

    def has_permission(self, request, view) -> bool:
        permission_class = self.method_permissions.get(request.method)
        if permission_class is None:
            return _deny(request, view, "method_not_declared", method=request.method)
        return permission_class().has_permission(request, view)

    def has_object_permission(self, request, view, obj) -> bool:
        permission_class = self.method_permissions.get(request.method)
        return permission_class is not None and permission_class().has_object_permission(request, view, obj)


def ByMethod(**per_method: type[LancexPermission]) -> type[LancexPermission]:  # noqa: N802
    """Permiso distinto por método HTTP. Métodos no declarados se niegan.

    HEAD hereda de GET si no se declara. OPTIONS se niega salvo que se declare.
    """
    mapping = {method.upper(): perm for method, perm in per_method.items()}
    if "GET" in mapping:
        mapping.setdefault("HEAD", mapping["GET"])
    return type("ByMethod", (_ByMethodPermission,), {"method_permissions": mapping})
