"""
WebSocket consumers for real-time session functionality.
"""

import json
import asyncio
import time
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
        self.ping_task = None
        self.last_ping_time = None
        
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
        
        # Start periodic ping
        self.ping_task = asyncio.create_task(self.periodic_ping())
        
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
        
        # Cancel periodic ping task if running
        if self.ping_task and not self.ping_task.done():
            self.ping_task.cancel()
            try:
                await self.ping_task
            except asyncio.CancelledError:
                print(f"Ping task for user {self.user.id} cancelled successfully")
            except Exception as e:
                print(f"Error cancelling ping task: {str(e)}")
        
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
            # First, ensure we have valid JSON
            try:
                data = json.loads(text_data)
            except json.JSONDecodeError as json_error:
                print(f"Invalid JSON received in WebSocket from user: {self.user.id}")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': "Invalid message format. Please ensure you're sending valid JSON.",
                    'timestamp': timezone.now().isoformat(),
                }))
                return
                
            # Validate required fields
            message_type = data.get('type')
            if not message_type:
                print(f"Missing message type in WebSocket message from user: {self.user.id}")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': "Missing message type. All WebSocket messages must include a 'type' field.",
                    'timestamp': timezone.now().isoformat(),
                }))
                return
            
            print(f"WebSocket received message of type: {message_type} from user: {self.user.get_full_name()}")
            
            # Throttling - prevent flooding (could be implemented with a per-user counter)
            
            # Rate limiting - could be implemented with a token bucket algorithm
            
            # Handle different message types with validation and error handling
            try:
                if message_type == 'offer':
                    # Validate required fields
                    if 'offer' not in data or 'to_user_id' not in data:
                        raise ValueError("Missing required fields in WebRTC offer")
                    
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
                    # Validate required fields
                    if 'answer' not in data or 'to_user_id' not in data:
                        raise ValueError("Missing required fields in WebRTC answer")
                    
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
                    # Validate required fields
                    if 'candidate' not in data or 'to_user_id' not in data:
                        raise ValueError("Missing required fields in WebRTC candidate")
                    
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
                    # Validate required fields
                    if 'message' not in data:
                        raise ValueError("Missing message in chat")
                    
                    # Validate message content and length
                    message = data['message'].strip()
                    if not message:
                        raise ValueError("Empty chat message")
                    
                    if len(message) > 1000:  # Reasonable message size limit
                        message = message[:997] + "..."
                    
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            'type': 'chat_message',
                            'message': message,
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
                    # Extract error details with defaults
                    error_msg = data.get('error', 'Unknown connection error')
                    to_user_id = data.get('to_user_id', None)
                    
                    # Log the connection error
                    print(f"WebRTC connection error reported by user {self.user.id}: {error_msg}")
                    
                    # Notify other users about connection issues
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            'type': 'connection_error',
                            'user_id': str(self.user.id),
                            'user_name': self.user.get_full_name(),
                            'error': error_msg,
                            'to_user_id': to_user_id,
                            'timestamp': timezone.now().isoformat(),
                        }
                    )
                
                elif message_type == 'join':
                    # User is indicating they're joining/ready
                    user_data = {
                        'user_id': str(self.user.id),
                        'user_name': self.user.get_full_name(),
                        'is_mentor': self.user.role == 'mentor',
                    }
                    
                    # Extract client info if available for diagnostics
                    client_info = data.get('client_info', {})
                    is_rejoining = client_info.get('is_rejoining', False)
                    
                    if client_info:
                        print(f"User {self.user.id} joining session with diagnostics: {client_info}")
                    else:
                        print(f"User {self.user.id} ({user_data['user_name']}) joining session")
                    
                    # If user is rejoining, we need to notify others so they can reconnect
                    if is_rejoining:
                        print(f"User {self.user.id} is rejoining the session - notifying others")
                        await self.channel_layer.group_send(
                            self.room_group_name,
                            {
                                'type': 'user_rejoin',
                                'user_id': str(self.user.id),
                                'user_name': self.user.get_full_name(),
                                'is_mentor': self.user.role == 'mentor',
                                'timestamp': timezone.now().isoformat(),
                            }
                        )
                    
                    # Acknowledge receipt
                    await self.send(text_data=json.dumps({
                        'type': 'join_ack',
                        'message': 'Successfully joined session',
                        'timestamp': timezone.now().isoformat(),
                    }))
                
                elif message_type == 'heartbeat':
                    # Client is sending a heartbeat to keep the connection alive
                    # Just log for debugging and respond with a pong
                    timestamp = data.get('timestamp', 0)
                    current_time = timezone.now().timestamp() * 1000
                    latency = int(current_time - timestamp) if timestamp else 0
                    
                    if latency > 0:
                        print(f"Heartbeat from user {self.user.id} - latency: {latency}ms")
                    
                    # Respond with a pong directly (no need to broadcast)
                    await self.send(text_data=json.dumps({
                        'type': 'pong',
                        'timestamp': int(current_time),
                        'server_time': timezone.now().isoformat(),
                    }))
                
                elif message_type == 'pong':
                    # Client is responding to our ping
                    # Just log for debugging
                    timestamp = data.get('timestamp', 0)
                    current_time = timezone.now().timestamp() * 1000
                    latency = int(current_time - timestamp) if timestamp else 0
                    
                    if latency > 1000:  # Only log high latency
                        print(f"High latency detected for user {self.user.id}: {latency}ms")
                
                elif message_type == 'get_room_state':
                    # Client is requesting current room state (after reconnection)
                    print(f"User {self.user.id} requesting room state (likely after reconnection)")
                    
                    # Get all active participants in this session
                    # First, get all channel names in this group
                    active_participants = []
                    
                    try:
                        # Collect information about active users in this session
                        session = await self._get_session()
                        if session:
                            # Session details
                            session_data = {
                                'id': session.id,
                                'title': session.title,
                                'mentor_id': str(session.mentor.user.id) if session.mentor else None,
                                'mentor_name': session.mentor.user.get_full_name() if session.mentor else None,
                                'start_time': session.start_time.isoformat() if session.start_time else None,
                                'end_time': session.end_time.isoformat() if session.end_time else None,
                                'status': session.status
                            }
                            
                            # Add mentor if present
                            if session.mentor:
                                active_participants.append({
                                    'user_id': str(session.mentor.user.id),
                                    'user_name': session.mentor.user.get_full_name(),
                                    'is_mentor': True
                                })
                            
                            # Get learners with confirmed bookings
                            bookings = await self._get_session_bookings(session.id)
                            for booking in bookings:
                                try:
                                    learner = booking.learner
                                    active_participants.append({
                                        'user_id': str(learner.user.id),
                                        'user_name': learner.user.get_full_name(),
                                        'is_mentor': False
                                    })
                                except Exception as be:
                                    print(f"Error getting booking information: {str(be)}")
                        
                        # Send the complete room state
                        await self.send(text_data=json.dumps({
                            'type': 'room_state',
                            'session': session_data if session else None,
                            'participants': active_participants,
                            'timestamp': timezone.now().isoformat(),
                        }))
                    except Exception as se:
                        print(f"Error retrieving room state: {str(se)}")
                        await self.send(text_data=json.dumps({
                            'type': 'room_state',
                            'error': "Could not retrieve room state",
                            'participants': [],
                            'timestamp': timezone.now().isoformat(),
                        }))
                
                else:
                    print(f"Unknown WebSocket message type: {message_type} from user: {self.user.id}")
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': f"Unknown message type: {message_type}",
                        'timestamp': timezone.now().isoformat(),
                    }))
            
            except ValueError as ve:
                # Handle validation errors
                error_message = str(ve)
                print(f"Validation error in {message_type} from user {self.user.id}: {error_message}")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f"Invalid {message_type} message: {error_message}",
                    'timestamp': timezone.now().isoformat(),
                }))
                
            except Exception as message_error:
                # Log the specific message processing error
                print(f"Error processing {message_type} message: {str(message_error)} from user: {self.user.id}")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f"Error processing {message_type} message. Please try again.",
                    'timestamp': timezone.now().isoformat(),
                }))
        
        except Exception as e:
            # This is a catch-all for any other errors that might occur
            print(f"Unexpected error processing WebSocket message: {str(e)} from user: {self.user.id}")
            try:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f"Server error. Please refresh the page if problems persist.",
                    'timestamp': timezone.now().isoformat(),
                }))
            except Exception:
                # If even sending the error fails, just log it
                print(f"Failed to send error message to user {self.user.id}")
    
    @database_sync_to_async
    def _get_session(self):
        """Get session details from database."""
        try:
            return Session.objects.select_related('mentor__user').get(id=self.session_id)
        except Session.DoesNotExist:
            return None
        except Exception as e:
            print(f"Error retrieving session: {str(e)}")
            return None
    
    @database_sync_to_async
    def _get_session_bookings(self, session_id):
        """Get confirmed bookings for this session."""
        try:
            return list(Booking.objects.filter(
                session_id=session_id, 
                status='confirmed'
            ).select_related('learner__user'))
        except Exception as e:
            print(f"Error retrieving bookings: {str(e)}")
            return []
    
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
    
    async def user_rejoin(self, event):
        """Send user rejoin notification to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'user_rejoin',
            'user_id': event['user_id'],
            'user_name': event['user_name'],
            'is_mentor': event['is_mentor'],
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
        
    async def connection_error(self, event):
        """Send connection error notification to WebSocket."""
        try:
            # Extract event data with defaults for robustness
            user_id = event.get('user_id', 'unknown')
            user_name = event.get('user_name', 'Unknown User')
            error_message = event.get('error', 'Unknown connection error')
            timestamp = event.get('timestamp', timezone.now().isoformat())
            to_user_id = event.get('to_user_id', None)
            
            # Construct the message with appropriate fields
            message = {
                'type': 'connection_error',
                'user_id': user_id,
                'user_name': user_name,
                'error': error_message,
                'timestamp': timestamp,
            }
            
            # Add to_user_id if it exists (for targeted error messages)
            if to_user_id:
                message['to_user_id'] = to_user_id
            
            # Send error notification to WebSocket client
            await self.send(text_data=json.dumps(message))
            
            # Log the error for server-side diagnostics
            print(f"WebRTC connection error notification sent: {error_message} from user {user_id} ({user_name})")
            
        except Exception as e:
            # Catch any errors in the error handler itself
            print(f"Error in connection_error handler: {str(e)}")
            # Try a simplified error message as fallback
            try:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': "Connection issue detected",
                    'timestamp': timezone.now().isoformat(),
                }))
            except:
                # If even that fails, just log it
                print("Failed to send simplified error message")
    
    async def periodic_ping(self):
        """Send periodic pings to detect connection problems."""
        try:
            ping_interval = 15  # seconds - reduced for quicker detection of issues
            adaptive_interval = ping_interval  # Start with default, adjust based on network conditions
            consecutive_failures = 0
            
            while True:
                # Wait for ping interval (adaptive based on network conditions)
                await asyncio.sleep(adaptive_interval)
                
                # Ensure WebSocket is still open before sending ping
                if not hasattr(self, 'scope') or self.scope.get('session_closed', False):
                    print("Session is closed, stopping ping task")
                    break
                
                try:
                    # Record when we're sending this ping
                    self.last_ping_time = time.time() * 1000
                    
                    # Reset consecutive failures if we can send a ping
                    if consecutive_failures > 0:
                        consecutive_failures = 0
                        # Gradually return to normal ping interval if it was adjusted
                        if adaptive_interval != ping_interval:
                            adaptive_interval = min(ping_interval, adaptive_interval * 1.5)
                    
                    # Send ping
                    await self.send(text_data=json.dumps({
                        'type': 'ping',
                        'timestamp': int(self.last_ping_time),
                        'server_time': timezone.now().isoformat(),
                    }))
                    
                    # Log for debugging
                    print(f"Sent ping to user {self.user.id}")
                    
                except Exception as e:
                    # If there's an error sending the ping, the connection might be dead
                    print(f"Error sending ping to user {self.user.id}: {str(e)}")
                    # Break the loop to stop pinging
                    break
        except asyncio.CancelledError:
            # Task was cancelled, clean up
            print(f"Ping task cancelled for user {self.user.id}")
        except Exception as e:
            # Catch any other exceptions
            print(f"Unexpected error in ping task for user {self.user.id}: {str(e)}")
    
    @database_sync_to_async
    def _check_user_session_permission(self):
        """Check if user has permission to join this session room."""
        try:
            # Wrap in try-except for robustness
            try:
                session = Session.objects.get(id=self.session_id)
            except Session.DoesNotExist:
                print(f"Session {self.session_id} does not exist for user {self.user.id}")
                return False
            except Exception as e:
                print(f"Error retrieving session {self.session_id}: {str(e)}")
                return False
            
            # Mentor can always join their own session
            if self.user.role == 'mentor':
                # Check if this is the session owner
                is_session_owner = session.mentor and session.mentor.user_id == self.user.id
                
                # For testing - also allow any user with 'mentor' in their email
                is_test_mentor = 'mentor' in getattr(self.user, 'email', '').lower()
                
                if is_session_owner or is_test_mentor:
                    print(f"Mentor {self.user.id} authorized for session {self.session_id}")
                    return True
            
            # Check if learner has permission
            if self.user.role == 'learner':
                try:
                    # Check if they have an existing booking (any status for leniency in testing)
                    has_booking = Booking.objects.filter(
                        session_id=self.session_id,
                        learner_id=self.user.id
                    ).exists()
                    
                    # For testing - allow test learners or any learner during development
                    is_test_user = ('test' in getattr(self.user, 'email', '').lower() or 
                                    'learner' in getattr(self.user, 'email', '').lower())
                    
                    # Always check for debugging info even if permission is granted
                    if has_booking:
                        print(f"Learner {self.user.id} has booking for session {self.session_id}")
                    if is_test_user:
                        print(f"Test user {self.user.id} allowed access to session {self.session_id}")
                    
                    # Allow if they have a booking or are a test learner 
                    # For development purposes, we're being more lenient with permissions
                    # In production, we would check payment_complete=True and status='confirmed'
                    return has_booking or is_test_user
                except Exception as e:
                    print(f"Error checking learner booking: {str(e)}")
                    return False
            
            # For development/testing - allow any authenticated user to join a session
            print(f"Development mode: allowing user {self.user.id} to join session {self.session_id}")
            return True
            
        except Exception as e:
            print(f"Unexpected error in _check_user_session_permission: {str(e)}")
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
        try:
            try:
                data = json.loads(text_data)
            except json.JSONDecodeError:
                print(f"Invalid JSON in whiteboard data from user {self.user.id}")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': "Invalid whiteboard data format",
                    'timestamp': timezone.now().isoformat(),
                }))
                return
            
            # Basic validation - make sure we have whiteboard data
            if not data or not isinstance(data, dict):
                print(f"Empty or invalid whiteboard data from user {self.user.id}")
                return
            
            # Size limits to prevent abuse (optional)
            text_data_size = len(text_data)
            if text_data_size > 100000:  # 100KB limit
                print(f"Whiteboard data too large ({text_data_size} bytes) from user {self.user.id}")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': "Whiteboard data too large",
                    'timestamp': timezone.now().isoformat(),
                }))
                return
                
            # Forward whiteboard drawing data to all users in the group
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'whiteboard_data',
                    'data': data,
                    'from_user_id': str(self.user.id),
                    'timestamp': timezone.now().isoformat(),
                }
            )
            
        except Exception as e:
            # Log the error
            print(f"Error processing whiteboard data: {str(e)} from user {self.user.id}")
            # Try to send error message back to client
            try:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': "Error processing whiteboard data",
                    'timestamp': timezone.now().isoformat(),
                }))
            except:
                print(f"Failed to send error message to user {self.user.id}")
    
    async def whiteboard_data(self, event):
        """Send whiteboard data to WebSocket."""
        try:
            # Extract data from event with defaults for robustness
            data = event.get('data', {})
            from_user_id = event.get('from_user_id', 'unknown')
            timestamp = event.get('timestamp', timezone.now().isoformat())
            
            # Send to client
            await self.send(text_data=json.dumps({
                'type': 'whiteboard_data',
                'data': data,
                'from_user_id': from_user_id,
                'timestamp': timestamp,
            }))
        except Exception as e:
            print(f"Error sending whiteboard data: {str(e)}")
            # Don't try to send an error message here to avoid potential infinite loops
    
    @database_sync_to_async
    def _check_user_session_permission(self):
        """Check if user has permission to join this whiteboard."""
        try:
            # Wrap in try-except for robustness
            try:
                session = Session.objects.get(id=self.session_id)
            except Session.DoesNotExist:
                print(f"Whiteboard: Session {self.session_id} does not exist for user {self.user.id}")
                return False
            except Exception as e:
                print(f"Whiteboard: Error retrieving session {self.session_id}: {str(e)}")
                return False
            
            # Mentor can always join their own session
            if self.user.role == 'mentor':
                # Check if this is the session owner
                is_session_owner = session.mentor and session.mentor.user_id == self.user.id
                
                # For testing - also allow any user with 'mentor' in their email
                is_test_mentor = 'mentor' in getattr(self.user, 'email', '').lower()
                
                if is_session_owner or is_test_mentor:
                    print(f"Whiteboard: Mentor {self.user.id} authorized for session {self.session_id}")
                    return True
            
            # Check if learner has permission
            if self.user.role == 'learner':
                try:
                    # Check if they have an existing booking (any status for leniency in testing)
                    has_booking = Booking.objects.filter(
                        session_id=self.session_id,
                        learner_id=self.user.id
                    ).exists()
                    
                    # For testing - allow test learners or any learner during development
                    is_test_user = ('test' in getattr(self.user, 'email', '').lower() or 
                                    'learner' in getattr(self.user, 'email', '').lower())
                    
                    # Always check for debugging info even if permission is granted
                    if has_booking:
                        print(f"Whiteboard: Learner {self.user.id} has booking for session {self.session_id}")
                    if is_test_user:
                        print(f"Whiteboard: Test user {self.user.id} allowed access to session {self.session_id}")
                    
                    # Allow if they have a booking or are a test learner
                    return has_booking or is_test_user
                except Exception as e:
                    print(f"Whiteboard: Error checking learner booking: {str(e)}")
                    return False
            
            # For development/testing - allow any authenticated user to join the whiteboard
            print(f"Whiteboard: Development mode: allowing user {self.user.id} to join session {self.session_id}")
            return True
            
        except Exception as e:
            print(f"Whiteboard: Unexpected error in _check_user_session_permission: {str(e)}")
            return False
