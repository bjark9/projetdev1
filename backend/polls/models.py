# Create your models here.
# Here we will define the tables in the database. (Every Django model maps to a table.)
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model, extending Django's built-in auth User.
    Add any chat-specific fields here (avatar, status, etc).
    """
    # avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return self.username


class Conversation(models.Model):
    """
    A conversation between two or more users.
    Works for both 1-on-1 DMs and group chats.
    """
    # one conversation can have many users, and one user can be in many conversations.
    participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="conversations", # lets you go backward from a user to their conversations, like:
    )
    is_group = models.BooleanField(default=False)
    name = models.CharField(max_length=255, blank=True, null=True)  # used for group chats
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    #This tells Django: whenever you query Conversation.objects.all() without specifying an order, sort by updated_at descending (the - means descending). So the most recently active conversation shows up first — handy for a chat sidebar/inbox view.
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