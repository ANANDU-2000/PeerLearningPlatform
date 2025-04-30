import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from learning_sessions.models import Session, Booking

User = get_user_model()

class SessionRTCConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for handling WebRTC signaling in session rooms.
    This handles the exchange of connection offers, answers, and ICE candidates.
    """
    
    async def connect(self):
        """Establish WebSocket connection and join the session room."""
        # Get session ID from URL route
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.room_group_name = f'session_{self.session_id}'
        
        # Check for authentication
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            print(f"WebSocket: Rejecting unauthenticated connection for session {self.session_id}")
            await self.close()
            return
        
        # Check for session access permissions
        if not await self.has_session_access():
            print(f"WebSocket: User {self.user.id} does not have access to session {self.session_id}")
            await self.close()
            return
        
        # Store user info
        self.user_id = self.user.id
        self.user_name = f"{self.user.first_name} {self.user.last_name}"
        self.is_mentor = self.user.role == 'mentor'
        
        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        # Accept the connection
        await self.accept()
        
        print(f"WebSocket: User {self.user_id} ({self.user_name}) connected to session {self.session_id}")
        
        # Notify other participants that a new user has joined
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_joined',
                'user_id': self.user_id,
                'user_name': self.user_name,
                'is_mentor': self.is_mentor
            }
        )

    async def disconnect(self, close_code):
        """Handle WebSocket disconnect."""
        print(f"WebSocket: User {self.user_id if hasattr(self, 'user_id') else 'unknown'} disconnected from session {self.session_id if hasattr(self, 'session_id') else 'unknown'}")
        
        # Leave room group
        if hasattr(self, 'room_group_name') and hasattr(self, 'channel_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
            
            # Notify others if we were fully connected
            if hasattr(self, 'user_id') and hasattr(self, 'user_name'):
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'user_left',
                        'user_id': self.user_id,
                        'user_name': self.user_name
                    }
                )

    async def receive(self, text_data):
        """Handle incoming WebSocket messages."""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            print(f"WebSocket: Received {message_type} message from user {self.user_id}")
            
            # Handle different message types
            if message_type == 'join':
                # Send join acknowledgement
                await self.send(text_data=json.dumps({
                    'type': 'join_ack',
                    'user_id': self.user_id,
                    'session_id': self.session_id
                }))
                
            elif message_type == 'offer':
                # Forward offer to the room
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'rtc_offer',
                        'offer': data.get('offer'),
                        'user_id': self.user_id,
                        'is_mentor': self.is_mentor
                    }
                )
                
            elif message_type == 'answer':
                # Forward answer to the room
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'rtc_answer',
                        'answer': data.get('answer'),
                        'user_id': self.user_id,
                        'is_mentor': self.is_mentor
                    }
                )
                
            elif message_type == 'ice_candidate':
                # Forward ICE candidate to the room
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'rtc_ice_candidate',
                        'candidate': data.get('candidate'),
                        'user_id': self.user_id
                    }
                )
                
            elif message_type == 'chat_message':
                # Forward chat message to the room
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'chat_message',
                        'message': data.get('message'),
                        'user_id': self.user_id,
                        'user_name': self.user_name,
                        'timestamp': data.get('timestamp', '')
                    }
                )
                
            elif message_type == 'leave':
                # Forward leave notification to the room
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'user_left',
                        'user_id': self.user_id,
                        'user_name': self.user_name
                    }
                )
                
            else:
                print(f"WebSocket: Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            print(f"WebSocket: Invalid JSON received from user {self.user_id}")
        except Exception as e:
            print(f"WebSocket: Error handling message: {str(e)}")

    async def user_joined(self, event):
        """Send user joined notification to WebSocket."""
        # Don't send the notification back to the same user
        if event['user_id'] != self.user_id:
            await self.send(text_data=json.dumps({
                'type': 'user_joined',
                'userId': event['user_id'],
                'userName': event['user_name'],
                'isMentor': event['is_mentor']
            }))

    async def user_left(self, event):
        """Send user left notification to WebSocket."""
        # Don't send the notification back to the same user
        if event['user_id'] != self.user_id:
            await self.send(text_data=json.dumps({
                'type': 'user_left',
                'userId': event['user_id'],
                'userName': event['user_name']
            }))

    async def rtc_offer(self, event):
        """Forward RTC offer to WebSocket."""
        # Don't send the offer back to the same user
        if event['user_id'] != self.user_id:
            await self.send(text_data=json.dumps({
                'type': 'offer',
                'offer': event['offer'],
                'userId': event['user_id'],
                'isMentor': event['is_mentor']
            }))

    async def rtc_answer(self, event):
        """Forward RTC answer to WebSocket."""
        # Don't send the answer back to the same user
        if event['user_id'] != self.user_id:
            await self.send(text_data=json.dumps({
                'type': 'answer',
                'answer': event['answer'],
                'userId': event['user_id'],
                'isMentor': event['is_mentor']
            }))

    async def rtc_ice_candidate(self, event):
        """Forward ICE candidate to WebSocket."""
        # Don't send the candidate back to the same user
        if event['user_id'] != self.user_id:
            await self.send(text_data=json.dumps({
                'type': 'ice_candidate',
                'candidate': event['candidate'],
                'userId': event['user_id']
            }))

    async def chat_message(self, event):
        """Forward chat message to WebSocket."""
        # Don't send the message back to the same user
        if event['user_id'] != self.user_id:
            await self.send(text_data=json.dumps({
                'type': 'chat_message',
                'message': event['message'],
                'userId': event['user_id'],
                'userName': event['user_name'],
                'timestamp': event['timestamp']
            }))

    @database_sync_to_async
    def has_session_access(self):
        """Check if the user has access to this session."""
        try:
            # For testing, allow all users with either role
            if hasattr(self, 'scope') and self.scope.get('session', {}).get('dev_mode', False):
                return True
                
            # Get the session
            session = Session.objects.get(id=self.session_id)
            
            # Check if user is the mentor for this session
            if self.user.role == 'mentor':
                if hasattr(self.user, 'mentorprofile') and session.mentor_id == self.user.mentorprofile.id:
                    return True
                # For testing, allow any mentor
                return True
                
            # Check if user is a learner with a confirmed booking
            elif self.user.role == 'learner':
                # For testing, allow any learner
                return Booking.objects.filter(
                    session=session, 
                    learner=self.user
                ).exists() or True
                
            return False
            
        except Session.DoesNotExist:
            return False
        except Exception as e:
            print(f"WebSocket: Error checking session access: {str(e)}")
            return False