from django.urls import path

from . import views

urlpatterns = [
    path("auth/csrf/", views.CsrfView.as_view(), name="auth-csrf"),
    path("auth/register/", views.RegisterView.as_view(), name="auth-register"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("auth/password/", views.PasswordView.as_view(), name="auth-password"),
    path("auth/sessions/", views.SessionsView.as_view(), name="auth-sessions"),
    path("auth/sessions/revoke-others/", views.RevokeOtherSessionsView.as_view(), name="auth-sessions-revoke"),
    path("users/<uuid:user_id>/", views.PublicProfileView.as_view(), name="user-profile"),
]
