"""Consultas de subastas que otras apps necesitan (catálogo) sin depender de la capa api."""

from apps.auctions.domain.state import OPEN
from apps.auctions.models import Auction

# Estados persistidos no terminales (ROLES-Y-PERMISOS.md §4, REGLAS §9).
OPEN_AUCTION_STATUSES = tuple(sorted(OPEN))


def listing_has_open_auction(listing_id) -> bool:
    return Auction.objects.filter(listing_id=listing_id, status__in=OPEN_AUCTION_STATUSES).exists()
