"""URLConf con una vista sin permiso declarado: el check debe fallar (lancex.E001)."""

from django.urls import path

from .urls_test_views import PublicView, UndeclaredView

urlpatterns = [
    path("api/v1/public/", PublicView.as_view()),
    path("api/v1/forgotten/", UndeclaredView.as_view()),
]
