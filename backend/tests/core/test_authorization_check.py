"""System check lancex.E001..E004 (ADR-0006): una vista sin permiso impide arrancar."""

import pytest
from django.core.management import call_command
from django.core.management.base import SystemCheckError
from django.test import override_settings

from apps.core.checks import authorization_check, check_view_permissions


def ids(errors):
    return sorted(e.id for e in errors)


def test_real_urlconf_passes():
    assert authorization_check() == []


def test_view_without_declared_permission_fails_with_e001():
    errors = check_view_permissions("tests.core.urls_missing_permission")
    assert ids(errors) == ["lancex.E001"]
    assert "api/v1/forgotten/" in errors[0].msg


@override_settings(ROOT_URLCONF="tests.core.urls_missing_permission")
def test_manage_py_check_fails_when_a_view_has_no_permission():
    with pytest.raises(SystemCheckError, match=r"lancex\.E001"):
        call_command("check")


def test_unknown_capability_dynamic_permissions_and_non_drf_views_fail():
    errors = check_view_permissions("tests.core.urls_other_violations")
    # E001 x2: la vista no DRF y la de get_permissions (que además deja DenyAll declarado).
    assert ids(errors) == ["lancex.E001", "lancex.E001", "lancex.E002", "lancex.E003"]
    messages = " ".join(e.msg for e in errors)
    assert "bid.plcae" in messages
    assert "/api/v1/typo/" in messages  # rutas anidadas con include() también se revisan


def test_valid_test_urlconf_declares_every_permission_except_the_deliberate_one():
    errors = check_view_permissions("tests.core.urls_test_views")
    assert ids(errors) == ["lancex.E001"]  # UndeclaredView, a propósito para probar DenyAll en HTTP
    assert "undeclared" in errors[0].msg


@override_settings(REST_FRAMEWORK={"DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"]})
def test_global_default_must_be_deny_all():
    assert "lancex.E004" in ids(authorization_check())
