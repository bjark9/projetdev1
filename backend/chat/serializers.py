# Transform database objects into JSON (and back) for the API.
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from accounts.serializers import UserSerializer

from .models import Conversation, Group, Membership, Message

User = get_user_model()


class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation",
            "sender",
            "is_mine",
            "content",
            "created_at",
            "edited_at",
            "read_by",
        ]
        read_only_fields = ["id", "sender", "created_at", "edited_at", "read_by"]

    def get_is_mine(self, message):
        request = self.context.get("request")
        return request is not None and message.sender_id == request.user.pk

    def validate_conversation(self, conversation):
        # Cette validation protège aussi l'API HTTP, en plus du WebSocket.
        # Only members of the conversation's group can post in it
        request = self.context["request"]
        if not conversation.group.memberships.filter(user=request.user).exists():
            raise serializers.ValidationError("You are not a member of this conversation's group.")
        return conversation


class GroupSerializer(serializers.ModelSerializer):
    members = UserSerializer(many=True, read_only=True)

    class Meta:
        model = Group
        fields = ["id", "name", "members", "created_at"]
        read_only_fields = ["id", "members", "created_at"]


class GroupCreateSerializer(serializers.ModelSerializer):
    """Used for creating a group: accepts member IDs directly."""

    member_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.all(),
        write_only=True,
    )

    class Meta:
        model = Group
        fields = ["id", "name", "member_ids"]
        read_only_fields = ["id"]

    def validate_member_ids(self, users):
        # Le créateur est toujours ajouté, même si son ID n'est pas envoyé.
        # The creator is always part of the group; remove duplicates
        creator = self.context["request"].user
        unique = {u.pk: u for u in users}
        unique[creator.pk] = creator
        if len(unique) < 2:
            raise serializers.ValidationError("A group needs at least 2 users.")
        return list(unique.values())

    def create(self, validated_data):
        # Le groupe et ses memberships sont créés ensemble dans une transaction.
        users = validated_data.pop("member_ids")
        with transaction.atomic():
            group = Group.objects.create(**validated_data)
            Membership.objects.bulk_create([Membership(group=group, user=u) for u in users])
        return group

    def to_representation(self, instance):
        # Respond with the full group (nested members), not just the input fields
        return GroupSerializer(instance, context=self.context).data


class ConversationSerializer(serializers.ModelSerializer):
    group = GroupSerializer(read_only=True)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "group",
            "name",
            "created_at",
            "updated_at",
            "last_message",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_last_message(self, obj):
        last = obj.messages.order_by("-created_at").first()
        return MessageSerializer(last, context=self.context).data if last else None


class ConversationCreateSerializer(serializers.ModelSerializer):
    """Used for creating a conversation: accepts the group ID directly."""

    class Meta:
        model = Conversation
        fields = ["id", "group", "name"]
        read_only_fields = ["id"]

    def validate_group(self, group):
        # Une conversation ne peut être créée que dans un groupe accessible.
        request = self.context["request"]
        if not group.memberships.filter(user=request.user).exists():
            raise serializers.ValidationError("You are not a member of this group.")
        return group

    def to_representation(self, instance):
        return ConversationSerializer(instance, context=self.context).data
