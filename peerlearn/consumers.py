"""
WebSocket consumers for real-time functionality.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone


class NotificationConsumer(AsyncWebsocketConsumer):
    """
    Consumer for real-time notifications.
    """
    async def connect(self):
        self.user = self.scope["user"]
        
        if not self.user.is_authenticated:
            await self.close()
            return
            
        self.notification_group_name = f'notifications_{self.user.id}'
        
        # Add user to their notification group
        await self.channel_layer.group_add(
            self.notification_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # Send initial connection confirmation
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'message': 'Connected to notification service'
        }))

    async def disconnect(self, close_code):
        # Remove user from their notification group
        if hasattr(self, 'notification_group_name'):
            await self.channel_layer.group_discard(
                self.notification_group_name,
                self.channel_name
            )

    # Receive message from WebSocket
    async def receive(self, text_data):
        pass  # Notifications are primarily server-initiated

    # Receive message from notification group
    async def notification_message(self, event):
        # Send notification to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'notification',
            'message': event['message'],
            'title': event.get('title', 'Notification'),
            'timestamp': timezone.now().isoformat(),
            'link': event.get('link', None),
            'data': event.get('data', {})
        }))
