"""Endpoints de catálogo (CONTRATO-API-INICIAL.md §Catálogo). Imágenes: LX-70."""

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog import services
from apps.catalog.services import procurement
from apps.core.capabilities import Cap, OrgCap
from apps.core.permissions import ByMethod, HasCapability, HasOrgCapability, Public

from .serializers import (
    CategorySerializer,
    ListingInput,
    ListingOwnerSerializer,
    ProcurementRequestInput,
    procurement_payload,
)


def listing_payload(listing) -> dict:
    listing.editable = services.is_editable(listing)
    return ListingOwnerSerializer(listing).data


class CategoryListView(APIView):
    permission_classes = [Public]

    @extend_schema(responses={200: CategorySerializer(many=True)})
    def get(self, request):
        return Response(CategorySerializer(services.active_categories(), many=True).data)


class ListingCreateView(APIView):
    permission_classes = [HasCapability(Cap.LISTING_MANAGE_OWN)]

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
