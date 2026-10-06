import base64
import hashlib
import hmac
import json
import time
from unittest.mock import patch

from django.test import TestCase, override_settings

from .models import User

SIGNING_KEY = b"clerk-webhook-test-key"
SIGNING_SECRET = f"whsec_{base64.b64encode(SIGNING_KEY).decode()}"


@override_settings(CLERK_WEBHOOK_SIGNING_SECRET=SIGNING_SECRET)
class ClerkWebhookTests(TestCase):
    @patch("accounts.webhooks.Webhook")
    def test_user_created_is_saved_with_primary_email(self, webhook_class):
        webhook_class.return_value.verify.return_value = {
            "type": "user.created",
            "data": {
                "id": "user_123",
                "username": "relay-user",
                "first_name": "Relay",
                "last_name": "User",
                "primary_email_address_id": "email_1",
                "email_addresses": [{"id": "email_1", "email_address": "relay@example.com"}],
            },
        }

        response = self.client.post(
            "/api/webhooks/clerk/",
            data=json.dumps(
                {
                    "type": "user.created",
                    "data": {
                        "id": "user_123",
                        "username": "relay-user",
                        "first_name": "Relay",
                        "last_name": "User",
                        "primary_email_address_id": "email_1",
                        "email_addresses": [{"id": "email_1", "email_address": "relay@example.com"}],
                    },
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "synced"})
        user = User.objects.get(clerk_id="user_123")
        self.assertEqual(user.username, "relay-user")
        self.assertEqual(user.email, "relay@example.com")
        self.assertEqual(user.first_name, "Relay")
        self.assertEqual(user.last_name, "User")
        self.assertFalse(user.has_usable_password())

    @patch("accounts.webhooks.Webhook")
    def test_user_updated_updates_existing_user(self, webhook_class):
        User.objects.create_user(
            username="old-name",
            password=None,
            clerk_id="user_123",
            email="old@example.com",
        )
        webhook_class.return_value.verify.return_value = {
            "type": "user.updated",
            "data": {
                "id": "user_123",
                "username": "new-name",
                "email_addresses": [{"id": "email_1", "email_address": "new@example.com"}],
                "primary_email_address_id": "email_1",
            },
        }

        response = self.client.post(
            "/api/webhooks/clerk/",
            data=json.dumps(
                {
                    "type": "user.updated",
                    "data": {
                        "id": "user_123",
                        "username": "new-name",
                        "email_addresses": [{"id": "email_1", "email_address": "new@example.com"}],
                        "primary_email_address_id": "email_1",
                    },
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.count(), 1)
        user = User.objects.get(clerk_id="user_123")
        self.assertEqual(user.username, "new-name")
        self.assertEqual(user.email, "new@example.com")

    @patch("accounts.webhooks.Webhook")
    def test_session_created_adds_user_when_profile_event_was_missed(self, webhook_class):
        webhook_class.return_value.verify.return_value = None

        response = self.client.post(
            "/api/webhooks/clerk/",
            data=json.dumps({"type": "session.created", "data": {"user_id": "user_123"}}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "synced"})
        user = User.objects.get(clerk_id="user_123")
        self.assertEqual(user.username, "user_123")
        self.assertFalse(user.has_usable_password())

    @patch("accounts.webhooks.Webhook")
    def test_unknown_event_is_ignored(self, webhook_class):
        webhook_class.return_value.verify.return_value = None

        response = self.client.post(
            "/api/webhooks/clerk/",
            data=json.dumps({"type": "session.ended"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ignored"})
        self.assertEqual(User.objects.count(), 0)

    def test_request_without_signature_is_rejected(self):
        response = self.client.post(
            "/api/webhooks/clerk/",
            data=b'{"type":"user.created","data":{"id":"user_123"}}',
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(User.objects.count(), 0)

    def test_valid_signature_syncs_user(self):
        event = {"type": "user.created", "data": {"id": "user_signed"}}
        body = json.dumps(event, separators=(",", ":")).encode()
        message_id = "msg_test"
        timestamp = str(int(time.time()))
        signed_content = f"{message_id}.{timestamp}.{body.decode()}".encode()
        signature = base64.b64encode(hmac.new(SIGNING_KEY, signed_content, hashlib.sha256).digest()).decode()

        response = self.client.post(
            "/api/webhooks/clerk/",
            data=body,
            content_type="application/json",
            HTTP_SVIX_ID=message_id,
            HTTP_SVIX_TIMESTAMP=timestamp,
            HTTP_SVIX_SIGNATURE=f"v1,{signature}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(User.objects.filter(clerk_id="user_signed").exists())
