from django.urls import path

from . import staff_views as staff
from . import views

urlpatterns = [
    path("reports/", views.ReportCreateView.as_view(), name="reports"),
    # Moderación (LX-77)
    path("moderation/summary/", staff.ModerationSummaryView.as_view(), name="moderation-summary"),
    path("moderation/reports/", staff.ReportListView.as_view(), name="moderation-reports"),
    path("moderation/reports/<uuid:report_id>/resolve/", staff.ReportResolveView.as_view(), name="moderation-resolve"),
    path("moderation/auctions/<uuid:auction_id>/", staff.ModerationAuctionView.as_view(), name="moderation-auction"),
    path(
        "moderation/auctions/<uuid:auction_id>/cancel/", staff.ModerationCancelView.as_view(), name="moderation-cancel"
    ),
    path("moderation/users/<uuid:user_id>/", staff.ModerationUserView.as_view(), name="moderation-user"),
    path("moderation/users/<uuid:user_id>/suspend/", staff.SuspendUserView.as_view(), name="moderation-suspend"),
    # Administración (LX-79)
    path("admin/users/", staff.AdminUserListView.as_view(), name="admin-users"),
    path("admin/users/<uuid:user_id>/reactivate/", staff.ReactivateUserView.as_view(), name="admin-reactivate"),
    path("admin/users/<uuid:user_id>/role/", staff.ChangeRoleView.as_view(), name="admin-role"),
    path("admin/categories/", staff.AdminCategoryListView.as_view(), name="admin-categories"),
    path("admin/categories/<int:category_id>/", staff.AdminCategoryDetailView.as_view(), name="admin-category"),
    path("admin/audit-events/", staff.AuditEventListView.as_view(), name="admin-audit"),
    path("admin/system-health/", staff.SystemHealthView.as_view(), name="admin-health"),
]
