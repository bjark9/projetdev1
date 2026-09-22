# Transform database objects into a string or byte stream, such as JSON, to send data to a browser or API.
from rest_framework import serializers

from accounts.serializers import UserSerializer
from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation",
            "sender",
            "content",
            "created_at",
            "edited_at",
            "read_by",
        ]
        read_only_fields = ["id", "sender", "created_at", "edited_at", "read_by"]


class ConversationSerializer(serializers.ModelSerializer):
    participants = UserSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "participants",
            "is_group",
            "name",
            "created_at",
            "updated_at",
            "last_message",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_last_message(self, obj):
        last = obj.messages.order_by("-created_at").first()
        return MessageSerializer(last).data if last else None


class ConversationCreateSerializer(serializers.ModelSerializer):
    """Used for creating a conversation — accepts participant IDs directly."""

    class Meta:
        model = Conversation
        fields = ["id", "participants", "is_group", "name"]
