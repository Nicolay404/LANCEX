"""Adaptador de Supabase Storage para imágenes (ADR-0004 §6, amenaza T17).

Puerto `ObjectStorage` + adaptador HTTP. El navegador nunca recibe claves: el backend emite
URLs firmadas de subida (para una ruta que genera él) y de lectura (1 h). La clave de servicio
solo vive en `backend/.env`. Las pruebas sustituyen el adaptador por un doble.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import httpx
from django.conf import settings
from django.utils.module_loading import import_string

from apps.core.errors import LancexError

READ_URL_TTL_S = 3600
TIMEOUT_S = 10


class StorageUnavailable(LancexError):
    status_code = 503
    default_code = "STORAGE_UNAVAILABLE"
    default_message = "El almacenamiento de imágenes no está disponible."


@dataclass(frozen=True, slots=True)
class ObjectInfo:
    content_type: str
    size_bytes: int


class ObjectStorage(Protocol):
    def signed_upload_url(self, path: str) -> str: ...

    def object_info(self, path: str) -> ObjectInfo | None: ...

    def signed_read_urls(self, paths: list[str], ttl_s: int = READ_URL_TTL_S) -> dict[str, str]: ...

    def delete(self, path: str) -> None: ...


class SupabaseStorage:
    def __init__(self, url: str, service_key: str, bucket: str) -> None:
        if not url or not service_key:
            raise StorageUnavailable()
        self.base = url.rstrip("/") + "/storage/v1"
        self.bucket = bucket
        self.headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key}

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        try:
            response = httpx.request(method, self.base + path, headers=self.headers, timeout=TIMEOUT_S, **kwargs)
        except httpx.HTTPError:
            raise StorageUnavailable() from None
        return response

    def signed_upload_url(self, path: str) -> str:
        response = self._request("POST", f"/object/upload/sign/{self.bucket}/{path}")
        if response.status_code >= 400:
            raise StorageUnavailable()
        return self.base + response.json()["url"]

    def object_info(self, path: str) -> ObjectInfo | None:
        response = self._request("HEAD", f"/object/authenticated/{self.bucket}/{path}")
        if response.status_code == 404 or response.status_code == 400:
            return None
        if response.status_code >= 400:
            raise StorageUnavailable()
        return ObjectInfo(
            content_type=response.headers.get("content-type", "").split(";")[0].strip(),
            size_bytes=int(response.headers.get("content-length", "0")),
        )

    def signed_read_urls(self, paths: list[str], ttl_s: int = READ_URL_TTL_S) -> dict[str, str]:
        if not paths:
            return {}
        response = self._request("POST", f"/object/sign/{self.bucket}", json={"expiresIn": ttl_s, "paths": paths})
        if response.status_code >= 400:
            raise StorageUnavailable()
        return {item["path"]: self.base + item["signedURL"] for item in response.json() if item.get("signedURL")}

    def delete(self, path: str) -> None:
        self._request("DELETE", f"/object/{self.bucket}", json={"prefixes": [path]})


def get_storage() -> ObjectStorage:
    factory = getattr(settings, "LANCEX_STORAGE_FACTORY", None)
    if factory:
        return import_string(factory)()
    return SupabaseStorage(
        settings.SUPABASE["URL"], settings.SUPABASE["SERVICE_ROLE_KEY"], settings.SUPABASE["IMAGES_BUCKET"]
    )
