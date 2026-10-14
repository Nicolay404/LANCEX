"""Endpoints de subastas, Fase 2: ascendente con cierre fijo (CONTRATO-API-INICIAL.md §Subastas)."""

from __future__ import annotations

import uuid

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auctions.services import bidding, closing, lifecycle, participants, post_close, queries, sealed
from apps.auctions.services.snapshot import evaluate
from apps.core.capabilities import Cap, OrgCap
from apps.core.errors import Conflict, ValidationFailed
from apps.core.pagination import StandardPagination
from apps.core.permissions import ByMethod, HasAnyOrgCapability, HasCapability, Public, get_capabilities
from apps.core.throttling import AnonRateThrottle, BidRateThrottle, UserRateThrottle
from apps.core.time import time_source
from apps.notifications import services as notifications

from . import presenters
from .serializers import (
    AuctionCreateInput,
    AuctionUpdateInput,
    BidInput,
    CancelInput,
    ParticipantDecisionInput,
    ParticipantRegisterInput,
    ProxyLimitInput,
    RatingInput,
    ReverseOfferInput,
    SealedOfferInput,
    SettlementInput,
    validated,
)


def _detail_response(request, auction, status_code=status.HTTP_200_OK) -> Response:
    now = time_source.db_now()
    ev = evaluate(auction, now)
    return Response(presenters.detail(auction, ev, now, request.user, get_capabilities(request)), status=status_code)


class AuctionListView(APIView):
    permission_classes = [ByMethod(GET=Public, POST=HasCapability(Cap.AUCTION_CREATE_PERSONAL))]

    @extend_schema(
        parameters=[
            OpenApiParameter(name, str, required=False)
            for name in (
                "status",
                "mechanism",
                "category",
                "q",
                "ending_soon",
                "mine",
                "ordering",
                "seller",
                "organization",
            )
        ]
    )
    def get(self, request):
        now = time_source.db_now()
        params = request.query_params
        for key in ("seller", "organization"):
            if params.get(key):
                try:
                    uuid.UUID(params[key])
                except ValueError:
                    raise ValidationFailed(details={"fields": {key: ["UUID no válido."]}}) from None
        qs = queries.catalog(request.user, params, now)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        items = [presenters.summary(a, evaluate(a, now)) for a in page]
        if params.get("organization"):  # panel de la compradora: inscripciones pendientes por subasta
            pending = participants.pending_counts(a.pk for a in page)
            for item in items:
                if item["mechanism"] == "reverse":
                    item["registrations_pending"] = pending.get(item["id"], 0)
        return paginator.get_paginated_response(items)

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
        if presenters.is_sealed(auction):  # vacío antes del cierre; ranking por audiencia después
            items = presenters.sealed_ranking(auction, request.user, get_capabilities(request))
            return Response({"count": len(items), "next": None, "previous": None, "results": items})
        qs = auction.bids.select_related("bidder_user", "organization").order_by("-seq")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        history = presenters.reverse_history if presenters.is_reverse(auction) else presenters.bid_history
        items = history(page, auction, ev, request.user, get_capabilities(request))
        return paginator.get_paginated_response(items)

    @extend_schema(
        request=BidInput,
        parameters=[OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER, required=True)],
    )
    def post(self, request, auction_id):
        key = _idempotency_key(request)
        auction = queries.get_visible(request.user, auction_id)
        if presenters.is_reverse(auction):  # {unit_price, shipping_cost}: el servidor calcula el total
            data = validated(ReverseOfferInput, request.data)
            result = bidding.place_reverse_offer(request.user, auction_id, idempotency_key=key, **data)
        else:
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


class SealedOfferView(APIView):
    """`GET|PUT|DELETE /auctions/{id}/sealed-offer/`: solo la oferta PROPIA (REGLAS §6)."""

    permission_classes = [
        ByMethod(
            GET=HasCapability(Cap.SEALED_MANAGE_OWN),
            PUT=HasCapability(Cap.SEALED_MANAGE_OWN),
            DELETE=HasCapability(Cap.SEALED_MANAGE_OWN),
        )
    ]
    throttle_classes = [AnonRateThrottle, UserRateThrottle, BidRateThrottle]
    bid_throttle_scope = "bids"

    def get(self, request, auction_id):
        auction = queries.get_visible(request.user, auction_id)
        return Response(presenters.sealed_offer_view(auction, request.user))

    @extend_schema(
        request=SealedOfferInput,
        parameters=[OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER, required=True)],
    )
    def put(self, request, auction_id):
        key = _idempotency_key(request)
        data = validated(SealedOfferInput, request.data)
        result = sealed.submit_offer(request.user, auction_id, amount=data["amount"], idempotency_key=key)
        auction = queries.get_visible(request.user, auction_id)
        code = status.HTTP_200_OK if result.replayed else status.HTTP_201_CREATED
        return Response(presenters.sealed_offer_view(auction, request.user), status=code)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, auction_id):
        sealed.withdraw_offer(request.user, auction_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ParticipantsView(APIView):
    """`GET|POST /auctions/{id}/participants/`: compradora ve todas; proveedor, las de su organización."""

    permission_classes = [
        ByMethod(GET=HasAnyOrgCapability(OrgCap.ORG_VIEW), POST=HasAnyOrgCapability(OrgCap.REVERSE_REGISTER))
    ]

    def get(self, request, auction_id):
        auction, items, is_buyer = participants.visible_participants(request.user, auction_id)
        now = time_source.db_now()
        return Response({"results": [presenters.participant_payload(p, auction, now, full=is_buyer) for p in items]})

    @extend_schema(request=ParticipantRegisterInput)
    def post(self, request, auction_id):
        data = validated(ParticipantRegisterInput, request.data)
        data["compliance"] = [dict(c) for c in data["compliance"]]
        participant = participants.register(request.user, auction_id, **data)
        auction, items, _ = participants.visible_participants(request.user, auction_id)
        mine = next(p for p in items if p.pk == participant.pk)
        return Response(
            presenters.participant_payload(mine, auction, time_source.db_now(), full=False),
            status=status.HTTP_201_CREATED,
        )


class ParticipantDecisionView(APIView):
    """`POST /auctions/{id}/participants/{pid}/decision/`: miembro de la compradora, antes de starts_at."""

    permission_classes = [HasAnyOrgCapability(OrgCap.PARTICIPANTS_DECIDE)]

    @extend_schema(request=ParticipantDecisionInput)
    def post(self, request, auction_id, participant_id):
        data = validated(ParticipantDecisionInput, request.data)
        participants.decide(request.user, auction_id, participant_id, **data)
        auction, items, _ = participants.visible_participants(request.user, auction_id)
        decided = next(p for p in items if str(p.pk) == str(participant_id))
        return Response(presenters.participant_payload(decided, auction, time_source.db_now(), full=True))


class CandleProofView(APIView):
    """`GET /auctions/{id}/candle-proof/`: solo tras el cierre materializado (REGLAS §5)."""

    permission_classes = [Public]

    def get(self, request, auction_id):
        auction = queries.get_visible(request.user, auction_id)
        if auction.closing_policy != "candle":
            raise Conflict(code="MECHANISM_MISMATCH", message="Esta subasta no cierra por vela.")
        if not presenters.candle_revealed(auction):
            raise Conflict(code="NOT_REVEALED_YET", message="La semilla se revela al cierre.")
        return Response(presenters.candle_proof(auction))


class SettlementView(APIView):
    """`PATCH /auctions/{id}/settlement/`: el dueño (o la compradora) registra el resultado del trato."""

    permission_classes = [HasCapability(Cap.AUCTION_MANAGE_OWN)]

    @extend_schema(request=SettlementInput)
    def patch(self, request, auction_id):
        post_close.update_settlement(request.user, auction_id, **validated(SettlementInput, request.data))
        auction = queries.get_visible(request.user, auction_id)
        return Response({"settlement_status": auction.settlement_status, "settlement_note": auction.settlement_note})


class RatingView(APIView):
    """`POST /auctions/{id}/rating/`: dueño o ganador, una vez, con liquidación final."""

    permission_classes = [HasCapability(Cap.RATING_SUBMIT)]

    @extend_schema(request=RatingInput)
    def post(self, request, auction_id):
        rating = post_close.rate(request.user, auction_id, **validated(RatingInput, request.data))
        return Response({"id": str(rating.pk), "score": rating.score}, status=status.HTTP_201_CREATED)


class ReverseQuoteView(APIView):
    """`POST /auctions/{id}/reverse-quote/`: calcula el total con la fórmula oficial antes de ofertar.
    No crea nada; solo para que la sala muestre exactamente lo que calculará el servidor."""

    permission_classes = [HasAnyOrgCapability(OrgCap.REVERSE_REGISTER)]

    @extend_schema(request=ReverseOfferInput)
    def post(self, request, auction_id):
        from apps.auctions.domain import registry

        data = validated(ReverseOfferInput, request.data)
        auction = queries.get_visible(request.user, auction_id)
        if not presenters.is_reverse(auction):
            raise Conflict(code="MECHANISM_MISMATCH", message="Esta subasta no es inversa.")
        ev = evaluate(auction, time_source.db_now())
        mechanism = registry.mechanism_for(ev.state)
        total = mechanism.total_for(ev.state, data["unit_price"], data["shipping_cost"])
        maximum = mechanism.maximum_allowed(ev.state)
        return Response(
            {
                "total": f"{total:.2f}",
                "maximum_allowed": f"{maximum:.2f}",
                "within_maximum": total <= maximum,
                "formula": "ROUND_HALF_UP(unit_price × quantity + shipping_cost, 2)",
            }
        )


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
