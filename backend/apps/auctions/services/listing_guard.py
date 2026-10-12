"""Consultas de subastas que otras apps necesitan sin conocer el modelo `Auction`.

Hasta LX-06 (modelo `Auction` managed = False) se usa SQL parametrizado sobre `lancex.auction`.
Al llegar el modelo, se reemplaza por el ORM sin cambiar la firma.
"""

from django.db import connection

# Estados persistidos no terminales (ROLES-Y-PERMISOS.md §4, REGLAS §9).
OPEN_AUCTION_STATUSES = ("draft", "scheduled", "active")


def listing_has_open_auction(listing_id) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT EXISTS (SELECT 1 FROM auction WHERE listing_id = %s AND status = ANY(%s))",
            [listing_id, list(OPEN_AUCTION_STATUSES)],
        )
        return bool(cursor.fetchone()[0])
