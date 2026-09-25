"""
WSGI config for mysite project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.1/howto/deployment/wsgi/
"""

import os
import sys

from pathlib import Path

from django.core.wsgi import get_wsgi_application

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
for path in (str(BASE_DIR), str(PROJECT_ROOT)):
	if path not in sys.path:
		sys.path.insert(0, path)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.mysite.settings")

application = get_wsgi_application()
