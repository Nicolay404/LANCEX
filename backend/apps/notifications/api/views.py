"""Notificaciones internas por polling (CONTRATO-API-INICIAL.md §Notificaciones)."""

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.capabilities import Cap
from apps.core.pagination import StandardPagination
from apps.core.permissions import HasCapability
from apps.notifications import services

from .serializers import MarkReadInput, NotificationSerializer


class NotificationListView(APIView):
    permission_classes = [HasCapability(Cap.NOTIFICATION_READ_OWN)]

    @extend_schema(parameters=[OpenApiParameter("unread", bool, required=False)])
    def get(self, request):
        qs = services.list_for(request.user, unread_only=request.query_params.get("unread") == "true")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(NotificationSerializer(page, many=True).data)


class NotificationReadView(APIView):
    permission_classes = [HasCapability(Cap.NOTIFICATION_READ_OWN)]

    @extend_schema(request=MarkReadInput)
    def post(self, request):
        serializer = MarkReadInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        updated = services.mark_read(request.user, ids=data.get("ids"), mark_all=data.get("all", False))
        return Response({"updated": updated})
