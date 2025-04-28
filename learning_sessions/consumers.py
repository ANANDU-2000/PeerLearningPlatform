"""
WebSocket consumers for real-time session functionality.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone

from learning_sessions.models import Session, Booking


class VideoRoomConsumer(AsyncWebsocketConsumer):
    """
    Consumer for real-time video chat in session rooms.
    """
    
    async def connect(self):
        """Handle connection to WebSocket."""
        self.user = self.scope["user"]
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.room_group_name = f'session_{self.session_id}'
        
        # Check if user is authorized to join this session
        is_authorized = await self._check_user_session_permission()
        
        if not is_authorized:
            await self.close()
            return
        
        # Add user to session group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # Send message that a new user has joined
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_join',
                'user_id': str(self.user.id),
                'user_name': self.user.get_full_name(),
                'is_mentor': self.user.role == 'mentor',
                'timestamp': timezone.now().isoformat(),
            }
        )
    
    async def disconnect(self, close_code):
        """Handle disconnection from WebSocket."""
        if hasattr(self, 'room_group_name'):
            # Send message that user has left
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'user_leave',
                    'user_id': str(self.user.id),
                    'user_name': self.user.get_full_name(),
                    'timestamp': timezone.now().isoformat(),
                }
            )
            
            # Remove user from session group
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
    
    async def receive(self, text_data):
        """Receive message from WebSocket."""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            print(f"WebSocket received message of type: {message_type} from user: {self.user.get_full_name()}")
            
            # Handle different message types
            if message_type == 'offer':
                print(f"Processing WebRTC offer from user ID: {self.user.id} to user ID: {data.get('to_user_id')}")
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'webrtc_offer',
                        'offer': data['offer'],
                        'from_user_id': str(self.user.id),
                        'to_user_id': data['to_user_id'],
                    }
                )
            
            elif message_type == 'answer':
                print(f"Processing WebRTC answer from user ID: {self.user.id} to user ID: {data.get('to_user_id')}")
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'webrtc_answer',
                        'answer': data['answer'],
                        'from_user_id': str(self.user.id),
                        'to_user_id': data['to_user_id'],
                    }
                )
            
            elif message_type == 'candidate':
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'webrtc_candidate',
                        'candidate': data['candidate'],
                        'from_user_id': str(self.user.id),
                        'to_user_id': data['to_user_id'],
                    }
                )
            
            elif message_type == 'chat':
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'chat_message',
                        'message': data['message'],
                        'from_user_id': str(self.user.id),
                        'from_user_name': self.user.get_full_name(),
                        'timestamp': timezone.now().isoformat(),
                    }
                )
            
            elif message_type == 'raise_hand':
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'raise_hand',
                        'user_id': str(self.user.id),
                        'user_name': self.user.get_full_name(),
                        'timestamp': timezone.now().isoformat(),
                    }
                )
            
            elif message_type == 'connection_error':
                # New message type for connection troubleshooting
                print(f"WebRTC connection error reported by user {self.user.id}: {data.get('error')}")
                # Notify other users about connection issues
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'connection_error',
                        'user_id': str(self.user.id),
                        'user_name': self.user.get_full_name(),
                        'error': data.get('error', 'Unknown error'),
                        'timestamp': timezone.now().isoformat(),
                    }
                )
            
            else:
                print(f"Unknown WebSocket message type: {message_type} from user: {self.user.id}")
            
        except json.JSONDecodeError:
            print(f"Invalid JSON received in WebSocket from user: {self.user.id}")
        except Exception as e:
            print(f"Error processing WebSocket message: {str(e)} from user: {self.user.id}")
            # Send error back to client for debugging
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': f"Server error: {str(e)}",
                'timestamp': timezone.now().isoformat(),
            }))
    
    async def webrtc_offer(self, event):
        """Send offer to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'offer',
            'offer': event['offer'],
            'from_user_id': event['from_user_id'],
            'to_user_id': event['to_user_id'],
        }))
    
    async def webrtc_answer(self, event):
        """Send answer to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'answer',
            'answer': event['answer'],
            'from_user_id': event['from_user_id'],
            'to_user_id': event['to_user_id'],
        }))
    
    async def webrtc_candidate(self, event):
        """Send ICE candidate to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'candidate',
            'candidate': event['candidate'],
            'from_user_id': event['from_user_id'],
            'to_user_id': event['to_user_id'],
        }))
    
    async def chat_message(self, event):
        """Send chat message to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'chat',
            'message': event['message'],
            'from_user_id': event['from_user_id'],
            'from_user_name': event['from_user_name'],
            'timestamp': event['timestamp'],
        }))
    
    async def user_join(self, event):
        """Send user join notification to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'user_join',
            'user_id': event['user_id'],
            'user_name': event['user_name'],
            'is_mentor': event['is_mentor'],
            'timestamp': event['timestamp'],
        }))
    
    async def user_leave(self, event):
        """Send user leave notification to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'user_leave',
            'user_id': event['user_id'],
            'user_name': event['user_name'],
            'timestamp': event['timestamp'],
        }))
    
    async def raise_hand(self, event):
        """Send raise hand notification to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'raise_hand',
            'user_id': event['user_id'],
            'user_name': event['user_name'],
            'timestamp': event['timestamp'],
        }))
    
    @database_sync_to_async
    def _check_user_session_permission(self):
        """Check if user has permission to join this session room."""
        try:
            session = Session.objects.get(id=self.session_id)
            
            # Mentor can always join their own session
            if self.user.role == 'mentor' and session.mentor.user_id == self.user.id:
                return True
            
            # TESTING ONLY: Allow any learner to join any session for testing
            if self.user.role == 'learner':
                # Check if they have an existing booking (better for testing)
                has_booking = Booking.objects.filter(
                    session_id=self.session_id,
                    learner_id=self.user.id
                ).exists()
                
                # If they have a booking (any status) or it's our test learner, allow access
                return has_booking or 'test_learner' in self.user.email
            
            return False
        except Session.DoesNotExist:
            return False


class WhiteboardConsumer(AsyncWebsocketConsumer):
    """
    Consumer for real-time whiteboard collaboration.
    """
    
    async def connect(self):
        """Handle connection to WebSocket."""
        self.user = self.scope["user"]
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.room_group_name = f'whiteboard_{self.session_id}'
        
        # Check if user is authorized to join this session
        is_authorized = await self._check_user_session_permission()
        
        if not is_authorized:
            await self.close()
            return
        
        # Add user to whiteboard group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
    
    async def disconnect(self, close_code):
        """Handle disconnection from WebSocket."""
        if hasattr(self, 'room_group_name'):
            # Remove user from whiteboard group
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
    
    async def receive(self, text_data):
        """Receive message from WebSocket."""
        data = json.loads(text_data)
        
        # Forward whiteboard drawing data to all users in the group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'whiteboard_data',
                'data': data,
                'from_user_id': str(self.user.id),
            }
        )
    
    async def whiteboard_data(self, event):
        """Send whiteboard data to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'whiteboard_data',
            'data': event['data'],
            'from_user_id': event['from_user_id'],
        }))
    
    @database_sync_to_async
    def _check_user_session_permission(self):
        """Check if user has permission to join this whiteboard."""
        try:
            session = Session.objects.get(id=self.session_id)
            
            # Mentor can always join their own session
            if self.user.role == 'mentor' and session.mentor.user_id == self.user.id:
                return True
            
            # TESTING ONLY: Allow any learner to join any session for testing
            if self.user.role == 'learner':
                # Check if they have an existing booking (better for testing)
                has_booking = Booking.objects.filter(
                    session_id=self.session_id,
                    learner_id=self.user.id
                ).exists()
                
                # If they have a booking (any status) or it's our test learner, allow access
                return has_booking or 'test_learner' in self.user.email
            
            return False
        except Session.DoesNotExist:
            return False
