# Handles the actual WebSocket connection per conversation: 
# on connect it checks the user is authenticated and is a participant in that conversation 
# (so no one can eavesdrop on chats they're not in), 
# then joins a "room group" named after the conversation ID. 
# Incoming messages get saved to the DB and broadcast to everyone in that group.
import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .models import Conversation, Message


class ChatConsumer(AsyncWebsocketConsumer):
    """
    Handles a WebSocket connection for a single conversation.
    Connect to: ws://.../ws/chat/<conversation_id>/
    """

    async def connect(self):
        self.user = self.scope["user"]
        self.conversation_id = self.scope["url_route"]["kwargs"]["conversation_id"]
        self.room_group_name = f"chat_{self.conversation_id}"

        if not self.user.is_authenticated:
            await self.close()
            return

        is_participant = await self.is_conversation_participant()
        if not is_participant:
            await self.close()
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        content = data.get("content", "").strip()
        if not content:
            return

        message = await self.save_message(content)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "message_id": message.id,
                "content": message.content,
                "sender_id": self.user.id,
                "sender_username": self.user.username,
                "created_at": message.created_at.isoformat(),
            },
        )

    async def chat_message(self, event):
        # Called for every message broadcast to the group; sends it to this socket.
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
        return Conversation.objects.filter(
            id=self.conversation_id,
            participants=self.user,
        ).exists()

    @database_sync_to_async
    def save_message(self, content):
        return Message.objects.create(
            conversation_id=self.conversation_id,
            sender=self.user,
            content=content,
        )
