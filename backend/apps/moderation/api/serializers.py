from rest_framework import serializers

from apps.core.models import choices_of
from apps.core.serializers import StrictInputMixin
from apps.moderation.models import Reason, TargetType


class ReportInput(StrictInputMixin, serializers.Serializer):
    target_type = serializers.ChoiceField(choices=choices_of(TargetType))
    target_id = serializers.UUIDField()
    reason = serializers.ChoiceField(choices=choices_of(Reason))
    detail = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
