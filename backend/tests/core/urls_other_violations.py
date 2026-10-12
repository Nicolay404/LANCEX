"""URLConf con el resto de violaciones: capacidad inexistente, get_permissions y vista no DRF."""

from django.urls import include, path

from .urls_test_views import DynamicPermissionsView, TypoView, plain_django_view

nested = [path("typo/", TypoView.as_view())]

urlpatterns = [
    path("api/v1/", include(nested)),
    path("api/v1/dynamic/", DynamicPermissionsView.as_view()),
    path("plain/", plain_django_view),
]
