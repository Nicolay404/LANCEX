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
from apps.core.capabilities import Cap, compute
from apps.core.permissions import ByMethod, HasCapability, Public
from apps.core.time import time_source

from .serializers import (
    LoginInput,
    PasswordChangeInput,
    ProfileUpdateInput,
    RegisterInput,
    UserMeSerializer,
    build_user_me,
)


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
        data = _valid(ProfileUpdateInput, request)
        user = services.update_profile(request.user, **data)
        return user_me_response(user)


class PasswordView(APIView):
    permission_classes = [HasCapability(Cap.ACCOUNT_MANAGE_OWN)]

    @extend_schema(request=PasswordChangeInput, responses={204: None})
    def post(self, request):
        data = _valid(PasswordChangeInput, request)
        services.change_password(request, request.user, **data)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _valid(serializer_class, request) -> dict:
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data
