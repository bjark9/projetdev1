# Create your models here.
from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """
    A conversation between two or more users.
    Works for both 1-on-1 DMs and group chats.
    """

    participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="conversations",
    )
    is_group = models.BooleanField(default=False)
    name = models.CharField(max_length=255, blank=True)  # used for group chats
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        if self.name:
            return self.name
        usernames = ", ".join(u.username for u in self.participants.all()[:3])
        return usernames or f"Conversation {self.pk}"


class Message(models.Model):
    """
    A single message sent within a conversation.
    """

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_messages",
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(blank=True, null=True)
    read_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="read_messages",
        blank=True,
    )

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender}: {self.content[:30]}"
