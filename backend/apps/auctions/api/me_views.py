"""Vistas personales: `/panel` (GET /me/summary/), `/mis-pujas` (GET /me/participations/) y el
registro de actividad (GET /me/activity/). Solo datos propios."""

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auctions.services import my_activity, participants
from apps.core.capabilities import Cap, OrgCap
from apps.core.pagination import StandardPagination
from apps.core.permissions import HasAnyOrgCapability, HasCapability
from apps.core.time import time_source

from . import presenters


class MySummaryView(APIView):
    permission_classes = [HasCapability(Cap.ACCOUNT_MANAGE_OWN)]

    def get(self, request):
        return Response(my_activity.summary(request.user))


class MyParticipationsView(APIView):
    permission_classes = [HasCapability(Cap.BID_PLACE)]

    @extend_schema(parameters=[OpenApiParameter("tab", str, required=False, enum=list(my_activity.TABS))])
    def get(self, request):
        items = my_activity.participations(request.user, request.query_params.get("tab", "active"))
        paginator = StandardPagination()
        return paginator.get_paginated_response(paginator.paginate_queryset(items, request, view=self))


class MyActivityView(APIView):
    permission_classes = [HasCapability(Cap.ACCOUNT_MANAGE_OWN)]

    def get(self, request):
        paginator = StandardPagination()
        page = paginator.paginate_queryset(my_activity.activity(request.user), request, view=self)
        titles = my_activity.auction_titles({str(e.auction_id) for e in page if e.auction_id})
        return paginator.get_paginated_response([my_activity.activity_row(e, titles) for e in page])


class OrganizationRegistrationsView(APIView):
    """`GET /organizations/{id}/registrations/`: inscripciones de mi organización proveedora."""

    permission_classes = [HasAnyOrgCapability(OrgCap.ORG_VIEW)]

    def get(self, request, organization_id):
        now = time_source.db_now()
        items = participants.registrations_of_organization(request.user, organization_id)
        return Response(
            {
                "results": [
                    {
                        **presenters.participant_payload(p, p.auction, now, full=False),
                        "auction": {
                            "id": str(p.auction_id),
                            "title": p.auction.procurement_request.title if p.auction.procurement_request else None,
                            "status": p.auction.status,
                            "starts_at": p.auction.starts_at,
                            "ends_at": p.auction.ends_at,
                        },
                    }
                    for p in items
                ]
            }
        )
