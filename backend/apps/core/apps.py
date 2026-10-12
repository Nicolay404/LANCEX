import atexit

from django.apps import AppConfig
from django.conf import settings


class CoreConfig(AppConfig):
    name = "apps.core"
    label = "core"
    verbose_name = "LANCEX core"

    def ready(self) -> None:
        from . import checks  # noqa: F401 - registra lancex.E001..E004
        from .logging.firestore import start_firestore_logging, stop_firestore_logging

        if start_firestore_logging(settings.FIRESTORE_LOGS, dev=settings.DEV_NAME, env=settings.APP_ENV):
            atexit.register(stop_firestore_logging)
