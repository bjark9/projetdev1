# Transform database objects into a string or byte stream, such as JSON, to send data to a browser or API.
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "avatar", "is_online", "last_seen"]
        read_only_fields = ["id", "is_online", "last_seen"]
