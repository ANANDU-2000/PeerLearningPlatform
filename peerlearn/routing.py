"""
WebSocket URL routing configuration.
"""

from django.urls import path, re_path

from peerlearn.consumers import NotificationConsumer
from learning_sessions.consumers import SessionRTCConsumer

websocket_urlpatterns = [
    # Add path for user-specific notifications
    path('ws/notifications/<int:user_id>/', NotificationConsumer.as_asgi()),
    # Generic notifications path
    path('ws/notifications/', NotificationConsumer.as_asgi()),
    # Session/video paths - multiple paths for improved connection reliability
    path('ws/session/<str:session_id>/', SessionRTCConsumer.as_asgi()),
    path('ws/video/<str:session_id>/', SessionRTCConsumer.as_asgi()),
    path('ws/room/<str:session_id>/', SessionRTCConsumer.as_asgi()),
]
