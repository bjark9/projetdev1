from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ConversationViewSet, GroupViewSet, MessageViewSet

router = DefaultRouter()
router.register("groups", GroupViewSet, basename="group")
router.register("conversations", ConversationViewSet, basename="conversation")
router.register("messages", MessageViewSet, basename="message")

urlpatterns = [path("", include(router.urls))]