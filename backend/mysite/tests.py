from django.test import SimpleTestCase
from redis.exceptions import TimeoutError as RedisTimeoutError

from .asgi import RedisChannelLayerErrorMiddleware


class RedisChannelLayerErrorMiddlewareTests(SimpleTestCase):
    async def test_redis_timeout_closes_websocket_with_server_error(self):
        async def failing_app(scope, receive, send):
            raise RedisTimeoutError("read timed out")

        sent_messages = []

        async def send(message):
            sent_messages.append(message)

        middleware = RedisChannelLayerErrorMiddleware(failing_app)
        await middleware({"type": "websocket"}, None, send)

        self.assertEqual(sent_messages, [{"type": "websocket.close", "code": 1011}])

    async def test_redis_timeout_during_disconnect_does_not_send_another_close(self):
        async def failing_app(scope, receive, send):
            await receive()
            raise RedisTimeoutError("read timed out")

        sent_messages = []

        async def receive():
            return {"type": "websocket.disconnect", "code": 1000}

        async def send(message):
            sent_messages.append(message)

        middleware = RedisChannelLayerErrorMiddleware(failing_app)
        await middleware({"type": "websocket"}, receive, send)

        self.assertEqual(sent_messages, [])

    async def test_non_redis_errors_are_not_suppressed(self):
        async def failing_app(scope, receive, send):
            raise ValueError("unexpected failure")

        middleware = RedisChannelLayerErrorMiddleware(failing_app)
        with self.assertRaisesMessage(ValueError, "unexpected failure"):
            await middleware({"type": "websocket"}, None, lambda message: None)
