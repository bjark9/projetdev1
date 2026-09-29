from typing import cast

from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase

from mysite.asgi import application

from .models import Conversation, Message

User = get_user_model()


class ChatConsumerTests(TransactionTestCase):
    def test_member_can_send_and_receive_a_message(self):
        user = User.objects.create_user(username="alice", password="password")
        conversation = Conversation.objects.create(name="general")
        conversation.participants.add(user)

        async_to_sync(self.check_websocket)(conversation.id, user)

        self.assertEqual(Message.objects.count(), 1)
        self.assertEqual(Message.objects.get().content, "Bonjour")

    def test_non_member_cannot_connect(self):
        user = User.objects.create_user(username="mallory", password="password")
        conversation = Conversation.objects.create(name="general")

        async_to_sync(self.check_rejected_websocket)(conversation.id, user)

    def test_empty_message_is_not_saved(self):
        user = User.objects.create_user(username="alice", password="password")
        conversation = Conversation.objects.create(name="general")
        conversation.participants.add(user)

        async_to_sync(self.check_empty_message)(conversation.id, user)

        self.assertEqual(Message.objects.count(), 0)

    async def check_websocket(self, conversation_id, user):
        communicator = WebsocketCommunicator(
            application,
            f"/ws/chat/{conversation_id}/",
        )
        cast(dict[str, object], communicator.scope)["user"] = user

        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await communicator.send_json_to({"content": "Bonjour"})
        response = await communicator.receive_json_from()

        self.assertEqual(response["content"], "Bonjour")
        self.assertEqual(response["sender_username"], "alice")

        await communicator.disconnect()

    async def check_rejected_websocket(self, conversation_id, user):
        communicator = WebsocketCommunicator(
            application,
            f"/ws/chat/{conversation_id}/",
        )
        cast(dict[str, object], communicator.scope)["user"] = user

        connected, _ = await communicator.connect()
        self.assertFalse(connected)

    async def check_empty_message(self, conversation_id, user):
        communicator = WebsocketCommunicator(
            application,
            f"/ws/chat/{conversation_id}/",
        )
        cast(dict[str, object], communicator.scope)["user"] = user

        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await communicator.send_json_to({"content": "   "})
        self.assertTrue(await communicator.receive_nothing(timeout=0.1))

        await communicator.disconnect()
