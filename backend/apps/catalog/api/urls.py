from django.urls import path

from . import views

urlpatterns = [
    path("categories/", views.CategoryListView.as_view(), name="categories"),
    path("listings/", views.ListingCreateView.as_view(), name="listing-create"),
    path("listings/<uuid:listing_id>/", views.ListingDetailView.as_view(), name="listing-detail"),
]
