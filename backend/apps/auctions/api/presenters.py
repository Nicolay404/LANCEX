"""Respuestas por audiencia con lista blanca explícita (CONTRATO-API-INICIAL.md, matriz de visibilidad).

Ningún campo del modelo sale si no está escrito aquí. Datos privados:
- `reserve_price`: solo dueño y staff. El resto ve `has_reserve` y `reserve_met`.
- Identidades de postores: seudónimos; el dueño las ve tras el cierre; staff siempre.
- `candle_seed` / `candle_close_at`: nunca antes del cierre (Fase 6).
- Sobre cerrado antes del cierre: `current_price`, `bid_count` y `reserve_met` en null para todos
  (también el dueño); solo `active_offer_count`. Después: ranking según audiencia.
"""

from __future__ import annotations

from datetime import datetime

from apps.auctions.domain import registry
from apps.auctions.domain.mechanisms.sealed import SealedFirstPrice
from apps.auctions.domain.money import to_str
from apps.auctions.domain.state import BidRecord, Status
from apps.auctions.models import Auction, SealedOffer
from apps.auctions.services import bidding, queries, sealed
from apps.auctions.services.snapshot import Effective
from apps.core.capabilities import Cap, CapabilitySet

_NO_CAPS = CapabilitySet(principal=None, global_caps=frozenset(), by_organization={})


def _uid(user) -> str | None:
    return str(user.pk) if user is not None and user.is_authenticated else None


def is_owner(auction: Auction, user) -> bool:
    return _uid(user) == str(auction.owner_user_id)


def is_staff_viewer(caps: CapabilitySet) -> bool:
    return caps.has(Cap.MODERATION_VIEW_AUCTION_INTERNALS)


def minimum_next_bid(ev: Effective):
    if ev.status not in (Status.SCHEDULED, Status.ACTIVE) or ev.state.config.mechanism not in registry.MECHANISMS:
        return None
    return registry.mechanism_for(ev.state).minimum_next_bid(ev.state)


def is_sealed(auction: Auction) -> bool:
    return auction.mechanism == "sealed"


def sealed_revealed(auction: Auction) -> bool:
    """Las ofertas solo se revelan al MATERIALIZAR el cierre (no basta con que el tiempo haya pasado)."""
    return is_sealed(auction) and auction.status == Status.CLOSED


def _counters(auction: Auction) -> dict:
    """Única fuente de precio y contadores visibles (canales laterales, T07)."""
    if not is_sealed(auction):
        return {"current_price": auction.current_price, "bid_count": auction.bid_count, "active_offer_count": None}
    return {
        "current_price": auction.final_price if sealed_revealed(auction) else None,
        "bid_count": None,  # en sellado es el contador interno de versiones: nunca se publica
        "active_offer_count": auction.active_offer_count,
    }


def reserve_info(auction: Auction) -> dict:
    has_reserve = auction.reserve_price is not None
    price = _counters(auction)["current_price"]
    met = None
    if has_reserve and (not is_sealed(auction) or sealed_revealed(auction)):
        met = price is not None and price >= auction.reserve_price
    return {"has_reserve": has_reserve, "reserve_met": met}


def summary(auction: Auction, ev: Effective) -> dict:
    listing = auction.listing
    return {
        "id": str(auction.pk),
        "mechanism": auction.mechanism,
        "closing_policy": auction.closing_policy,
        "status": ev.status,
        "result_pending": ev.result_pending,
        "title": listing.title if listing else None,
        "category": {"id": listing.category_id, "name": listing.category.name} if listing else None,
        "currency": auction.currency,
        "current_price": to_str(_counters(auction)["current_price"]),
        "minimum_next_bid": to_str(minimum_next_bid(ev)),
        "bid_count": _counters(auction)["bid_count"],
        "active_offer_count": _counters(auction)["active_offer_count"],
        "starts_at": auction.starts_at,
        "ends_at": auction.ends_at,
    }


def detail(auction: Auction, ev: Effective, now: datetime, user, caps: CapabilitySet) -> dict:
    listing = auction.listing
    rating_avg, rating_count = queries.reputation(auction.owner_user_id)
    owner = is_owner(auction, user)
    data = {
        **summary(auction, ev),
        "proxy_enabled": auction.proxy_enabled,
        "description": listing.description if listing else None,
        "item_condition": listing.item_condition if listing else None,
        "location_city": listing.location_city if listing else None,
        "images": [],  # LX-70
        "seller": {
            "id": str(auction.owner_user_id),
            "display_name": auction.owner_user.display_name,
            "rating_avg": rating_avg,
            "rating_count": rating_count,
        },
        "starting_price": to_str(auction.starting_price),
        "min_increment": to_str(auction.min_increment),
        **reserve_info(auction),
        "soft_close": _soft_close(auction),
        "candle": None,  # Fase 6
        "server_time": now,
        "version": auction.version,
    }
    if owner or is_staff_viewer(caps):
        data["reserve_price"] = to_str(auction.reserve_price)
        data["published_at"] = auction.published_at
        data["cancel_reason"] = auction.cancel_reason
    if _uid(user):
        data["viewer"] = {
            "is_owner": owner,
            "is_leader": _uid(user) == (str(auction.leader_user_id) if auction.leader_user_id else None),
            "watching": queries.is_watching(user, auction.pk),
            "my_proxy_max": _my_proxy_max(auction, user),  # solo el máximo PROPIO
            "my_sealed_offer": _my_sealed_offer(auction, user),  # solo la oferta PROPIA
        }
    return data


def _soft_close(auction: Auction) -> dict | None:
    if auction.closing_policy != "soft_close":
        return None
    return {
        "window_s": auction.soft_close_window_s,
        "extension_s": auction.soft_close_extension_s,
        "max_total_s": auction.soft_close_max_total_s,
        "original_ends_at": auction.original_ends_at,
        "extended": bool(auction.original_ends_at and auction.ends_at and auction.ends_at > auction.original_ends_at),
    }


def _my_proxy_max(auction: Auction, user) -> str | None:
    if not auction.proxy_enabled:
        return None
    limit = bidding.own_proxy_limit(user, auction.pk)
    return to_str(limit.max_amount) if limit is not None and limit.status == "active" else None


def _my_sealed_offer(auction: Auction, user) -> str | None:
    if not is_sealed(auction):
        return None
    offer = sealed.own_offer(user, auction.pk)
    return to_str(offer.amount) if offer else None


def sealed_offer_view(auction: Auction, user) -> dict:
    offer = sealed.own_offer(user, auction.pk)
    return {
        "amount": to_str(offer.amount) if offer else None,
        "submitted_at": offer.submitted_at if offer else None,
        "active_offer_count": auction.active_offer_count,
    }


def sealed_ranking(auction: Auction, user, caps: CapabilitySet) -> list[dict]:
    """Tras el cierre: dueño y staff con identidad; participantes con seudónimos y "Tú"; resto, nada."""
    if not sealed_revealed(auction):
        return []
    viewer = _uid(user)
    all_offers = list(SealedOffer.objects.filter(auction_id=auction.pk).select_related("bidder_user").order_by("seq"))
    participated = viewer is not None and any(str(o.bidder_user_id) == viewer for o in all_offers)
    full = is_owner(auction, user) or is_staff_viewer(caps)
    if not (full or participated):
        return []
    names: dict[str, int] = {}
    for offer in all_offers:
        names.setdefault(str(offer.bidder_user_id), len(names) + 1)
    current = {o.seq: o for o in all_offers if o.is_current and o.status == "submitted"}
    records = [BidRecord(seq=o.seq, bidder_user_id=str(o.bidder_user_id), amount=o.amount) for o in current.values()]
    winner = str(auction.winner_user_id) if auction.winner_user_id else None
    items = []
    for rank, rec in enumerate(SealedFirstPrice.ranking(records), start=1):
        item = {
            "rank": rank,
            "amount": to_str(rec.amount),
            "submitted_at": current[rec.seq].submitted_at,
            "bidder": "Tú" if rec.bidder_user_id == viewer else f"Postor {names[rec.bidder_user_id]}",
            "is_winner": rec.bidder_user_id == winner,
        }
        if full:
            item["bidder_identity"] = {
                "id": rec.bidder_user_id,
                "display_name": current[rec.seq].bidder_user.display_name,
            }
        items.append(item)
    return items


def proxy_limit_view(auction: Auction, user) -> dict:
    limit = bidding.own_proxy_limit(user, auction.pk)
    return {
        "max_amount": to_str(limit.max_amount) if limit else None,
        "status": limit.status if limit else None,
        "is_leader": str(auction.leader_user_id) == _uid(user),
    }


def live(auction: Auction, ev: Effective, now: datetime, user) -> dict:
    return {
        "version": auction.version,
        "status": ev.status,
        "result_pending": ev.result_pending,
        "current_price": to_str(_counters(auction)["current_price"]),
        "minimum_next_bid": to_str(minimum_next_bid(ev)),
        "bid_count": _counters(auction)["bid_count"],
        "active_offer_count": _counters(auction)["active_offer_count"],
        "ends_at": auction.ends_at,
        "reserve_met": reserve_info(auction)["reserve_met"],
        "server_time": now,
        "viewer_is_leader": bool(_uid(user)) and _uid(user) == str(auction.leader_user_id),
    }


def live_etag(auction: Auction, ev: Effective, user) -> str:
    # El estado efectivo cambia con el reloj sin tocar `version`: va en el ETag.
    leader = int(bool(_uid(user)) and _uid(user) == str(auction.leader_user_id))
    return f'"{auction.version}-{ev.status}-{leader}"'


def bid_history(bids, auction: Auction, ev: Effective, user, caps: CapabilitySet) -> list[dict]:
    names = queries.pseudonyms(auction.pk)
    viewer = _uid(user)
    reveal = is_staff_viewer(caps) or (is_owner(auction, user) and ev.status == Status.CLOSED)
    items = []
    for bid in bids:
        bidder = str(bid.bidder_user_id)
        item = {
            "seq": bid.seq,
            "amount": to_str(bid.amount),
            "source": bid.source,
            "accepted_at": bid.accepted_at,
            "bidder": "Tú" if bidder == viewer else f"Postor {names.get(bidder, '?')}",
        }
        if reveal:
            item["bidder_identity"] = {"id": bidder, "display_name": bid.bidder_user.display_name}
        items.append(item)
    return items


def bid_accepted(result, user) -> dict:
    auction = result.auction
    bid = result.bid
    return {
        "bid": None
        if bid is None
        else {"seq": bid.seq, "amount": to_str(bid.amount), "source": bid.source, "accepted_at": bid.accepted_at},
        "auction": {
            "current_price": to_str(auction.current_price),
            "viewer_is_leader": str(auction.leader_user_id) == _uid(user),
            "version": auction.version,
            "ends_at": auction.ends_at,
        },
        "outbid_by_proxy": result.outbid_by_proxy,
    }


def result_view(auction: Auction, ev: Effective, user) -> dict:
    viewer = _uid(user)
    winner = str(auction.winner_user_id) if auction.winner_user_id else None
    owner = is_owner(auction, user)
    data = {
        "status": ev.status,
        "result_pending": ev.result_pending,
        "outcome": auction.outcome,
        "final_price": to_str(auction.final_price),
        "bid_count": _counters(auction)["bid_count"],
        "offer_count": auction.active_offer_count if is_sealed(auction) else None,
        "closed_at": auction.closed_at,
        "cancelled_at": auction.cancelled_at,
        **reserve_info(auction),
    }
    if viewer:
        data["viewer"] = {"is_owner": owner, "is_winner": viewer == winner}
        if sealed_revealed(auction):
            mine = [i["rank"] for i in sealed_ranking(auction, user, _NO_CAPS) if i["bidder"] == "Tú"]
            data["viewer"]["rank"] = mine[0] if mine else None
    # REGLAS §10: con `awarded`, dueño y ganador ven nombre y email del otro.
    if auction.outcome == "awarded" and viewer and (owner or viewer == winner):
        from apps.accounts.models import User

        other_id = winner if owner else str(auction.owner_user_id)
        other = User.objects.only("display_name", "email").get(pk=other_id)
        data["contact"] = {"display_name": other.display_name, "email": other.email}
    return data
