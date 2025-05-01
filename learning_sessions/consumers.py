"""
WebSocket consumers for PeerLearn learning sessions.
"""
import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)

class SessionRTCConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for handling WebRTC signaling in session rooms.
    This handles the exchange of connection offers, answers, and ICE candidates.
    """
    async def connect(self):
        """Establish WebSocket connection and join the session room."""
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.room_group_name = f"session_{self.session_id}"
        self.user = self.scope.get('user')
        
        # Log connection attempt
        logger.info(f"WebSocket: {self.user} attempting to connect to session {self.session_id}")
        
        # Add the user to the session group to receive messages
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        # Accept the WebSocket connection
        await self.accept()
        
        # Log successful connection
        if self.user and self.user.is_authenticated:
            logger.info(f"WebSocket: User {self.user.id} ({self.user.first_name} {self.user.last_name}) connected to session {self.session_id}")
        else:
            logger.info(f"WebSocket: Anonymous user connected to session {self.session_id}")
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnect."""
        # Log the disconnect
        if self.user and self.user.is_authenticated:
            logger.info(f"WebSocket: User {self.user.id} disconnected from session {self.session_id}")
        else:
            logger.info(f"WebSocket: Anonymous user disconnected from session {self.session_id}")
        
        # Remove the user from the session group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        
        # Notify other participants that this user has left
        if hasattr(self, 'user_id') and hasattr(self, 'user_name'):
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'user_left',
                    'userId': self.user_id,
                    'userName': self.user_name
                }
            )
    
    async def receive(self, text_data):
        """Handle incoming WebSocket messages."""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            # Process based on message type
            if message_type == 'join':
                # User joining the session
                self.user_id = data.get('userId')
                self.user_name = data.get('userName')
                self.is_mentor = data.get('isMentor', False)
                
                # Log join message
                logger.info(f"WebSocket: Received join message from user {self.user_id}")
                
                # Send acknowledgment back to the user
                await self.send(text_data=json.dumps({
                    'type': 'join_ack',
                    'user_id': self.user_id,
                    'session_id': self.session_id
                }))
                
                # Notify other participants that a new user has joined
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'user_joined',
                        'userId': self.user_id,
                        'userName': self.user_name,
                        'isMentor': self.is_mentor
                    }
                )
            
            elif message_type == 'offer':
                # WebRTC offer from a peer
                logger.info(f"WebSocket: Received offer from user {data.get('userId')}")
                
                # Forward the offer to other participants
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'rtc_offer',
                        'offer': data.get('offer'),
                        'userId': data.get('userId'),
                        'isMentor': data.get('isMentor', False)
                    }
                )
            
            elif message_type == 'answer':
                # WebRTC answer from a peer
                logger.info(f"WebSocket: Received answer from user {data.get('userId')}")
                
                # Forward the answer to other participants
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'rtc_answer',
                        'answer': data.get('answer'),
                        'userId': data.get('userId'),
                        'isMentor': data.get('isMentor', False)
                    }
                )
            
            elif message_type == 'ice_candidate':
                # ICE candidate from a peer
                logger.debug(f"WebSocket: Received ICE candidate from user {data.get('userId')}")
                
                # Forward the ICE candidate to other participants
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'rtc_ice_candidate',
                        'candidate': data.get('candidate'),
                        'userId': data.get('userId')
                    }
                )
            
            elif message_type == 'chat_message':
                # Chat message from a user
                logger.debug(f"WebSocket: Received chat message from user {data.get('userId')}")
                
                # Forward the chat message to all participants
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'chat_message',
                        'message': data.get('message'),
                        'userId': data.get('userId'),
                        'userName': data.get('userName')
                    }
                )
            
            elif message_type == 'leave':
                # User is leaving the session
                logger.info(f"WebSocket: User {data.get('userId')} is leaving the session")
                
                # Notify other participants
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'user_left',
                        'userId': data.get('userId'),
                        'userName': data.get('userName')
                    }
                )
            
            else:
                # Unknown message type
                logger.warning(f"WebSocket: Received unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            logger.error(f"WebSocket: Received invalid JSON: {text_data}")
        
        except Exception as e:
            logger.error(f"WebSocket: Error processing message: {str(e)}")
    
    async def user_joined(self, event):
        """Send user joined notification to WebSocket."""
        # Only send to users other than the one who joined
        if not hasattr(self, 'user_id') or str(self.user_id) != str(event['userId']):
            await self.send(text_data=json.dumps({
                'type': 'user_joined',
                'userId': event['userId'],
                'userName': event['userName'],
                'isMentor': event['isMentor']
            }))
    
    async def user_left(self, event):
        """Send user left notification to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'user_left',
            'userId': event['userId'],
            'userName': event['userName']
        }))
    
    async def rtc_offer(self, event):
        """Forward RTC offer to WebSocket."""
        # Only send to users other than the one who sent the offer
        if not hasattr(self, 'user_id') or str(self.user_id) != str(event['userId']):
            await self.send(text_data=json.dumps({
                'type': 'offer',
                'offer': event['offer'],
                'userId': event['userId'],
                'isMentor': event['isMentor']
            }))
    
    async def rtc_answer(self, event):
        """Forward RTC answer to WebSocket."""
        # Only send to users other than the one who sent the answer
        if not hasattr(self, 'user_id') or str(self.user_id) != str(event['userId']):
            await self.send(text_data=json.dumps({
                'type': 'answer',
                'answer': event['answer'],
                'userId': event['userId'],
                'isMentor': event['isMentor']
            }))
    
    async def rtc_ice_candidate(self, event):
        """Forward ICE candidate to WebSocket."""
        # Only send to users other than the one who sent the candidate
        if not hasattr(self, 'user_id') or str(self.user_id) != str(event['userId']):
            await self.send(text_data=json.dumps({
                'type': 'ice_candidate',
                'candidate': event['candidate'],
                'userId': event['userId']
            }))
    
    async def chat_message(self, event):
        """Forward chat message to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message': event['message'],
            'userId': event['userId'],
            'userName': event['userName']
        }))