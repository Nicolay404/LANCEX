"""Vistas y URLConfs de prueba para permisos, check lancex.E001 y formato de errores."""

from django.http import HttpResponse
from django.urls import path
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.capabilities import Cap, OrgCap
from apps.core.errors import Conflict
from apps.core.permissions import ByMethod, HasCapability, HasOrgCapability, Public
from apps.core.serializers import StrictInputMixin


class OkView(APIView):
    def get(self, request, **kwargs):
        return Response({"ok": True})

    def post(self, request, **kwargs):
        return Response({"ok": True}, status=201)


class PublicView(OkView):
    permission_classes = [Public]


class BidView(OkView):
    permission_classes = [HasCapability(Cap.BID_PLACE)]


class AdminView(OkView):
    permission_classes = [HasCapability(Cap.ADMIN_VIEW_AUDIT)]


class OrgView(OkView):
    permission_classes = [HasOrgCapability(OrgCap.AUCTION_CREATE_REVERSE)]


class MixedView(OkView):
    permission_classes = [ByMethod(GET=Public, POST=HasCapability(Cap.LISTING_MANAGE_OWN))]


class UndeclaredView(OkView):
    """Sin permission_classes: hereda DenyAll."""


class TypoView(OkView):
    permission_classes = [HasCapability("bid.plcae")]


class DynamicPermissionsView(OkView):
    def get_permissions(self):
        return [Public()]


class ProfileInput(StrictInputMixin, serializers.Serializer):
    display_name = serializers.CharField(max_length=60)


class StrictView(APIView):
    permission_classes = [Public]

    def post(self, request):
        ProfileInput(data=request.data).is_valid(raise_exception=True)
        return Response(status=204)


class ConflictView(APIView):
    permission_classes = [Public]

    def get(self, request):
        raise Conflict(code="AUCTION_NOT_ACTIVE", message="Fuera de la ventana.", details={"status": "closed"})


class CrashView(APIView):
    permission_classes = [Public]

    def get(self, request):
        raise RuntimeError("SELECT secret FROM lancex.proxy_bid_limit")  # nunca debe salir al cliente


def plain_django_view(request):
    return HttpResponse("hola")


# URLConf válido (lo usan las pruebas HTTP).
urlpatterns = [
    path("api/v1/public/", PublicView.as_view()),
    path("api/v1/bids/", BidView.as_view()),
    path("api/v1/admin/audit/", AdminView.as_view()),
    path("api/v1/organizations/<uuid:organization_id>/reverse/", OrgView.as_view()),
    path("api/v1/listings/", MixedView.as_view()),
    path("api/v1/undeclared/", UndeclaredView.as_view()),
    path("api/v1/strict/", StrictView.as_view()),
    path("api/v1/conflict/", ConflictView.as_view()),
    path("api/v1/crash/", CrashView.as_view()),
]

handler404 = "apps.core.views.page_not_found"
handler500 = "apps.core.views.server_error"
