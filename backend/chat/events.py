from typing import Any

from channels.db import database_sync_to_async
from channels.layers import get_channel_layer

from .models import Conversation, Message, MessageAttachment
from .serializers import AttachmentSerializer


async def broadcast_message(
    message: Message,
    member_ids: list[int] | None = None,
) -> None:
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
        "attachments": await message_attachments(message.pk),
    }
    await channel_layer.group_send(f"chat_{conversation_id}", event)

    if member_ids is None:
        member_ids = await conversation_member_ids(conversation_id)

    for user_id in member_ids:
        if user_id != message.sender_id:
            await channel_layer.group_send(
                f"notifications_{user_id}",
                {
                    "type": "notification_message",
                    "conversation_id": conversation_id,
                    "message_id": message.pk,
                },
            )


async def broadcast_message_deleted(message_id: int, conversation_id: int) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        raise RuntimeError("No channel layer is configured.")

    await channel_layer.group_send(
        f"chat_{conversation_id}",
        {
            "type": "chat_message_deleted",
            "message_id": message_id,
        },
    )


async def broadcast_message_edited(message: Message) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        raise RuntimeError("No channel layer is configured.")
    if message.edited_at is None:
        raise ValueError("An edited message must have an edited_at timestamp.")

    await channel_layer.group_send(
        f"chat_{message.conversation_id}",
        {
            "type": "chat_message_edited",
            "message_id": message.pk,
            "content": message.content,
            "edited_at": message.edited_at.isoformat(),
        },
    )


async def broadcast_message_reaction(
    message_id: int,
    conversation_id: int,
    reactions: dict[str, int],
) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        raise RuntimeError("No channel layer is configured.")

    await channel_layer.group_send(
        f"chat_{conversation_id}",
        {
            "type": "chat_message_reaction",
            "message_id": message_id,
            "reactions": reactions,
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


@database_sync_to_async
def message_attachments(message_id: int) -> list[dict[str, Any]]:
    return [
        dict(attachment)
        for attachment in AttachmentSerializer(
            MessageAttachment.objects.filter(message_id=message_id),
            many=True,
        ).data
    ]
