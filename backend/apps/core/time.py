"""Fuente única de la hora de negocio: el reloj de PostgreSQL (ADR-0004).

Los tres backends locales comparten la base; sus relojes pueden diferir y el del usuario es
manipulable (T09). Por eso ninguna regla usa `timezone.now()` ni `datetime.now()`: inicio,
cierre y aceptación de pujas se comparan contra `TimeSource.db_now()`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

from django.db import connections


class Clock(Protocol):
    """Puerto de reloj; los servicios lo reciben inyectado para poder probarse."""

    def db_now(self) -> datetime: ...


class TimeSource:
    """Adaptador PostgreSQL del puerto `Clock`."""

    def __init__(self, using: str = "default") -> None:
        self.using = using

    def db_now(self) -> datetime:
        """Instante real de PostgreSQL (`clock_timestamp()`), aunque haya una transacción abierta.

        Es la hora para aceptar pujas y decidir el estado efectivo (ADR-0005, paso 2).
        """
        return self._scalar("SELECT clock_timestamp()")

    def db_transaction_now(self) -> datetime:
        """Inicio de la transacción actual (`now()`): estable durante toda la transacción."""
        return self._scalar("SELECT now()")

    def _scalar(self, sql: str) -> datetime:
        with connections[self.using].cursor() as cursor:
            cursor.execute(sql)
            return cursor.fetchone()[0]


time_source = TimeSource()
