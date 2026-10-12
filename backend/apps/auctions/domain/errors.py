"""Errores de dominio del motor de subastas, con los códigos del contrato. Python puro."""

from apps.core.errors import Conflict, Forbidden, ValidationFailed


def auction_not_active(status: str) -> Conflict:
    return Conflict(
        code="AUCTION_NOT_ACTIVE", message="La subasta no está recibiendo pujas.", details={"status": status}
    )


def bid_below_minimum(minimum) -> Conflict:
    return Conflict(
        code="BID_BELOW_MINIMUM",
        message="La oferta no alcanza el mínimo permitido.",
        details={"minimum_allowed": f"{minimum:.2f}"},
    )


def already_leading() -> Conflict:
    return Conflict(code="ALREADY_LEADING", message="Ya vas ganando esta subasta.")


def bid_on_own_auction() -> Forbidden:
    return Forbidden(code="BID_ON_OWN_AUCTION", message="No puedes pujar en tu propia subasta.")


def combination_not_allowed(mechanism: str, closing_policy: str, proxy: bool) -> ValidationFailed:
    return ValidationFailed(
        code="MECHANISM_COMBINATION_NOT_ALLOWED",
        message="La combinación de mecanismo y política de cierre no está permitida.",
        details={"mechanism": mechanism, "closing_policy": closing_policy, "proxy_enabled": proxy},
    )


def rules_locked() -> Conflict:
    return Conflict(code="RULES_LOCKED", message="Las reglas no se pueden editar después de publicar.")


def invalid_transition(status: str, action: str) -> Conflict:
    return Conflict(
        code="INVALID_STATE_TRANSITION",
        message="La acción no es posible en el estado actual.",
        details={"status": status, "action": action},
    )


def config_error(field: str, message: str) -> ValidationFailed:
    return ValidationFailed(details={"fields": {field: [message]}})
