from typing import cast

from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from mysite.asgi import application

from .models import Conversation, Group, Membership, Message

User = get_user_model()


class ChatConsumerTests(TransactionTestCase):
    def test_member_can_send_and_receive_a_message(self):
        user = User.objects.create_user(username="alice", password="password")
        group = Group.objects.create(name="general")
        Membership.objects.create(group=group, user=user)
        conversation = Conversation.objects.create(group=group, name="general")

        async_to_sync(self.check_websocket)(conversation.id, user)

        self.assertEqual(Message.objects.count(), 1)
        self.assertEqual(Message.objects.get().content, "Bonjour")

    def test_non_member_cannot_connect(self):
        user = User.objects.create_user(username="mallory", password="password")
        group = Group.objects.create(name="general")
        conversation = Conversation.objects.create(group=group, name="general")

        async_to_sync(self.check_rejected_websocket)(conversation.id, user)

    def test_empty_message_is_not_saved(self):
        user = User.objects.create_user(username="alice", password="password")
        group = Group.objects.create(name="general")
        Membership.objects.create(group=group, user=user)
        conversation = Conversation.objects.create(group=group, name="general")

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


class GroupApiTests(TestCase):
    def setUp(self):
        self.api_client = APIClient()
        self.alice = User.objects.create_user(username="alice")
        self.bob = User.objects.create_user(username="bob")

    def test_member_can_create_group(self):
        self.api_client.force_authenticate(user=self.alice)

        response = self.api_client.post(
            "/api/groups/",
            {
                "name": "Equipe de projet",
                "member_ids": [self.bob.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Group.objects.count(), 1)
        self.assertEqual(Membership.objects.count(), 2)

    def test_member_can_list_his_groups(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice)

        self.api_client.force_authenticate(user=self.alice)
        response = self.api_client.get("/api/groups/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Equipe de projet")

    def test_non_member_cannot_retrieve_group(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice)

        self.api_client.force_authenticate(user=self.bob)
        response = self.api_client.get(f"/api/groups/{group.id}/")

        self.assertEqual(response.status_code, 404)

    def test_member_can_create_conversation(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice)

        self.api_client.force_authenticate(user=self.alice)
        response = self.api_client.post(
            "/api/conversations/",
            {"group": group.id, "name": "General"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Conversation.objects.count(), 1)

    def test_member_can_send_message(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice)
        conversation = Conversation.objects.create(group=group, name="General")

        self.api_client.force_authenticate(user=self.alice)
        response = self.api_client.post(
            "/api/messages/",
            {"conversation": conversation.id, "content": "Bonjour"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Message.objects.get().content, "Bonjour")

    def test_non_member_cannot_send_message(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice)
        conversation = Conversation.objects.create(group=group, name="General")

        self.api_client.force_authenticate(user=self.bob)
        response = self.api_client.post(
            "/api/messages/",
            {"conversation": conversation.id, "content": "Message interdit"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Message.objects.count(), 0)

    def test_member_can_add_another_member(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice)

        self.api_client.force_authenticate(user=self.alice)
        response = self.api_client.post(
            f"/api/groups/{group.id}/members/",
            {"user_id": self.bob.id},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Membership.objects.filter(group=group, user=self.bob).exists())

    def test_member_can_remove_a_member(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice)
        Membership.objects.create(group=group, user=self.bob)

        self.api_client.force_authenticate(user=self.alice)
        response = self.api_client.delete(f"/api/groups/{group.id}/members/{self.bob.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Membership.objects.filter(group=group, user=self.bob).exists())

    def test_non_member_cannot_manage_group_members(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice)

        self.api_client.force_authenticate(user=self.bob)
        response = self.api_client.post(
            f"/api/groups/{group.id}/members/",
            {"user_id": self.bob.id},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
