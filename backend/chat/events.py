from typing import Any

from channels.db import database_sync_to_async
from channels.layers import get_channel_layer

from .models import Conversation, Message


async def broadcast_message(message: Message) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        raise RuntimeError("No channel layer is configured.")

    sender = message.sender
    conversation_id = int(message.conversation_id)
    event: dict[str, Any] = {
        "type": "chat_message",
        "message_id": message.pk,
        "content": message.content,
        "sender_id": message.sender_id,
        "sender_username": sender.username,
        "sender_display_name": sender.get_full_name().strip() or sender.get_username(),
        "created_at": message.created_at.isoformat(),
    }
    await channel_layer.group_send(f"chat_{conversation_id}", event)

    for user_id in await conversation_member_ids(conversation_id):
        if user_id != message.sender_id:
            await channel_layer.group_send(
                f"notifications_{user_id}",
                {
                    "type": "notification_message",
                    "conversation_id": conversation_id,
                    "message_id": message.pk,
                },
            )


@database_sync_to_async
def conversation_member_ids(conversation_id: int) -> list[int]:
    return list(
        Conversation.objects.filter(
            pk=conversation_id,
            group__memberships__user_id__isnull=False,
        ).values_list(
            "group__memberships__user_id",
            flat=True,
        )
    )
