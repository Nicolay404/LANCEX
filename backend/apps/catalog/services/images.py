"""Imágenes de publicaciones (LX-70, REGLAS §13: máx. 6, JPEG/PNG/WebP, ≤ 5 MB; SVG prohibido).

Flujo (ADR-0004 §6):
1. `request_upload`: el dueño pide subir; el servidor valida tipo y tamaño DECLARADOS y genera la ruta.
2. El navegador sube directo a Storage con la URL firmada.
3. `confirm_upload`: el servidor consulta los metadatos REALES del objeto en Storage y los valida otra
   vez antes de registrar la fila (T17: no confía en lo declarado).
"""

from __future__ import annotations

import uuid

from django.db import IntegrityError, transaction

from apps.auctions.services.listing_guard import listing_has_open_auction
from apps.catalog.models import Listing, ListingImage
from apps.core.errors import Conflict, NotFound, ValidationFailed

from .storage import get_storage

ALLOWED_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_BYTES = 5 * 1024 * 1024
MAX_IMAGES = 6


def _field(field: str, message: str) -> ValidationFailed:
    return ValidationFailed(details={"fields": {field: [message]}})


def _own_editable_listing(user, listing_id, *, for_update: bool = False) -> Listing:
    qs = Listing.objects.visible_to(user)
    if for_update:
        qs = qs.select_for_update()
    listing = qs.filter(pk=listing_id).first()
    if listing is None:
        raise NotFound()
    if listing_has_open_auction(listing.pk):
        raise Conflict(code="LISTING_LOCKED", message="La publicación tiene una subasta abierta.")
    return listing


def _validate(content_type: str, size_bytes: int) -> None:
    if content_type not in ALLOWED_TYPES:
        raise _field("content_type", "Solo JPEG, PNG o WebP.")
    if not 0 < size_bytes <= MAX_BYTES:
        raise _field("size_bytes", "Máximo 5 MB.")


def _path_prefix(listing_id) -> str:
    return f"listings/{listing_id}/"


def request_upload(user, listing_id, *, content_type: str, size_bytes: int) -> dict:
    listing = _own_editable_listing(user, listing_id)
    _validate(content_type, size_bytes)
    if ListingImage.objects.filter(listing_id=listing.pk).count() >= MAX_IMAGES:
        raise Conflict(code="LIMIT_REACHED", message="Máximo 6 imágenes.", details={"limit": MAX_IMAGES})
    path = f"{_path_prefix(listing.pk)}{uuid.uuid4().hex}.{ALLOWED_TYPES[content_type]}"
    return {"upload_url": get_storage().signed_upload_url(path), "storage_path": path, "expires_in": 7200}


def confirm_upload(user, listing_id, *, storage_path: str, position: int) -> ListingImage:
    if not 0 <= position < MAX_IMAGES:
        raise _field("position", "Entre 0 y 5.")
    with transaction.atomic():
        listing = _own_editable_listing(user, listing_id, for_update=True)
        if not storage_path.startswith(_path_prefix(listing.pk)) or ".." in storage_path:
            raise _field("storage_path", "Ruta no válida para esta publicación.")
        if ListingImage.objects.filter(listing_id=listing.pk).count() >= MAX_IMAGES:
            raise Conflict(code="LIMIT_REACHED", message="Máximo 6 imágenes.", details={"limit": MAX_IMAGES})
        info = get_storage().object_info(storage_path)
        if info is None:
            raise _field("storage_path", "El archivo no se subió.")
        try:
            _validate(info.content_type, info.size_bytes)  # metadatos reales, no los declarados
        except ValidationFailed:
            get_storage().delete(storage_path)
            raise
        try:
            with transaction.atomic():
                return ListingImage.objects.create(
                    listing=listing,
                    storage_path=storage_path,
                    content_type=info.content_type,
                    size_bytes=info.size_bytes,
                    position=position,
                )
        except IntegrityError:
            raise Conflict(code="ALREADY_REGISTERED", message="Esa imagen ya está registrada.") from None


def delete_image(user, listing_id, image_id) -> None:
    with transaction.atomic():
        listing = _own_editable_listing(user, listing_id, for_update=True)
        image = ListingImage.objects.filter(pk=image_id, listing_id=listing.pk).first()
        if image is None:
            raise NotFound()
        path = image.storage_path
        image.delete()
    get_storage().delete(path)


def first_images(listing_ids) -> dict[str, str]:
    """Primera imagen de cada publicación con UNA sola llamada a Storage (para listados)."""
    firsts: dict[str, str] = {}
    for img in ListingImage.objects.filter(listing_id__in=list(listing_ids)).order_by("listing_id", "position"):
        firsts.setdefault(str(img.listing_id), img.storage_path)
    if not firsts:
        return {}
    try:
        urls = get_storage().signed_read_urls(list(firsts.values()))
    except Exception:  # noqa: BLE001 - sin Storage, el listado se muestra sin imágenes
        return {}
    return {listing_id: urls[path] for listing_id, path in firsts.items() if path in urls}


def signed_images(listing_id) -> list[dict]:
    """URLs firmadas de lectura (1 h). Si Storage no responde, la subasta se muestra sin imágenes."""
    if listing_id is None:
        return []
    images = list(ListingImage.objects.filter(listing_id=listing_id).order_by("position"))
    if not images:
        return []
    try:
        urls = get_storage().signed_read_urls([i.storage_path for i in images])
    except Exception:  # noqa: BLE001 - degradación: el detalle no falla por las imágenes
        return []
    return [
        {"id": str(i.pk), "url": urls[i.storage_path], "position": i.position} for i in images if i.storage_path in urls
    ]
