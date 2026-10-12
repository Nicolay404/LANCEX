"""Endpoints de catálogo (CONTRATO-API-INICIAL.md §Catálogo). Imágenes: LX-70."""

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog import services
from apps.core.capabilities import Cap
from apps.core.permissions import ByMethod, HasCapability, Public

from .serializers import CategorySerializer, ListingInput, ListingOwnerSerializer


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
