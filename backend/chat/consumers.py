# Handles the actual WebSocket connection per conversation:
# on connect it checks the user is authenticated and is a participant in that conversation
# (so no one can eavesdrop on chats they're not in),
# then joins a conversation group named after the conversation ID.
# Incoming messages get saved to the DB and broadcast to everyone in that group.
import json
from typing import Any, cast

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from accounts.models import User

from .models import Conversation, Message
import logging

logger = logging.getLogger(__name__)


class ChatConsumer(AsyncWebsocketConsumer):
    """
    Handles a WebSocket connection for a single conversation.
    Connect to: ws://.../ws/chat/<conversation_id>/
    """

    async def connect(self):
        # Le middleware Clerk ou les tests placent l'utilisateur dans le scope ASGI.
        self.user = cast(User, self.scope["user"])
        user = self.scope["user"]
        logger.warning(
        "WS connect: conv=%s user_id=%s authenticated=%s",
        self.scope["url_route"]["kwargs"]["conversation_id"],
        getattr(user, "id", None),
        getattr(user, "is_authenticated", False),
)
        self.conversation_id = self.scope["url_route"]["kwargs"]["conversation_id"]
        self.conversation_group_name = f"chat_{self.conversation_id}"

        # Première barrière: une personne non connectée est refusée.
        if not self.user.is_authenticated:
            await self.close()
            return

        # Deuxième barrière: il faut aussi être membre du groupe.
        is_participant = await self.is_conversation_participant()
        if not is_participant:
            await self.close()
            return

        # Tous les membres rejoignent le même groupe Channels.
        await self.channel_layer.group_add(self.conversation_group_name, self.channel_name)
        clerk_subprotocol = cast(str | None, self.scope.get("clerk_subprotocol"))
        if clerk_subprotocol:
            await self.accept(subprotocol=clerk_subprotocol)
        else:
            await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.conversation_group_name, self.channel_name)

    async def receive(
        self,
        text_data: str | None = None,
        bytes_data: bytes | None = None,
    ) -> None:
        if text_data is None:
            return

        # Les messages WebSocket sont de petits objets JSON.
        data = json.loads(text_data)
        content = data.get("content", "").strip()
        if not content:
            return

        # On sauvegarde avant de diffuser afin d'obtenir un ID et une date.
        message = await self.save_message(content)

        # group_send transmet le message à tous les sockets de la conversation.
        await self.channel_layer.group_send(
            self.conversation_group_name,
            {
                "type": "chat_message",
                "message_id": message.id,
                "content": message.content,
                "sender_id": self.user.id,
                "sender_username": self.user.username,
                "created_at": message.created_at.isoformat(),
            },
        )

    async def chat_message(self, event: dict[str, Any]) -> None:
        # Cette méthode est appelée pour chaque message diffusé au groupe.
        await self.send(
            text_data=json.dumps(
                {
                    "message_id": event["message_id"],
                    "content": event["content"],
                    "sender_id": event["sender_id"],
                    "sender_username": event["sender_username"],
                    "created_at": event["created_at"],
                }
            )
        )

    @database_sync_to_async
    def is_conversation_participant(self):
        # L'accès dépend du groupe lié à la conversation.
        return Conversation.objects.filter(id=self.conversation_id, group__members=self.user).exists()

    @database_sync_to_async
    def save_message(self, content):
        return Message.objects.create(
            conversation_id=self.conversation_id,
            sender=self.user,
            content=content,
        )
