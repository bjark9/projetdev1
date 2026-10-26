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
        # Prépare un groupe réel: le WebSocket doit vérifier le membership.
        user = User.objects.create_user(username="alice", password="password")
        group = Group.objects.create(name="general")
        Membership.objects.create(group=group, user=user)
        conversation = Conversation.objects.create(group=group, name="general")

        async_to_sync(self.check_websocket)(conversation.id, user)

        self.assertEqual(Message.objects.count(), 1)
        self.assertEqual(Message.objects.get().content, "Bonjour")

    def test_message_is_broadcast_to_all_connected_members(self):
        alice = User.objects.create_user(username="alice")
        bob = User.objects.create_user(username="bob")
        group = Group.objects.create(name="general")
        Membership.objects.create(group=group, user=alice)
        Membership.objects.create(group=group, user=bob)
        conversation = Conversation.objects.create(group=group, name="general")

        async_to_sync(self.check_broadcast_to_members)(conversation.id, alice, bob)

        self.assertEqual(Message.objects.count(), 1)

    def test_non_member_cannot_connect(self):
        # Le groupe existe, mais l'utilisateur n'en est pas membre.
        user = User.objects.create_user(username="mallory", password="password")
        group = Group.objects.create(name="general")
        conversation = Conversation.objects.create(group=group, name="general")

        async_to_sync(self.check_rejected_websocket)(conversation.id, user)

    def test_empty_message_is_not_saved(self):
        # Un message composé uniquement d'espaces ne doit pas entrer en base.
        user = User.objects.create_user(username="alice", password="password")
        group = Group.objects.create(name="general")
        Membership.objects.create(group=group, user=user)
        conversation = Conversation.objects.create(group=group, name="general")

        async_to_sync(self.check_empty_message)(conversation.id, user)

        self.assertEqual(Message.objects.count(), 0)

    async def check_websocket(self, conversation_id, user):
        # WebsocketCommunicator simule un navigateur connecté au consumer ASGI.
        communicator = WebsocketCommunicator(
            application,
            f"/api/ws/chat/{conversation_id}/",
        )
        cast(dict[str, object], communicator.scope)["user"] = user

        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await communicator.send_json_to({"content": "Bonjour"})
        # Le consumer enregistre puis renvoie le message au groupe.
        response = await communicator.receive_json_from()

        self.assertEqual(response["content"], "Bonjour")
        self.assertEqual(response["sender_username"], "alice")
        self.assertTrue(response["is_mine"])

        await communicator.disconnect()

    async def check_broadcast_to_members(self, conversation_id, alice, bob):
        communicators = [WebsocketCommunicator(application, f"/api/ws/chat/{conversation_id}/") for _ in (alice, bob)]
        for communicator, user in zip(communicators, (alice, bob), strict=True):
            cast(dict[str, object], communicator.scope)["user"] = user
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

        await communicators[0].send_json_to({"content": "Bonjour"})
        alice_message = await communicators[0].receive_json_from()
        bob_message = await communicators[1].receive_json_from()

        self.assertEqual(alice_message["content"], "Bonjour")
        self.assertTrue(alice_message["is_mine"])
        self.assertFalse(bob_message["is_mine"])
        self.assertEqual(bob_message["sender_username"], "alice")

        await communicators[0].disconnect()
        await communicators[1].disconnect()

    async def check_rejected_websocket(self, conversation_id, user):
        communicator = WebsocketCommunicator(
            application,
            f"/api/ws/chat/{conversation_id}/",
        )
        cast(dict[str, object], communicator.scope)["user"] = user

        connected, _ = await communicator.connect()
        self.assertFalse(connected)

    async def check_empty_message(self, conversation_id, user):
        communicator = WebsocketCommunicator(
            application,
            f"/api/ws/chat/{conversation_id}/",
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
        # Le serializer ajoute automatiquement Alice comme membre créateur.
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
        self.assertEqual(
            Membership.objects.get(group_id=response.data["id"], user=self.alice).role,
            Membership.Role.OWNER,
        )
        self.assertEqual(
            Membership.objects.get(group_id=response.data["id"], user=self.bob).role,
            Membership.Role.MEMBER,
        )

    def test_member_can_list_his_groups(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice)

        self.api_client.force_authenticate(user=self.alice)
        response = self.api_client.get("/api/groups/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Equipe de projet")

    def test_non_member_cannot_retrieve_group(self):
        # L'absence du groupe dans le queryset produit un 404 pour Bob.
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

    def test_message_history_includes_sender_name_and_ownership(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice)
        Membership.objects.create(group=group, user=self.bob)
        conversation = Conversation.objects.create(group=group, name="General")
        message = Message.objects.create(
            conversation=conversation,
            sender=self.alice,
            content="Bonjour",
        )

        self.api_client.force_authenticate(user=self.bob)
        response = self.api_client.get(f"/api/messages/?conversation={conversation.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["id"], message.id)
        self.assertEqual(response.data[0]["sender"]["username"], "alice")
        self.assertFalse(response.data[0]["is_mine"])

        self.api_client.force_authenticate(user=self.alice)
        own_history = self.api_client.get(f"/api/messages/?conversation={conversation.id}")

        self.assertTrue(own_history.data[0]["is_mine"])

    def test_non_member_cannot_send_message(self):
        # La validation du serializer bloque l'écriture hors du groupe.
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

    def test_owner_can_add_another_member(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice, role=Membership.Role.OWNER)

        self.api_client.force_authenticate(user=self.alice)
        response = self.api_client.post(
            f"/api/groups/{group.id}/members/",
            {"user_id": self.bob.id},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Membership.objects.filter(group=group, user=self.bob).exists())
        self.assertEqual(response.data["current_user_role"], Membership.Role.OWNER)
        self.assertEqual(
            next(member["role"] for member in response.data["members"] if member["user"]["id"] == self.bob.id),
            Membership.Role.MEMBER,
        )

    def test_owner_can_remove_a_member(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice, role=Membership.Role.OWNER)
        Membership.objects.create(group=group, user=self.bob)

        self.api_client.force_authenticate(user=self.alice)
        response = self.api_client.delete(f"/api/groups/{group.id}/members/{self.bob.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Membership.objects.filter(group=group, user=self.bob).exists())

    def test_regular_member_cannot_manage_members(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice, role=Membership.Role.OWNER)
        Membership.objects.create(group=group, user=self.bob, role=Membership.Role.MEMBER)
        charlie = User.objects.create_user(username="charlie")

        self.api_client.force_authenticate(user=self.bob)
        response = self.api_client.post(
            f"/api/groups/{group.id}/members/",
            {"user_id": charlie.id},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Membership.objects.filter(group=group, user=charlie).exists())

    def test_admin_can_add_and_remove_members_but_not_admins(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice, role=Membership.Role.OWNER)
        Membership.objects.create(group=group, user=self.bob, role=Membership.Role.ADMIN)
        charlie = User.objects.create_user(username="charlie")
        dave = User.objects.create_user(username="dave")
        Membership.objects.create(group=group, user=dave, role=Membership.Role.ADMIN)

        self.api_client.force_authenticate(user=self.bob)
        add_response = self.api_client.post(
            f"/api/groups/{group.id}/members/",
            {"user_id": charlie.id},
            format="json",
        )
        self.assertEqual(add_response.status_code, 201)

        remove_member_response = self.api_client.delete(
            f"/api/groups/{group.id}/members/{charlie.id}/"
        )
        self.assertEqual(remove_member_response.status_code, 204)

        remove_admin_response = self.api_client.delete(
            f"/api/groups/{group.id}/members/{dave.id}/"
        )
        self.assertEqual(remove_admin_response.status_code, 403)
        remove_owner_response = self.api_client.delete(
            f"/api/groups/{group.id}/members/{self.alice.id}/"
        )
        self.assertEqual(remove_owner_response.status_code, 400)
        self.assertTrue(Membership.objects.filter(group=group, user=self.alice).exists())
        self.assertTrue(Membership.objects.filter(group=group, user=dave).exists())

    def test_only_owner_can_change_member_role(self):
        group = Group.objects.create(name="Equipe de projet")
        Membership.objects.create(group=group, user=self.alice, role=Membership.Role.OWNER)
        Membership.objects.create(group=group, user=self.bob, role=Membership.Role.MEMBER)

        self.api_client.force_authenticate(user=self.bob)
        forbidden = self.api_client.patch(
            f"/api/groups/{group.id}/members/{self.bob.id}/role/",
            {"role": Membership.Role.ADMIN},
            format="json",
        )
        self.assertEqual(forbidden.status_code, 403)

        self.api_client.force_authenticate(user=self.alice)
        response = self.api_client.patch(
            f"/api/groups/{group.id}/members/{self.bob.id}/role/",
            {"role": Membership.Role.ADMIN},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            Membership.objects.get(group=group, user=self.bob).role,
            Membership.Role.ADMIN,
        )

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
