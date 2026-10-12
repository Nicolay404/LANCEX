"""Envía un WARNING de prueba a Firestore para verificar la configuración (LX-05).

Uso: python manage.py emit_test_log
Incluye a propósito datos "sensibles" en `extra` y en el mensaje para comprobar en la consola
de Firebase que el documento llega SIN ellos.
"""

import logging

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.core.context import RequestContext, new_request_id, reset_context, set_context
from apps.core.logging.firestore import stop_firestore_logging

logger = logging.getLogger("lancex.diagnostics")


class Command(BaseCommand):
    help = "Envía un log WARNING de prueba a Firestore (verifica credenciales y filtro de datos sensibles)."

    def handle(self, *args, **options):
        if not settings.FIRESTORE_LOGS["ENABLED"]:
            self.stdout.write(self.style.WARNING("FIRESTORE_LOGS_ENABLED=false: solo se escribe en consola."))

        request_id = new_request_id()
        token = set_context(RequestContext(request_id=request_id, method="CLI", path="/manage/emit_test_log"))
        try:
            logger.warning(
                "Log de prueba de LX-05 enviado por usuario.prueba@example.com",
                extra={
                    "event": "diagnostic_test",
                    "password": "no-debe-llegar",
                    "max_amount": "999.99",
                    "error_code": "DIAGNOSTIC",
                },
            )
        finally:
            reset_context(token)
        stop_firestore_logging()  # vacía la cola y el lote pendiente antes de salir
        self.stdout.write(self.style.SUCCESS(f"Enviado. Busca request_id={request_id} en la colección."))
