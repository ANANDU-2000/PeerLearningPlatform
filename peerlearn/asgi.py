"""
ASGI config for peerlearn project.
"""

import os

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')

django_asgi_app = get_asgi_application()

# Import after Django setup
import peerlearn.routing

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter(
                peerlearn.routing.websocket_urlpatterns
            )
        )
    ),
})
