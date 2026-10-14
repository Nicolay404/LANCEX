"""Endpoints de autenticación y cuenta (CONTRATO-API-INICIAL.md §Autenticación y cuenta)."""

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts import services
from apps.accounts.principal import load_principal
from apps.accounts.services import mfa, recovery
from apps.core.capabilities import Cap, compute
from apps.core.permissions import ByMethod, HasCapability, Public
from apps.core.time import time_source

from .serializers import (
    AdminRecoveryInput,
    LoginInput,
    MfaCodeInput,
    MfaPasswordInput,
    MfaStepUpInput,
    PasswordChangeInput,
    PasswordResetConfirmInput,
    ProfileUpdateInput,
    RegisterInput,
    UserMeSerializer,
    build_user_me,
)

# Respuestas con secretos o códigos de un solo uso: que ningún intermediario las guarde.
NO_STORE = {"Cache-Control": "no-store"}


def user_me_response(user, status_code: int = status.HTTP_200_OK) -> Response:
    # Capacidades recalculadas desde la base para ESTE usuario (también justo tras login/registro).
    capabilities = compute(load_principal(user))
    data = build_user_me(user, capabilities, services.organizations_of(user), time_source.db_now())
    return Response(data, status=status_code)


class CsrfView(APIView):
    """`GET /auth/csrf/`: entrega la cookie `csrftoken` que el frontend envía en `X-CSRFToken`."""

    permission_classes = [Public]

    @extend_schema(responses={204: None})
    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(APIView):
    permission_classes = [Public]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    @extend_schema(request=RegisterInput, responses={201: UserMeSerializer})
    def post(self, request):
        data = _valid(RegisterInput, request)
        user = services.register(request, **data)
        return user_me_response(user, status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [Public]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    @extend_schema(request=LoginInput, responses={200: UserMeSerializer})
    def post(self, request):
        data = _valid(LoginInput, request)
        user = services.login(request, **data)
        if user is None:  # cuenta con 2FA: falta el segundo paso (`/auth/login/mfa/`)
            return Response({"mfa_required": True})
        return user_me_response(user)


class LoginMfaView(APIView):
    """`POST /auth/login/mfa/`: segundo paso del login con un código de la app o de respaldo."""

    permission_classes = [Public]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "mfa"

    @extend_schema(request=MfaCodeInput, responses={200: UserMeSerializer})
    def post(self, request):
        user = mfa.complete_login(request, **_valid(MfaCodeInput, request))
        return user_me_response(user)


class LogoutView(APIView):
    permission_classes = [HasCapability(Cap.ACCOUNT_MANAGE_OWN)]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        services.logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [
        ByMethod(GET=HasCapability(Cap.ACCOUNT_MANAGE_OWN), PATCH=HasCapability(Cap.ACCOUNT_MANAGE_OWN))
    ]

    @extend_schema(responses={200: UserMeSerializer})
    def get(self, request):
        return user_me_response(request.user)

    @extend_schema(request=ProfileUpdateInput, responses={200: UserMeSerializer})
    def patch(self, request):
        serializer = ProfileUpdateInput(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = services.update_profile(request.user, **serializer.validated_data)
        return user_me_response(user)


class PasswordView(APIView):
    permission_classes = [HasCapability(Cap.ACCOUNT_MANAGE_OWN)]

    @extend_schema(request=PasswordChangeInput, responses={204: None})
    def post(self, request):
        data = _valid(PasswordChangeInput, request)
        services.change_password(request, request.user, **data)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublicProfileView(APIView):
    """`GET /users/{id}/`: nombre visible y reputación. Nunca el email (matriz de visibilidad)."""

    permission_classes = [Public]

    def get(self, request, user_id):
        from apps.accounts.models import User
        from apps.auctions.services import queries
        from apps.core.errors import NotFound

        user = User.objects.filter(pk=user_id).only("id", "display_name", "created_at", "bio", "location_city").first()
        if user is None:
            raise NotFound()
        rating_avg, rating_count = queries.reputation(user.pk)
        return Response(
            {
                "id": str(user.pk),
                "display_name": user.display_name,
                "bio": user.bio,
                "location_city": user.location_city,
                "rating_avg": rating_avg,
                "rating_count": rating_count,
                "member_since": user.created_at,
            }
        )


class SessionsView(APIView):
    """`GET /auth/sessions/`: mis sesiones activas (sin claves). Seguridad de la cuenta (T12)."""

    permission_classes = [HasCapability(Cap.ACCOUNT_MANAGE_OWN)]

    def get(self, request):
        return Response({"results": services.sessions_of(request, request.user)})


class RevokeOtherSessionsView(APIView):
    """`POST /auth/sessions/revoke-others/`: cierra la sesión en los demás dispositivos."""

    permission_classes = [HasCapability(Cap.ACCOUNT_MANAGE_OWN)]

    @extend_schema(request=None)
    def post(self, request):
        return Response({"revoked": services.revoke_other_sessions(request, request.user)})


class MfaStatusView(APIView):
    """`GET /auth/mfa/`: si mi cuenta tiene 2FA y cuántos códigos de respaldo me quedan."""

    permission_classes = [HasCapability(Cap.ACCOUNT_MANAGE_OWN)]

    def get(self, request):
        return Response(mfa.status(request.user))


class MfaSetupView(APIView):
    """`POST /auth/mfa/setup/`: con mi contraseña, genera el secreto y la URI `otpauth://` del QR."""

    permission_classes = [HasCapability(Cap.ACCOUNT_MANAGE_OWN)]

    @extend_schema(request=MfaPasswordInput)
    def post(self, request):
        data = mfa.start_setup(request, request.user, **_valid(MfaPasswordInput, request))
        return Response(data, headers=NO_STORE)


class MfaEnableView(APIView):
    """`POST /auth/mfa/enable/`: confirma con un código y devuelve los códigos de respaldo (una vez)."""

    permission_classes = [HasCapability(Cap.ACCOUNT_MANAGE_OWN)]

    @extend_schema(request=MfaCodeInput)
    def post(self, request):
        codes = mfa.enable(request, request.user, **_valid(MfaCodeInput, request))
        return Response({"recovery_codes": codes}, status=status.HTTP_201_CREATED, headers=NO_STORE)


class MfaDisableView(APIView):
    """`POST /auth/mfa/disable/`: con contraseña + código (de la app o de respaldo)."""

    permission_classes = [HasCapability(Cap.ACCOUNT_MANAGE_OWN)]

    @extend_schema(request=MfaStepUpInput, responses={204: None})
    def post(self, request):
        mfa.disable(request.user, **_valid(MfaStepUpInput, request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class MfaRecoveryCodesView(APIView):
    """`POST /auth/mfa/recovery-codes/`: reemplaza los códigos de respaldo (los anteriores dejan de valer)."""

    permission_classes = [HasCapability(Cap.ACCOUNT_MANAGE_OWN)]

    @extend_schema(request=MfaStepUpInput)
    def post(self, request):
        codes = mfa.regenerate_recovery_codes(request.user, **_valid(MfaStepUpInput, request))
        return Response({"recovery_codes": codes}, headers=NO_STORE)


class PasswordResetConfirmView(APIView):
    """`POST /auth/password-reset/`: fija una contraseña nueva con el enlace que generó un admin."""

    permission_classes = [Public]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    @extend_schema(request=PasswordResetConfirmInput, responses={204: None})
    def post(self, request):
        recovery.confirm_password_reset(**_valid(PasswordResetConfirmInput, request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminPasswordResetView(APIView):
    """`POST /admin/users/{id}/password-reset/`: enlace de un solo uso (30 min) para entregar al usuario."""

    permission_classes = [HasCapability(Cap.ADMIN_MANAGE_USERS)]

    @extend_schema(request=AdminRecoveryInput)
    def post(self, request, user_id):
        data = recovery.issue_password_reset(request.user, user_id, **_valid(AdminRecoveryInput, request))
        return Response(data, status=status.HTTP_201_CREATED, headers=NO_STORE)


class AdminMfaResetView(APIView):
    """`POST /admin/users/{id}/mfa-reset/`: quita el 2FA a quien perdió el teléfono y los códigos."""

    permission_classes = [HasCapability(Cap.ADMIN_MANAGE_USERS)]

    @extend_schema(request=AdminRecoveryInput, responses={204: None})
    def post(self, request, user_id):
        recovery.reset_mfa(request.user, user_id, **_valid(AdminRecoveryInput, request))
        return Response(status=status.HTTP_204_NO_CONTENT)


def _valid(serializer_class, request) -> dict:
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data
