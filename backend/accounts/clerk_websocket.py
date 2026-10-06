import os
from collections.abc import Awaitable, Callable
from typing import Any

from channels.db import database_sync_to_async
from clerk_backend_api.security import TokenVerificationError, VerifyTokenOptions, verify_token_async
from django.contrib.auth.models import AnonymousUser

from .models import User

Scope = dict[str, Any]
Receive = Callable[[], Awaitable[dict[str, Any]]]
Send = Callable[[dict[str, Any]], Awaitable[None]]


class ClerkWebSocketMiddleware:
    """Authenticates a WebSocket with the Clerk token sent as a subprotocol."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "websocket":
            return await self.app(scope, receive, send)

        token = self._get_token(scope)
        if not token:
            return await self.app(scope, receive, send)

        user = await self._get_user(token)

        authenticated_scope = dict(scope)
        authenticated_scope["user"] = user
        authenticated_scope["clerk_subprotocol"] = "clerk" if token else None
        return await self.app(authenticated_scope, receive, send)

    @staticmethod
    def _get_token(scope: Scope) -> str | None:
        protocols = scope.get("subprotocols", [])
        if len(protocols) == 2 and protocols[0] == "clerk":
            return protocols[1]
        return None

    @staticmethod
    async def _get_user(token: str):
        try:
            payload = await verify_token_async(
                token,
                VerifyTokenOptions(
                    secret_key=os.environ.get("CLERK_SECRET_KEY"),
                    authorized_parties=["http://localhost:5173"],
                ),
            )
        except TokenVerificationError:
            return AnonymousUser()

        clerk_id = payload.get("sub")
        if not clerk_id:
            return AnonymousUser()
        return await ClerkWebSocketMiddleware._find_user(clerk_id)

    @staticmethod
    @database_sync_to_async
    def _find_user(clerk_id: str):
        try:
            return User.objects.get(clerk_id=clerk_id)
        except User.DoesNotExist:
            return AnonymousUser()
