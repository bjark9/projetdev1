"""
ASGI config for mysite project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.1/howto/deployment/asgi/
"""

import logging
import os
import sys
from pathlib import Path

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
for path in (str(BASE_DIR), str(PROJECT_ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mysite.settings")
# Initialize Django ASGI application early to ensure the AppRegistry
# is populated before importing code that may import ORM models.
django_asgi_app = get_asgi_application()

import chat.routing  # noqa: E402  (must come after django_asgi_app is set up)
from accounts.clerk_websocket import ClerkWebSocketMiddleware  # noqa: E402


class RedisChannelLayerErrorMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        disconnect_received = False

        async def receive_with_disconnect_tracking():
            nonlocal disconnect_received
            message = await receive()
            if message["type"] == "websocket.disconnect":
                disconnect_received = True
            return message

        try:
            await self.app(scope, receive_with_disconnect_tracking, send)
        except (RedisConnectionError, RedisTimeoutError) as exc:
            logger.warning("WebSocket closed after a Redis channel-layer failure: %s", exc)
            if not disconnect_received:
                await send({"type": "websocket.close", "code": 1011})


websocket_application = RedisChannelLayerErrorMiddleware(
    AuthMiddlewareStack(
        ClerkWebSocketMiddleware(
            URLRouter(chat.routing.websocket_urlpatterns)  # type: ignore[arg-type]
        )
    )
)

application = ProtocolTypeRouter(
    {
        # Les requêtes classiques passent par Django.
        "http": django_asgi_app,
        # Les WebSockets passent par Clerk, les sessions Django puis le routing chat.
        "websocket": websocket_application,
    }
)
