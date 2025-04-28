"""
WebSocket URL routing configuration.
"""

from django.urls import path, re_path

from peerlearn.consumers import NotificationConsumer
from learning_sessions.consumers import VideoRoomConsumer, WhiteboardConsumer

websocket_urlpatterns = [
    path('ws/notifications/', NotificationConsumer.as_asgi()),
    # Update the video path to match the client-side code
    path('ws/session/<str:session_id>/', VideoRoomConsumer.as_asgi()),
    # Keep the original path for backward compatibility
    path('ws/video/<str:session_id>/', VideoRoomConsumer.as_asgi()),
    path('ws/whiteboard/<str:session_id>/', WhiteboardConsumer.as_asgi()),
]
