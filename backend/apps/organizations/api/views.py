"""Endpoints de organizaciones (CONTRATO-API-INICIAL.md §Organizaciones) y su verificación (§Moderación)."""

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.capabilities import Cap, OrgCap
from apps.core.pagination import StandardPagination
from apps.core.permissions import ByMethod, HasAnyOrgCapability, HasCapability
from apps.organizations import services

from .serializers import (
    MemberAddInput,
    OrganizationCreateInput,
    OrganizationUpdateInput,
    TransferOwnershipInput,
    VerificationDecisionInput,
    organization_payload,
    review_detail_payload,
    review_payload,
)


def _valid(serializer_class, data, **kwargs) -> dict:
    serializer = serializer_class(data=data, **kwargs)
    serializer.is_valid(raise_exception=True)
    return dict(serializer.validated_data)


def _detail(request, organization_id, status_code=status.HTTP_200_OK) -> Response:
    org, membership, members = services.get_organization(request.user, organization_id)
    return Response(organization_payload(org, membership, members), status=status_code)


class OrganizationCreateView(APIView):
    permission_classes = [HasCapability(Cap.ORGANIZATION_CREATE)]

    @extend_schema(request=OrganizationCreateInput)
    def post(self, request):
        org = services.create_organization(request.user, **_valid(OrganizationCreateInput, request.data))
        return _detail(request, org.pk, status.HTTP_201_CREATED)


class OrganizationDetailView(APIView):
    # Permiso "en alguna organización"; el servicio exige la membresía en ESTA y responde 404 si no la hay.
    permission_classes = [
        ByMethod(GET=HasAnyOrgCapability(OrgCap.ORG_VIEW), PATCH=HasAnyOrgCapability(OrgCap.ORG_EDIT_PROFILE))
    ]

    def get(self, request, organization_id):
        return _detail(request, organization_id)

    @extend_schema(request=OrganizationUpdateInput)
    def patch(self, request, organization_id):
        services.update_organization(
            request.user, organization_id, **_valid(OrganizationUpdateInput, request.data, partial=True)
        )
        return _detail(request, organization_id)


class MemberAddView(APIView):
    permission_classes = [HasAnyOrgCapability(OrgCap.ORG_MANAGE_MEMBERS)]

    @extend_schema(request=MemberAddInput)
    def post(self, request, organization_id):
        services.add_member(request.user, organization_id, **_valid(MemberAddInput, request.data))
        return _detail(request, organization_id, status.HTTP_201_CREATED)


class MemberRevokeView(APIView):
    permission_classes = [HasAnyOrgCapability(OrgCap.ORG_MANAGE_MEMBERS)]

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, organization_id, user_id):
        services.revoke_member(request.user, organization_id, user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TransferOwnershipView(APIView):
    permission_classes = [HasAnyOrgCapability(OrgCap.ORG_TRANSFER_OWNERSHIP)]

    @extend_schema(request=TransferOwnershipInput)
    def post(self, request, organization_id):
        services.transfer_ownership(request.user, organization_id, **_valid(TransferOwnershipInput, request.data))
        return _detail(request, organization_id)


class OrganizationReviewListView(APIView):
    permission_classes = [HasCapability(Cap.MODERATION_VERIFY_ORGANIZATIONS)]

    @extend_schema(parameters=[OpenApiParameter("status", str, required=False)])
    def get(self, request):
        qs = services.organizations_for_review(request.query_params.get("status"))
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([review_payload(o) for o in page])


class OrganizationReviewDetailView(APIView):
    """`GET /moderation/organizations/{id}/`: datos y miembros para decidir la verificación."""

    permission_classes = [HasCapability(Cap.MODERATION_VERIFY_ORGANIZATIONS)]

    def get(self, request, organization_id):
        org, members = services.organization_for_review(organization_id)
        return Response(review_detail_payload(org, members))


class OrganizationDecisionView(APIView):
    permission_classes = [HasCapability(Cap.MODERATION_VERIFY_ORGANIZATIONS)]

    @extend_schema(request=VerificationDecisionInput)
    def post(self, request, organization_id):
        org = services.decide_verification(
            request.user, organization_id, **_valid(VerificationDecisionInput, request.data)
        )
        return Response(review_payload(org))
