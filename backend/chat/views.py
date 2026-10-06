# Create your views here.
# La vue est le point d'entrée.
# C'est elle qui reçoit la requête HTTP, vérifie l'authentification et les permissions,
# choisit quelles données récupérer (le queryset),
# puis fait appel au serializer pour fabriquer la réponse.
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Conversation, Group, Message
from .serializers import (
    ConversationCreateSerializer,
    ConversationSerializer,
    GroupCreateSerializer,
    GroupSerializer,
    MessageSerializer,
)

User = get_user_model()


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
            Group.objects.filter(memberships__user=self.request.user.pk)
            .prefetch_related("members")
            .order_by("-created_at")
        )

    def get_serializer_class(self):
        return GroupCreateSerializer if self.action == "create" else GroupSerializer

    @action(detail=True, methods=["post"], url_path="members")
    def add_member(self, request, pk=None):
        group = self.get_object()
        user = get_object_or_404(User, pk=request.data.get("user_id"))
        membership, created = group.memberships.get_or_create(user=user)

        serializer = GroupSerializer(group, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"members/(?P<user_id>[^/.]+)",
    )
    def remove_member(self, request, user_id, pk=None):
        group = self.get_object()
        deleted, _ = group.memberships.filter(user_id=user_id).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


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
            Conversation.objects.filter(group__memberships__user=self.request.user.pk)
            .select_related("group")  # Sélectionne le groupe associé à chaque conversation
            .prefetch_related("group__members")  # Précharge les membres du groupe associé à chaque conversation
            .order_by("-updated_at")  # Trie les conversations par date de mise à jour décroissante
        )

    def get_serializer_class(self):
        return (
            ConversationCreateSerializer if self.action == "create" else ConversationSerializer
        )  # Utilise ConversationCreateSerializer pour la création et ConversationSerializer pour les autres actions


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
        qs = (  # Récupère les messages des conversations auxquelles l'utilisateur appartient
            Message.objects.filter(conversation__group__memberships__user=self.request.user.pk)
            .select_related("sender")
            .order_by("-created_at")  # newest first: easier to paginate; reverse in React
        )
        conversation_id = self.request.query_params.get(
            "conversation"
        )  # Récupère l'ID de la conversation à partir des paramètres de requête
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
