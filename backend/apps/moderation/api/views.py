"""`POST /reports/` (CONTRATO-API-INICIAL.md §Reportes)."""

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.capabilities import Cap
from apps.core.permissions import HasCapability
from apps.moderation import services

from .serializers import ReportInput


class ReportCreateView(APIView):
    permission_classes = [HasCapability(Cap.REPORT_CREATE)]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "reports"

    @extend_schema(request=ReportInput)
    def post(self, request):
        serializer = ReportInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = services.create_report(request.user, **serializer.validated_data)
        return Response({"id": str(report.pk), "status": report.status}, status=status.HTTP_201_CREATED)
