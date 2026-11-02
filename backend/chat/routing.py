# Maps a URL pattern (api/ws/chat/<id>/) to that consumer.
from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"^api/ws/notifications/$",
        consumers.NotificationConsumer.as_asgi(),  # type: ignore[arg-type]
    ),
    re_path(
        r"^api/ws/chat/(?P<conversation_id>\d+)/$",
        consumers.ChatConsumer.as_asgi(),  # type: ignore[arg-type]
    ),
]
