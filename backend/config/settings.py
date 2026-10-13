"""Settings for a stateless JSON API: no admin, sessions or templates."""
import os
import tempfile
from pathlib import Path

from django.core.management.utils import get_random_secret_key

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path):
    """Read KEY=VALUE lines from backend/.env. Real environment variables win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv(BASE_DIR / '.env')

DEBUG = os.environ.get('DJANGO_DEBUG', '0') == '1'
# Nothing is signed (no sessions or auth), so a random key is fine when none is set.
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY') or get_random_secret_key()
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'rest_framework',
    'corsheaders',
    'routing',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

TIME_ZONE = 'UTC'
USE_TZ = True

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'DEFAULT_AUTHENTICATION_CLASSES': [],
    'UNAUTHENTICATED_USER': None,
}

_cors = os.environ.get('CORS_ALLOWED_ORIGINS', '')
if _cors:
    CORS_ALLOWED_ORIGINS = _cors.split(',')
else:
    CORS_ALLOW_ALL_ORIGINS = True

# A file cache, not an in-memory one: the plan saved by POST /api/plan must be visible to
# GET /api/heatmap even when gunicorn sends the two requests to different workers.
CACHES = {'default': {
    'BACKEND': 'django.core.cache.backends.filebased.FileBasedCache',
    'LOCATION': os.environ.get('CACHE_DIR') or os.path.join(tempfile.gettempdir(), 'spotter-truck-routing-cache'),
    'TIMEOUT': 1800,
    'OPTIONS': {'MAX_ENTRIES': 2000},
}}

ORS_API_KEY = os.environ.get('ORS_API_KEY', '')
# Nominatim's usage policy requires an identifying User-Agent.
HTTP_USER_AGENT = os.environ.get('HTTP_USER_AGENT', 'spotter-truck-routing/1.0 (https://github.com/spotter-truck-routing)')
