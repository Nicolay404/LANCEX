"""Autenticación por sesión de Django con CSRF obligatorio en todo método mutable (ADR-0004, T13).

La `SessionAuthentication` de DRF solo valida CSRF si hay un usuario autenticado; así, login y
registro quedarían expuestos a *login CSRF*. Aquí se exige el token también a peticiones anónimas.
"""

from rest_framework.authentication import SessionAuthentication

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class CsrfSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        user = getattr(request._request, "user", None)
        if request.method not in SAFE_METHODS:
            self.enforce_csrf(request)
        if not user or not user.is_active:
            return None
        return (user, None)
