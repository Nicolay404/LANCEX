from django.urls import path

from . import views

urlpatterns = [
    path("reports/", views.ReportCreateView.as_view(), name="reports"),
]
