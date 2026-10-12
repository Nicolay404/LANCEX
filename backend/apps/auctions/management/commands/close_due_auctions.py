"""Materializa el cierre de las subastas vencidas (ADR-0004 §5).

    python manage.py close_due_auctions            # una pasada
    python manage.py close_due_auctions --loop 5   # cada 5 s hasta Ctrl+C

Es seguro ejecutarlo en las tres laptops a la vez (SKIP LOCKED + cierre idempotente).
"""

import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from apps.auctions.services.closing import close_due_auctions


class Command(BaseCommand):
    help = "Cierra las subastas vencidas (idempotente, seguro en paralelo)."

    def add_arguments(self, parser):
        parser.add_argument("--loop", type=float, default=0, help="Segundos entre pasadas (0 = una sola).")

    def handle(self, *args, loop: float = 0, **options):
        while True:
            close_old_connections()
            closed = close_due_auctions()
            if closed or not loop:
                self.stdout.write(f"Subastas cerradas: {closed}")
            if not loop:
                return
            time.sleep(loop)  # pausa del bucle del job, no es hora de negocio
