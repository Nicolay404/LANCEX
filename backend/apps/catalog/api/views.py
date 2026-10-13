"""Endpoints de catálogo (CONTRATO-API-INICIAL.md §Catálogo). Imágenes: LX-70."""

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog import services
from apps.catalog.services import images, procurement
from apps.core.capabilities import Cap, OrgCap
from apps.core.permissions import ByMethod, HasCapability, HasOrgCapability, Public

from .serializers import (
    CategorySerializer,
    ImageConfirmInput,
    ListingInput,
    ListingOwnerSerializer,
    ProcurementRequestInput,
    UploadUrlInput,
    procurement_payload,
)


def listing_payload(listing) -> dict:
    listing.editable = services.is_editable(listing)
    return {**ListingOwnerSerializer(listing).data, "images": images.signed_images(listing.pk)}


class CategoryListView(APIView):
    permission_classes = [Public]

    @extend_schema(responses={200: CategorySerializer(many=True)})
    def get(self, request):
        return Response(CategorySerializer(services.active_categories(), many=True).data)


class ListingCreateView(APIView):
    permission_classes = [
        ByMethod(GET=HasCapability(Cap.LISTING_MANAGE_OWN), POST=HasCapability(Cap.LISTING_MANAGE_OWN))
    ]

    def get(self, request):
        """`GET /listings/`: mis publicaciones (paginado, `-updated_at`)."""
        from apps.core.pagination import StandardPagination

        paginator = StandardPagination()
        page = paginator.paginate_queryset(services.own_listings(request.user), request, view=self)
        overview = services.listing_overview(page)
        covers = images.first_images(listing.pk for listing in page)
        return paginator.get_paginated_response(
            [
                {
                    "id": str(listing.pk),
                    "category": {"id": listing.category_id, "name": listing.category.name},
                    "title": listing.title,
                    "item_condition": listing.item_condition,
                    "location_city": listing.location_city,
                    "created_at": listing.created_at,
                    "updated_at": listing.updated_at,
                    "cover_image_url": covers.get(str(listing.pk)),
                    **overview[str(listing.pk)],
                }
                for listing in page
            ]
        )

    @extend_schema(request=ListingInput, responses={201: ListingOwnerSerializer})
    def post(self, request):
        serializer = ListingInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        listing = services.create_listing(request.user, **serializer.validated_data)
        return Response(listing_payload(services.get_own_listing(request.user, listing.pk)), status=201)


class ListingDetailView(APIView):
    permission_classes = [
        ByMethod(GET=HasCapability(Cap.LISTING_MANAGE_OWN), PATCH=HasCapability(Cap.LISTING_MANAGE_OWN))
    ]

    @extend_schema(responses={200: ListingOwnerSerializer})
    def get(self, request, listing_id):
        return Response(listing_payload(services.get_own_listing(request.user, listing_id)))

    @extend_schema(request=ListingInput(partial=True), responses={200: ListingOwnerSerializer})
    def patch(self, request, listing_id):
        serializer = ListingInput(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        listing = services.update_listing(request.user, listing_id, **serializer.validated_data)
        return Response(listing_payload(listing), status=status.HTTP_200_OK)


class ProcurementRequestCreateView(APIView):
    """`POST /procurement-requests/`: miembro de una compradora verificada (capacidad por `organization_id`)."""

    permission_classes = [HasOrgCapability(OrgCap.PROCUREMENT_MANAGE)]

    @extend_schema(request=ProcurementRequestInput)
    def post(self, request):
        serializer = ProcurementRequestInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        data["mandatory_requirements"] = [dict(r) for r in data.get("mandatory_requirements", [])]
        obj = procurement.create_request(request.user, **data)
        return Response(procurement_payload(procurement.get_public(obj.pk)), status=status.HTTP_201_CREATED)


class ProcurementRequestDetailView(APIView):
    permission_classes = [Public]

    def get(self, request, request_id):
        return Response(procurement_payload(procurement.get_public(request_id)))


class ImageUploadUrlView(APIView):
    """`POST /listings/{id}/images/upload-url/`: valida tipo y tamaño declarados y firma una ruta del servidor."""

    permission_classes = [HasCapability(Cap.LISTING_MANAGE_OWN)]

    @extend_schema(request=UploadUrlInput)
    def post(self, request, listing_id):
        serializer = UploadUrlInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(images.request_upload(request.user, listing_id, **serializer.validated_data))


class ImageConfirmView(APIView):
    """`POST /listings/{id}/images/`: valida los metadatos REALES del objeto antes de registrarlo."""

    permission_classes = [HasCapability(Cap.LISTING_MANAGE_OWN)]

    @extend_schema(request=ImageConfirmInput)
    def post(self, request, listing_id):
        serializer = ImageConfirmInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = images.confirm_upload(request.user, listing_id, **serializer.validated_data)
        return Response(
            {"id": str(image.pk), "position": image.position, "content_type": image.content_type},
            status=status.HTTP_201_CREATED,
        )


class ImageDeleteView(APIView):
    permission_classes = [HasCapability(Cap.LISTING_MANAGE_OWN)]

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, listing_id, image_id):
        images.delete_image(request.user, listing_id, image_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
