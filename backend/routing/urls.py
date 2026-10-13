from django.urls import path

from . import views

urlpatterns = [
    path("health", views.health),
    path("plan", views.plan),
    path("plan/prepare", views.plan_prepare),
    path("plan/score", views.plan_score),
    path("heatmap", views.heatmap),
    path("heatmap/request", views.heatmap_request),
]
