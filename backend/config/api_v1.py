"""Rutas de la API v1.

Cada app expone sus rutas en `apps/<app>/api/urls.py` y se registra aquí. Toda ruta nueva:
- declara su permiso (`Public`, `HasCapability(...)` o `ByMethod(...)`); el check lancex.E001 lo exige;
- se agrega a `tests/security/endpoint_matrix.yaml` (QA-09).
"""

from django.conf import settings
from django.urls import path

from apps.core.views import SchemaView

urlpatterns: list = []

if settings.LANCEX_SERVE_SCHEMA:
    urlpatterns.append(path("schema/", SchemaView.as_view(), name="api-schema"))
