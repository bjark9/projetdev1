import os

from clerk_backend_api import Clerk
from clerk_backend_api.security.types import AuthenticateRequestOptions
from django.contrib.auth import get_user_model
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

User = get_user_model()

clerk = Clerk(bearer_auth=os.environ["CLERK_SECRET_KEY"])


class ClerkAuthentication(BaseAuthentication):
    def authenticate(self, request):
        state = clerk.authenticate_request(
            request,
            AuthenticateRequestOptions(
                authorized_parties=["http://localhost:5173"]  # your frontend origin
            ),
        )
        if not state.is_signed_in:
            raise AuthenticationFailed("Not signed in")
        clerk_id = state.payload.get("sub")
        if not clerk_id:
            raise AuthenticationFailed("Clerk token does not contain a user id")

        user = User.objects.filter(clerk_id=clerk_id).first()
        if user is None:
            profile = clerk.users.get(user_id=clerk_id)
            username = (profile.username or clerk_id)[:150]
            if User.objects.exclude(clerk_id=clerk_id).filter(username=username).exists():
                username = clerk_id[:150]
            user, created = User.objects.get_or_create(
                clerk_id=clerk_id,
                defaults={
                    "username": username,
                    "first_name": profile.first_name or "",
                    "last_name": profile.last_name or "",
                },
            )
            if created:
                user.set_unusable_password()
                user.save(update_fields=["password"])

        return (user, None)
