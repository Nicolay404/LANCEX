from django.urls import path

from . import views

urlpatterns = [
    path("organizations/", views.OrganizationCreateView.as_view(), name="organizations"),
    path("organizations/<uuid:organization_id>/", views.OrganizationDetailView.as_view(), name="organization-detail"),
    path("organizations/<uuid:organization_id>/members/", views.MemberAddView.as_view(), name="organization-members"),
    path(
        "organizations/<uuid:organization_id>/members/<uuid:user_id>/",
        views.MemberRevokeView.as_view(),
        name="organization-member",
    ),
    path(
        "organizations/<uuid:organization_id>/transfer-ownership/",
        views.TransferOwnershipView.as_view(),
        name="organization-transfer",
    ),
    path("moderation/organizations/", views.OrganizationReviewListView.as_view(), name="moderation-organizations"),
    path(
        "moderation/organizations/<uuid:organization_id>/",
        views.OrganizationReviewDetailView.as_view(),
        name="moderation-organization",
    ),
    path(
        "moderation/organizations/<uuid:organization_id>/decision/",
        views.OrganizationDecisionView.as_view(),
        name="moderation-organization-decision",
    ),
]
