import os
from clerk_backend_api import Clerk
from clerk_backend_api.security.types import AuthenticateRequestOptions
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth import get_user_model

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
        clerk_id = state.payload["sub"]  # e.g. "user_2abc..."

        user = User.objects.filter(clerk_id=clerk_id) # Look up the clerk_id from the Users model
        if user is None:
            profile = clerk.users.get(user_id=clerk_id)
            user = User(
                clerk_id=clerk_id,
                username=profile.username or clerk_id,
                first_name=profile.first_name or "",
                last_name=profile.last_name or "",
            )
        user.set_unusable_password()
        user.save()
        return (user, None)