"""Endpoints de moderación (LX-77) y administración (LX-79) (CONTRATO-API-INICIAL.md §Moderación, §Administración).

Cada vista declara su capacidad de staff; el servicio vuelve a validar el rol y las reglas (T20).
Salida con lista blanca: nunca máximos proxy ni ofertas selladas sin revelar.
"""

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auctions.domain.money import to_str
from apps.core.capabilities import Cap
from apps.core.pagination import StandardPagination
from apps.core.permissions import ByMethod, HasCapability
from apps.core.serializers import StrictInputMixin
from apps.moderation.services import staff

# --- Entradas -------------------------------------------------------------------------------------


class ReasonInput(StrictInputMixin, serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=300)


class ResolveReportInput(StrictInputMixin, serializers.Serializer):
    status = serializers.ChoiceField(choices=["dismissed", "actioned"])
    note = serializers.CharField(min_length=3, max_length=300)
    action = serializers.ChoiceField(choices=["none", "cancel_auction", "suspend_user"], default="none")


class RoleChangeInput(StrictInputMixin, serializers.Serializer):
    platform_role = serializers.ChoiceField(choices=["user", "moderator", "admin"])
    reason = serializers.CharField(min_length=3, max_length=300)
    password = serializers.CharField(max_length=128, write_only=True, trim_whitespace=False)


class CategoryCreateInput(StrictInputMixin, serializers.Serializer):
    name = serializers.CharField(max_length=60)
    slug = serializers.CharField(max_length=60)


class CategoryUpdateInput(StrictInputMixin, serializers.Serializer):
    name = serializers.CharField(max_length=60, required=False)
    is_active = serializers.BooleanField(required=False)


def _valid(serializer_class, data, **kwargs) -> dict:
    serializer = serializer_class(data=data, **kwargs)
    serializer.is_valid(raise_exception=True)
    return dict(serializer.validated_data)


def _paginate(view, request, qs, render):
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request, view=view)
    return paginator.get_paginated_response([render(item) for item in page])


# --- Salidas ----------------------------------------------------------------------------------------


def user_row(u) -> dict:
    """Staff ve el email (matriz de visibilidad); nunca la contraseña."""
    return {
        "id": str(u.pk),
        "email": u.email,
        "display_name": u.display_name,
        "platform_role": u.platform_role,
        "status": u.status,
        "status_reason": u.status_reason,
        "created_at": u.created_at,
        "last_login": u.last_login,
    }


def report_row(r) -> dict:
    return {
        "id": str(r.pk),
        "target_type": r.target_type,
        "target_id": str(r.target_id),
        "reason": r.reason,
        "detail": r.detail,
        "status": r.status,
        "reporter": {"id": str(r.reporter_user_id), "display_name": r.reporter_user.display_name},
        "resolution_note": r.resolution_note,
        "created_at": r.created_at,
        "resolved_at": r.resolved_at,
    }


def event_row(e) -> dict:
    return {
        "id": e.pk,
        "occurred_at": e.occurred_at,
        "actor_user_id": str(e.actor_user_id) if e.actor_user_id else None,
        "action": e.action,
        "entity_type": e.entity_type,
        "entity_id": str(e.entity_id) if e.entity_id else None,
        "auction_id": str(e.auction_id) if e.auction_id else None,
        "request_id": e.request_id,
        "data": e.data,
    }


# --- Moderación -----------------------------------------------------------------------------------------


class ModerationSummaryView(APIView):
    permission_classes = [HasCapability(Cap.MODERATION_REVIEW_REPORTS)]

    def get(self, request):
        return Response(staff.summary())


class ReportListView(APIView):
    permission_classes = [HasCapability(Cap.MODERATION_REVIEW_REPORTS)]

    @extend_schema(parameters=[OpenApiParameter("status", str, required=False)])
    def get(self, request):
        return _paginate(self, request, staff.reports(request.query_params.get("status")), report_row)


class ReportResolveView(APIView):
    permission_classes = [HasCapability(Cap.MODERATION_REVIEW_REPORTS)]

    @extend_schema(request=ResolveReportInput)
    def post(self, request, report_id):
        report = staff.resolve_report(request.user, report_id, **_valid(ResolveReportInput, request.data))
        report.reporter_user = report.reporter_user  # carga perezosa para la salida
        return Response(report_row(report))


class ModerationAuctionView(APIView):
    permission_classes = [HasCapability(Cap.MODERATION_VIEW_AUCTION_INTERNALS)]

    def get(self, request, auction_id):
        data = staff.auction_internals(auction_id)
        a = data["auction"]
        return Response(
            {
                "auction": {
                    "id": str(a.pk),
                    "mechanism": a.mechanism,
                    "closing_policy": a.closing_policy,
                    "status": a.status,
                    "outcome": a.outcome,
                    "owner": {"id": str(a.owner_user_id), "display_name": a.owner_user.display_name},
                    "current_price": None
                    if a.mechanism == "sealed" and a.status != "closed"
                    else to_str(a.current_price),
                    "reserve_price": to_str(a.reserve_price),  # staff: siempre (matriz)
                    "bid_count": None if a.mechanism == "sealed" else a.bid_count,
                    "active_offer_count": a.active_offer_count if a.mechanism == "sealed" else None,
                    "starts_at": a.starts_at,
                    "ends_at": a.ends_at,
                    "winner_user_id": str(a.winner_user_id) if a.winner_user_id else None,
                    "final_price": to_str(a.final_price),
                    "cancel_reason": a.cancel_reason,
                },
                "bids": [
                    {
                        "seq": b.seq,
                        "amount": to_str(b.amount),
                        "source": b.source,
                        "accepted_at": b.accepted_at,
                        "counted": b.counted,
                        "bidder": {"id": str(b.bidder_user_id), "display_name": b.bidder_user.display_name},
                    }
                    for b in data["bids"]
                ],
                "audit_events": [event_row(e) for e in data["events"]],
            }
        )


class ModerationCancelView(APIView):
    permission_classes = [HasCapability(Cap.MODERATION_CANCEL_AUCTION)]

    @extend_schema(request=ReasonInput)
    def post(self, request, auction_id):
        auction = staff.cancel_auction(request.user, auction_id, **_valid(ReasonInput, request.data))
        return Response({"id": str(auction.pk), "status": auction.status, "cancel_reason": auction.cancel_reason})


class ModerationUserView(APIView):
    permission_classes = [HasCapability(Cap.MODERATION_SUSPEND_USER)]

    def get(self, request, user_id):
        data = staff.user_file(user_id)
        return Response(
            {
                "user": user_row(data["user"]),
                "auctions_owned": data["auctions_owned"],
                "bids_placed": data["bids_placed"],
                "reports_received": data["reports_received"],
                "reports_made": data["reports_made"],
                "recent_events": [event_row(e) for e in data["recent_events"]],
            }
        )


class SuspendUserView(APIView):
    permission_classes = [HasCapability(Cap.MODERATION_SUSPEND_USER)]

    @extend_schema(request=ReasonInput)
    def post(self, request, user_id):
        return Response(user_row(staff.suspend_user(request.user, user_id, **_valid(ReasonInput, request.data))))


# --- Administración -----------------------------------------------------------------------------------------


class AdminUserListView(APIView):
    permission_classes = [HasCapability(Cap.ADMIN_MANAGE_USERS)]

    @extend_schema(parameters=[OpenApiParameter(n, str, required=False) for n in ("q", "role", "status")])
    def get(self, request):
        p = request.query_params
        qs = staff.search_users(q=p.get("q", ""), role=p.get("role", ""), status=p.get("status", ""))
        return _paginate(self, request, qs, user_row)


class ReactivateUserView(APIView):
    permission_classes = [HasCapability(Cap.ADMIN_MANAGE_USERS)]

    @extend_schema(request=ReasonInput)
    def post(self, request, user_id):
        return Response(user_row(staff.reactivate_user(request.user, user_id, **_valid(ReasonInput, request.data))))


class ChangeRoleView(APIView):
    permission_classes = [HasCapability(Cap.ADMIN_MANAGE_USERS)]

    @extend_schema(request=RoleChangeInput)
    def post(self, request, user_id):
        return Response(user_row(staff.change_role(request.user, user_id, **_valid(RoleChangeInput, request.data))))


class AdminCategoryListView(APIView):
    permission_classes = [
        ByMethod(GET=HasCapability(Cap.ADMIN_MANAGE_CATEGORIES), POST=HasCapability(Cap.ADMIN_MANAGE_CATEGORIES))
    ]

    def get(self, request):
        from apps.catalog.models import Category

        return Response(
            [
                {"id": c.pk, "name": c.name, "slug": c.slug, "is_active": c.is_active}
                for c in Category.objects.order_by("name")
            ]
        )

    @extend_schema(request=CategoryCreateInput)
    def post(self, request):
        c = staff.create_category(request.user, **_valid(CategoryCreateInput, request.data))
        return Response({"id": c.pk, "name": c.name, "slug": c.slug, "is_active": c.is_active}, status=201)


class AdminCategoryDetailView(APIView):
    permission_classes = [HasCapability(Cap.ADMIN_MANAGE_CATEGORIES)]

    @extend_schema(request=CategoryUpdateInput)
    def patch(self, request, category_id):
        c = staff.update_category(request.user, category_id, **_valid(CategoryUpdateInput, request.data, partial=True))
        return Response({"id": c.pk, "name": c.name, "slug": c.slug, "is_active": c.is_active})


class AuditEventListView(APIView):
    permission_classes = [HasCapability(Cap.ADMIN_VIEW_AUDIT)]

    @extend_schema(
        parameters=[
            OpenApiParameter(n, str, required=False) for n in ("auction_id", "actor_id", "action", "from", "to")
        ]
    )
    def get(self, request):
        p = request.query_params
        try:
            qs = staff.audit_events(
                auction_id=p.get("auction_id") or None,
                actor_id=p.get("actor_id") or None,
                action=p.get("action") or None,
                date_from=serializers.DateTimeField().to_internal_value(p["from"]) if p.get("from") else None,
                date_to=serializers.DateTimeField().to_internal_value(p["to"]) if p.get("to") else None,
            )
            return _paginate(self, request, qs, event_row)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"filters": exc.detail}) from None


class SystemHealthView(APIView):
    permission_classes = [HasCapability(Cap.ADMIN_VIEW_SYSTEM_HEALTH)]

    def get(self, request):
        return Response(staff.system_health(), status=status.HTTP_200_OK)
