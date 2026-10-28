# Create your views here.
# La vue est le point d'entrée. 
# C'est elle qui reçoit la requête HTTP, vérifie l'authentification et les permissions, 
# choisit quelles données récupérer (le queryset), 
# puis fait appel au serializer pour fabriquer la réponse.
from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .events import broadcast_message, broadcast_message_deleted
from .models import Conversation, Group, Membership, Message
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
        # Le queryset filtre les groupes visibles: un non-membre ne les reçoit pas.
        return (
            Group.objects.filter(memberships__user=self.request.user.pk)
            .prefetch_related("memberships__user")
            .order_by("-created_at")
        )

    def get_serializer_class(self):
        return GroupCreateSerializer if self.action == "create" else GroupSerializer

    @action(detail=True, methods=["post"], url_path="members")
    def add_member(self, request, pk=None):
        group = self.get_object()
        self.require_member_management(group, request.user)
        user = get_object_or_404(User, pk=request.data.get("user_id"))
        _, created = group.memberships.get_or_create(user=user)
        group.refresh_from_db()

        serializer = GroupSerializer(group, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"members/(?P<user_id>[^/.]+)",
    )
    def remove_member(self, request, user_id, pk=None):
        # Une suppression réussie renvoie 204; un lien inexistant renvoie 404.
        group = self.get_object()
        actor = self.require_member_management(group, request.user)
        membership = get_object_or_404(group.memberships, user_id=user_id)
        if membership.role == Membership.Role.OWNER:
            return Response({"detail": "The group owner cannot be removed."}, status=status.HTTP_400_BAD_REQUEST)
        if actor.role == Membership.Role.ADMIN and membership.role != Membership.Role.MEMBER:
            return Response({"detail": "Admins can only remove members."}, status=status.HTTP_403_FORBIDDEN)
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["patch"],
        url_path=r"members/(?P<user_id>[^/.]+)/role",
    )
    def set_member_role(self, request, user_id, pk=None):
        group = self.get_object()
        actor = get_object_or_404(group.memberships, user=request.user)
        if actor.role != Membership.Role.OWNER:
            return Response(
                {"detail": "Only the group owner can change roles."},
                status=status.HTTP_403_FORBIDDEN,
            )

        membership = get_object_or_404(group.memberships, user_id=user_id)
        role = request.data.get("role")
        if role not in (Membership.Role.ADMIN, Membership.Role.MEMBER):
            return Response(
                {"role": "Role must be either 'admin' or 'member'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if membership.role == Membership.Role.OWNER:
            return Response(
                {"detail": "The group owner role cannot be changed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        membership.role = role
        membership.save(update_fields=["role"])
        group.refresh_from_db()
        return Response(GroupSerializer(group, context={"request": request}).data)

    @staticmethod
    def require_member_management(group, user):
        membership = get_object_or_404(group.memberships, user=user)
        if membership.role not in (Membership.Role.OWNER, Membership.Role.ADMIN):
            raise PermissionDenied("Only the group owner and admins can manage members.")
        return membership


class ConversationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Conversations of the groups the current user belongs to."""

    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Une conversation est accessible si l'utilisateur appartient à son groupe.
        return (
            Conversation.objects.filter(group__memberships__user=self.request.user.pk)
            .select_related("group")  # Sélectionne le groupe associé à chaque conversation
            .prefetch_related("group__memberships__user")
            .order_by("-updated_at")  # Trie les conversations par date de mise à jour décroissante
        )

    def get_serializer_class(self):
        return (
            ConversationCreateSerializer if self.action == "create" else ConversationSerializer
        )  # Utilise ConversationCreateSerializer pour la création et ConversationSerializer pour les autres actions


class MessageViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET  /api/messages/?conversation=<id>  -> messages of a conversation
    POST /api/messages/                    -> {"conversation": <id>, "content": "..."}
    DELETE /api/messages/<id>/             -> delete a message authored by the user
    """

    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=["post"], url_path="mark-read")
    def mark_read(self, request):
        conversation_id = request.data.get("conversation")
        if not conversation_id:
            return Response(
                {"conversation": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conversation = get_object_or_404(
            Conversation.objects.filter(group__memberships__user=request.user),
            pk=conversation_id,
        )
        unread_messages = conversation.messages.exclude(sender=request.user).exclude(read_by=request.user)
        message_ids = list(unread_messages.values_list("pk", flat=True))
        read_memberships = [
            Message.read_by.through(message_id=message_id, user_id=request.user.pk)
            for message_id in message_ids
        ]
        Message.read_by.through.objects.bulk_create(read_memberships, ignore_conflicts=True)
        return Response({"marked_read": len(message_ids)}, status=status.HTTP_200_OK)

    def get_queryset(self):
        # L'historique est limité aux conversations des groupes de l'utilisateur.
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
        # Le client ne choisit jamais l'expéditeur: il vient du token Clerk.
        # The sender always comes from the authenticated user, never from the client
        message = serializer.save(sender=self.request.user)

        # Bump the conversation so it moves up in the conversation list
        # (only needed if updated_at is auto_now)
        message.conversation.save(update_fields=["updated_at"])

        async_to_sync(broadcast_message)(message)

    def perform_destroy(self, instance):
        if instance.sender_id != self.request.user.pk:
            raise PermissionDenied("You can only delete your own messages.")

        message_id = instance.pk
        conversation_id = instance.conversation_id
        instance.delete()
        async_to_sync(broadcast_message_deleted)(message_id, conversation_id)
