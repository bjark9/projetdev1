# Transform database objects into a string or byte stream, such as JSON, to send data to a browser or API.
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "display_name", "is_online", "last_seen"]
        read_only_fields = ["id", "display_name", "is_online", "last_seen"]

    def get_display_name(self, user):
        return user.get_full_name().strip() or user.get_username()
