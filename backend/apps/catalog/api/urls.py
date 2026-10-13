from django.urls import path

from . import views

urlpatterns = [
    path("categories/", views.CategoryListView.as_view(), name="categories"),
    path("listings/", views.ListingCreateView.as_view(), name="listing-create"),
    path("listings/<uuid:listing_id>/", views.ListingDetailView.as_view(), name="listing-detail"),
    path("listings/<uuid:listing_id>/images/upload-url/", views.ImageUploadUrlView.as_view(), name="image-upload-url"),
    path("listings/<uuid:listing_id>/images/", views.ImageConfirmView.as_view(), name="image-confirm"),
    path("listings/<uuid:listing_id>/images/<uuid:image_id>/", views.ImageDeleteView.as_view(), name="image-delete"),
    path("procurement-requests/", views.ProcurementRequestCreateView.as_view(), name="procurement-requests"),
    path(
        "procurement-requests/<uuid:request_id>/",
        views.ProcurementRequestDetailView.as_view(),
        name="procurement-request-detail",
    ),
]
