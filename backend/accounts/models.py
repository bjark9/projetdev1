from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model, extending Django's built-in auth User.
    """

    # avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(blank=True, null=True)

    # Required when subclassing AbstractUser: Django's built-in auth.User
    # model (unused, but still present since django.contrib.auth is
    # installed) defines groups/user_permissions with related_name
    # "user_set" too. Overriding related_name here avoids the clash.
    groups = models.ManyToManyField(  # type: ignore[assignment]
        "auth.Group",
        related_name="accounts_user_set",
        blank=True,
    )
    user_permissions = models.ManyToManyField(  # type: ignore[assignment]
        "auth.Permission",
        related_name="accounts_user_permissions_set",
        blank=True,
    )

    def __str__(self):
        return self.username
