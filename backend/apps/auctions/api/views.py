"""Endpoints de subastas, Fase 2: ascendente con cierre fijo (CONTRATO-API-INICIAL.md §Subastas)."""

from __future__ import annotations

import uuid

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from apps.auctions.services import bidding, closing, lifecycle, queries
from apps.auctions.services.snapshot import evaluate
from apps.core.capabilities import Cap
from apps.core.errors import ValidationFailed
from apps.core.pagination import StandardPagination
from apps.core.permissions import ByMethod, HasCapability, Public, get_capabilities
from apps.core.time import time_source
from apps.notifications import services as notifications

from . import presenters
from .serializers import (
    AuctionCreateInput,
    AuctionUpdateInput,
    BidInput,
    CancelInput,
    ProxyLimitInput,
    validated,
)


class BidRateThrottle(ScopedRateThrottle):
    """30 pujas/min por usuario (ADR-0004). Solo escrituras: el historial no se limita aquí."""

    scope_attr = "bid_throttle_scope"

    def allow_request(self, request, view):
        if request.method not in ("POST", "PUT"):
            return True
        return super().allow_request(request, view)


def _detail_response(request, auction, status_code=status.HTTP_200_OK) -> Response:
    now = time_source.db_now()
    ev = evaluate(auction, now)
    return Response(presenters.detail(auction, ev, now, request.user, get_capabilities(request)), status=status_code)


class AuctionListView(APIView):
    permission_classes = [ByMethod(GET=Public, POST=HasCapability(Cap.AUCTION_CREATE_PERSONAL))]

    @extend_schema(
        parameters=[
            OpenApiParameter(name, str, required=False)
            for name in ("status", "mechanism", "category", "q", "ending_soon", "mine", "ordering")
        ]
    )
    def get(self, request):
        now = time_source.db_now()
        qs = queries.catalog(request.user, request.query_params, now)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([presenters.summary(a, evaluate(a, now)) for a in page])

    @extend_schema(request=AuctionCreateInput)
    def post(self, request):
        data = validated(AuctionCreateInput, request.data)
        auction = lifecycle.create_draft(request.user, **data)
        return _detail_response(request, queries.get_visible(request.user, auction.pk), status.HTTP_201_CREATED)


class AuctionDetailView(APIView):
    permission_classes = [ByMethod(GET=Public, PATCH=HasCapability(Cap.AUCTION_MANAGE_OWN))]

    def get(self, request, auction_id):
        return _detail_response(request, queries.get_visible(request.user, auction_id))

    @extend_schema(request=AuctionUpdateInput)
    def patch(self, request, auction_id):
        data = validated(AuctionUpdateInput, request.data, partial=True)
        lifecycle.update_auction(request.user, auction_id, **data)
        return _detail_response(request, queries.get_visible(request.user, auction_id))


class AuctionPublishView(APIView):
    permission_classes = [HasCapability(Cap.AUCTION_MANAGE_OWN)]

    @extend_schema(request=None)
    def post(self, request, auction_id):
        lifecycle.publish(request.user, auction_id)
        return _detail_response(request, queries.get_visible(request.user, auction_id))


class AuctionCancelView(APIView):
    permission_classes = [HasCapability(Cap.AUCTION_MANAGE_OWN)]

    @extend_schema(request=CancelInput)
    def post(self, request, auction_id):
        data = validated(CancelInput, request.data)
        lifecycle.cancel_by_owner(request.user, auction_id, **data)
        return _detail_response(request, queries.get_visible(request.user, auction_id))


class AuctionLiveView(APIView):
    """Polling ligero con ETag: si nada cambió, `304` sin cuerpo (ADR-0004 §4)."""

    permission_classes = [Public]

    def get(self, request, auction_id):
        auction = queries.get_visible(request.user, auction_id)
        now = time_source.db_now()
        ev = evaluate(auction, now)
        etag = presenters.live_etag(auction, ev, request.user)
        if request.headers.get("If-None-Match") == etag:
            response = Response(status=status.HTTP_304_NOT_MODIFIED)
        else:
            response = Response(presenters.live(auction, ev, now, request.user))
        response["ETag"] = etag
        response["Cache-Control"] = "no-cache"
        return response


class AuctionBidsView(APIView):
    permission_classes = [ByMethod(GET=Public, POST=HasCapability(Cap.BID_PLACE))]
    throttle_classes = [AnonRateThrottle, UserRateThrottle, BidRateThrottle]
    bid_throttle_scope = "bids"

    def get(self, request, auction_id):
        auction = queries.get_visible(request.user, auction_id)
        ev = evaluate(auction, time_source.db_now())
        qs = auction.bids.select_related("bidder_user").order_by("-seq")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        items = presenters.bid_history(page, auction, ev, request.user, get_capabilities(request))
        return paginator.get_paginated_response(items)

    @extend_schema(
        request=BidInput,
        parameters=[OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER, required=True)],
    )
    def post(self, request, auction_id):
        key = _idempotency_key(request)
        data = validated(BidInput, request.data)
        result = bidding.place_bid(request.user, auction_id, amount=data["amount"], idempotency_key=key)
        code = status.HTTP_200_OK if result.replayed else status.HTTP_201_CREATED
        return Response(presenters.bid_accepted(result, request.user), status=code)


class ProxyLimitView(APIView):
    """`GET|PUT /auctions/{id}/proxy-limit/`: solo el máximo PROPIO (matriz de visibilidad)."""

    permission_classes = [ByMethod(GET=HasCapability(Cap.PROXY_MANAGE_OWN), PUT=HasCapability(Cap.PROXY_MANAGE_OWN))]
    throttle_classes = [AnonRateThrottle, UserRateThrottle, BidRateThrottle]
    bid_throttle_scope = "bids"

    def get(self, request, auction_id):
        auction = queries.get_visible(request.user, auction_id)
        return Response(presenters.proxy_limit_view(auction, request.user))

    @extend_schema(request=ProxyLimitInput)
    def put(self, request, auction_id):
        data = validated(ProxyLimitInput, request.data)
        result = bidding.set_proxy_limit(request.user, auction_id, max_amount=data["max_amount"])
        auction = queries.get_visible(request.user, auction_id)
        body = {**presenters.bid_accepted(result, request.user), **presenters.proxy_limit_view(auction, request.user)}
        return Response(body)


class WatchView(APIView):
    """`PUT|DELETE /auctions/{id}/watch/`: seguir o dejar de seguir (idempotente)."""

    permission_classes = [
        ByMethod(PUT=HasCapability(Cap.WATCHLIST_MANAGE_OWN), DELETE=HasCapability(Cap.WATCHLIST_MANAGE_OWN))
    ]

    @extend_schema(request=None, responses={204: None})
    def put(self, request, auction_id):
        notifications.watch(request.user, auction_id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, auction_id):
        notifications.unwatch(request.user, auction_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AuctionResultView(APIView):
    """Resultado según audiencia. Si el cierre está pendiente, lo materializa (respaldo del job)."""

    permission_classes = [Public]

    def get(self, request, auction_id):
        auction = queries.get_visible(request.user, auction_id)
        now = time_source.db_now()
        ev = evaluate(auction, now)
        if ev.result_pending:
            closing.close_auction(auction.pk)
            auction = queries.get_visible(request.user, auction_id)
            ev = evaluate(auction, time_source.db_now())
        return Response(presenters.result_view(auction, ev, request.user))


def _idempotency_key(request) -> uuid.UUID:
    raw = request.headers.get("Idempotency-Key", "")
    try:
        key = uuid.UUID(raw)
    except ValueError:
        key = None
    if key is None or key.version != 4:
        raise ValidationFailed(details={"fields": {"Idempotency-Key": ["Cabecera obligatoria: UUID v4."]}})
    return key
