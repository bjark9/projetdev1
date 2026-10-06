import json
import logging
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from svix.webhooks import Webhook, WebhookVerificationError

logger = logging.getLogger(__name__)
User = get_user_model()


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _email_for_user(user_data: dict[str, Any]) -> str:
    email_addresses = user_data.get("email_addresses", [])
    if not isinstance(email_addresses, list):
        return ""

    primary_email_id = user_data.get("primary_email_address_id")
    for email in email_addresses:
        if isinstance(email, dict) and email.get("id") == primary_email_id:
            return _text(email.get("email_address"))

    for email in email_addresses:
        if isinstance(email, dict):
            address = _text(email.get("email_address"))
            if address:
                return address
    return ""


def _unique_username(preferred: str, clerk_id: str) -> str:
    candidate = preferred[:150] or clerk_id[:150]
    if not User.objects.exclude(clerk_id=clerk_id).filter(username=candidate).exists():
        return candidate

    suffix = 0
    while True:
        suffix += 1
        tail = f"-{suffix}"
        candidate = f"{clerk_id[: 150 - len(tail)]}{tail}"
        if not User.objects.exclude(clerk_id=clerk_id).filter(username=candidate).exists():
            return candidate


def _sync_clerk_user(user_data: dict[str, Any]) -> None:
    clerk_id = _text(user_data.get("id"))
    if not clerk_id:
        raise ValueError("Clerk user event is missing its id")

    email = _email_for_user(user_data)
    username = _unique_username(
        _text(user_data.get("username")) or email.partition("@")[0],
        clerk_id,
    )
    user, created = User.objects.update_or_create(
        clerk_id=clerk_id,
        defaults={
            "username": username,
            "email": email,
            "first_name": _text(user_data.get("first_name")),
            "last_name": _text(user_data.get("last_name")),
        },
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=["password"])


def _ensure_clerk_user(clerk_id: str) -> None:
    user, created = User.objects.get_or_create(
        clerk_id=clerk_id,
        defaults={"username": _unique_username("", clerk_id)},
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=["password"])


@csrf_exempt
@require_POST
def clerk_webhook(request: HttpRequest) -> HttpResponse:
    signing_secret = settings.CLERK_WEBHOOK_SIGNING_SECRET
    if not signing_secret:
        logger.error("CLERK_WEBHOOK_SIGNING_SECRET is not configured")
        return HttpResponse("Clerk webhook signing secret is not configured", status=500)

    try:
        Webhook(signing_secret).verify(request.body, dict(request.headers))
    except WebhookVerificationError:
        logger.warning("Rejected Clerk webhook with an invalid signature")
        return HttpResponse("Invalid webhook signature", status=400)

    try:
        event = json.loads(request.body)
    except json.JSONDecodeError:
        logger.warning("Rejected Clerk webhook with invalid JSON")
        return HttpResponse("Invalid Clerk webhook payload", status=400)

    if not isinstance(event, dict):
        return HttpResponse("Invalid Clerk webhook payload", status=400)

    event_type = event.get("type")
    if event_type == "session.created":
        session_data = event.get("data")
        if not isinstance(session_data, dict):
            return HttpResponse("Invalid Clerk session payload", status=400)
        clerk_id = _text(session_data.get("user_id"))
        if not clerk_id:
            return HttpResponse("Invalid Clerk session payload", status=400)
        _ensure_clerk_user(clerk_id)
        return JsonResponse({"status": "synced"})

    if event_type not in {"user.created", "user.updated"}:
        return JsonResponse({"status": "ignored"})

    user_data = event.get("data")
    if not isinstance(user_data, dict):
        return HttpResponse("Invalid Clerk user payload", status=400)

    try:
        _sync_clerk_user(user_data)
    except ValueError as error:
        logger.warning("Rejected Clerk user webhook: %s", error)
        return HttpResponse("Invalid Clerk user payload", status=400)

    return JsonResponse({"status": "synced"})
