# Create your views here.
# La vue est le point d'entrée. 
# C'est elle qui reçoit la requête HTTP, vérifie l'authentification et les permissions, 
# choisit quelles données récupérer (le queryset), 
# puis fait appel au serializer pour fabriquer la réponse.
from rest_framework import mixins, permissions, viewsets

from .models import Conversation, Group, Message
from .serializers import (
    ConversationCreateSerializer,
    ConversationSerializer,
    GroupCreateSerializer,
    GroupSerializer,
    MessageSerializer,
)


class GroupViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """List / retrieve / create the groups the current user belongs to."""

    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Group.objects.filter(memberships__user=self.request.user)
            .prefetch_related("members")
            .order_by("-created_at")
        )

    def get_serializer_class(self):
        return GroupCreateSerializer if self.action == "create" else GroupSerializer


class ConversationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Conversations of the groups the current user belongs to."""

    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Conversation.objects.filter(group__memberships__user=self.request.user)
            .select_related("group")
            .prefetch_related("group__members")
            .order_by("-updated_at")
        )

    def get_serializer_class(self):
        return ConversationCreateSerializer if self.action == "create" else ConversationSerializer


class MessageViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET  /api/messages/?conversation=<id>  -> messages of a conversation
    POST /api/messages/                    -> {"conversation": <id>, "content": "..."}
    """

    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = (
            Message.objects.filter(conversation__group__memberships__user=self.request.user)
            .select_related("sender")
            .order_by("-created_at")  # newest first: easier to paginate; reverse in React
        )
        conversation_id = self.request.query_params.get("conversation")
        if conversation_id:
            qs = qs.filter(conversation_id=conversation_id)
        return qs

    def perform_create(self, serializer):
        # The sender always comes from the authenticated user, never from the client
        message = serializer.save(sender=self.request.user)

        # Bump the conversation so it moves up in the conversation list
        # (only needed if updated_at is auto_now)
        message.conversation.save(update_fields=["updated_at"])

        # TODO (step 2): broadcast `message` to the channel group of the conversation
