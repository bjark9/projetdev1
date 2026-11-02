import logging
import time

from django.http import HttpRequest, HttpResponse

logger = logging.getLogger("mysite.requests")


class RequestDebugMiddleware:
    """Logs each API step without logging authorization headers or request bodies."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        started = time.perf_counter()
        logger.info("HTTP start: %s %s", request.method, request.path)
        try:
            response = self.get_response(request)
        except Exception:
            logger.exception("HTTP exception: %s %s", request.method, request.path)
            raise

        duration_ms = round((time.perf_counter() - started) * 1000)
        user = getattr(request, "user", None)
        user_id = getattr(user, "id", None) if getattr(user, "is_authenticated", False) else None
        logger.info(
            "HTTP end: %s %s status=%s user_id=%s duration_ms=%s",
            request.method,
            request.path,
            response.status_code,
            user_id,
            duration_ms,
        )
        return response
