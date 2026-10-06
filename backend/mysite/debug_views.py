import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.http import JsonResponse


# TEMPORARY - DELETE AFTER DEBUGGING
def debug_db(request):
    expected_token = os.environ.get("DEBUG_DB_TOKEN")
    provided_token = request.GET.get("token")
    if not expected_token:
        return JsonResponse({"detail": "no env var set"}, status=404)
    if not provided_token:
        return JsonResponse({"detail": "token missing"}, status=404)
    if provided_token != expected_token:
        return JsonResponse({"detail": "token wrong"}, status=404)

    try:
        user_model = get_user_model()
        latest_user_joined = (
            user_model.objects.order_by("-date_joined")
            .values_list("date_joined", flat=True)
            .first()
        )
        return JsonResponse(
            {
                "vendor": connection.vendor,
                "host": connection.settings_dict["HOST"],
                "name": connection.settings_dict["NAME"],
                "users": user_model.objects.count(),
                "latest_user_joined": latest_user_joined,
                "debug": settings.DEBUG,
            }
        )
    except Exception as exc:
        return JsonResponse(
            {
                "exception_class": type(exc).__name__,
                "message": str(exc),
            },
            status=500,
        )
