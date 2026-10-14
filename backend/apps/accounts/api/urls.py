from django.urls import path

from . import views

urlpatterns = [
    path("auth/csrf/", views.CsrfView.as_view(), name="auth-csrf"),
    path("auth/register/", views.RegisterView.as_view(), name="auth-register"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/login/mfa/", views.LoginMfaView.as_view(), name="auth-login-mfa"),
    path("auth/mfa/", views.MfaStatusView.as_view(), name="auth-mfa"),
    path("auth/mfa/setup/", views.MfaSetupView.as_view(), name="auth-mfa-setup"),
    path("auth/mfa/enable/", views.MfaEnableView.as_view(), name="auth-mfa-enable"),
    path("auth/mfa/disable/", views.MfaDisableView.as_view(), name="auth-mfa-disable"),
    path("auth/mfa/recovery-codes/", views.MfaRecoveryCodesView.as_view(), name="auth-mfa-recovery-codes"),
    path("auth/password-reset/", views.PasswordResetConfirmView.as_view(), name="auth-password-reset"),
    path(
        "admin/users/<uuid:user_id>/password-reset/",
        views.AdminPasswordResetView.as_view(),
        name="admin-password-reset",
    ),
    path("admin/users/<uuid:user_id>/mfa-reset/", views.AdminMfaResetView.as_view(), name="admin-mfa-reset"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("auth/password/", views.PasswordView.as_view(), name="auth-password"),
    path("auth/sessions/", views.SessionsView.as_view(), name="auth-sessions"),
    path("auth/sessions/revoke-others/", views.RevokeOtherSessionsView.as_view(), name="auth-sessions-revoke"),
    path("users/<uuid:user_id>/", views.PublicProfileView.as_view(), name="user-profile"),
]
