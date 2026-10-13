"""Root URLs: /health for the host's health check, the API under /api/."""
from django.http import JsonResponse
from django.urls import include, path

urlpatterns = [
    path('health', lambda r: JsonResponse({'ok': True})),
    path('api/', include('routing.urls')),
]
