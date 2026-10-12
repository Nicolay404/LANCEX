"""URLConf raíz. Toda ruta vive bajo /api/v1/ (CONTRATO-API-INICIAL.md)."""

from django.urls import include, path

urlpatterns = [
    path("api/v1/", include("config.api_v1")),
]

handler400 = "apps.core.views.bad_request"
handler403 = "apps.core.views.permission_denied"
handler404 = "apps.core.views.page_not_found"
handler500 = "apps.core.views.server_error"
