"""
This script tests the WebRTC session console output to help troubleshoot
WebRTC connection issues when users connect to a session.

Run this after creating a test session with test_sessions.py.
It will print out the session URLs and instructions for testing.
"""

import sys
import os
import json
from datetime import datetime, timezone

# Set up environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')

import django
django.setup()

from learning_sessions.models import Session, Booking
from users.models import User


def get_test_session():
    """Find the latest test session available for testing."""
    # Get latest session
    session = Session.objects.filter(status='scheduled').order_by('-created_at').first()
    
    if not session:
        print("No scheduled sessions found. Please run test_sessions.py first.")
        sys.exit(1)
    
    # Get mentor info
    mentor = session.mentor
    mentor_id = mentor.user.id
    mentor_name = mentor.user.get_full_name() if hasattr(mentor.user, 'get_full_name') else 'Test Mentor'
    
    # Get learner info from booking
    booking = Booking.objects.filter(session=session).first()
    
    if booking:
        learner = booking.learner
        learner_id = learner.id
        learner_name = learner.get_full_name() if hasattr(learner, 'get_full_name') else 'Test Learner'
    else:
        # Use default test learner if no booking found
        learner = User.objects.filter(role='learner', email__contains='test').first()
        if learner:
            learner_id = learner.id
            learner_name = learner.get_full_name() if hasattr(learner, 'get_full_name') else 'Test Learner'
        else:
            learner_id = "N/A"
            learner_name = "No test learner found"
            
    return session, mentor_id, mentor_name, learner_id, learner_name
    

def print_troubleshooting_guide():
    """Print a troubleshooting guide for WebRTC connection issues."""
    print("\n===== WebRTC Troubleshooting Guide =====")
    print("If users cannot see or hear each other, check the following:")
    print("\n1. Browser Console for Errors:")
    print("   - Look for WebRTC-related errors")
    print("   - Check for media permission errors")
    print("   - Verify signaling messages are being exchanged\n")
    
    print("2. Network Issues:")
    print("   - Check if STUN/TURN servers are working")
    print("   - Verify users aren't behind restrictive firewalls")
    print("   - Check for symmetric NAT issues\n")
    
    print("3. Browser Support:")
    print("   - Verify using a supported browser (Chrome, Firefox, Edge)")
    print("   - Ensure browser version is recent")
    print("   - Test with a different browser to isolate issues\n")
    
    print("4. Device Permissions:")
    print("   - Verify both users granted camera/microphone permissions")
    print("   - Check if the correct devices are selected")
    print("   - Test if devices work in other applications\n")
    
    print("5. Common Error Messages and Solutions:")
    print("   - 'Cannot access your camera/microphone': Grant permissions")
    print("   - 'ICE connection failed': Check network configuration")
    print("   - 'getUserMedia not supported': Update browser")
    print("   - 'DOMException: Permission denied': Reset browser permissions\n")
    
    print("6. Session Console Logs:")
    print("   - Check for WebSocket connection failures")
    print("   - Look for SDP offer/answer exchanges")
    print("   - Verify ICE candidate exchanges\n")


def main():
    """Print test session details and troubleshooting tips."""
    session, mentor_id, mentor_name, learner_id, learner_name = get_test_session()
    
    print(f"\n===== WebRTC Test Session Details =====")
    print(f"Session ID: {session.id}")
    print(f"Title: {session.title}")
    print(f"Status: {session.status}")
    print(f"Start Time: {session.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"End Time: {session.end_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"\nMentor: {mentor_name} (ID: {mentor_id})")
    print(f"Learner: {learner_name} (ID: {learner_id})")
    
    # Get the base URL
    base_url = os.environ.get('REPLIT_DOMAINS', 'localhost:5000').split(',')[0]
    protocol = "https" if "localhost" not in base_url else "http"
    base_url = f"{protocol}://{base_url}"
    
    session_url = f"{base_url}/sessions/{session.id}/"
    
    print(f"\n===== Test URLs =====")
    print(f"Session URL: {session_url}")
    print("\nTo test WebRTC functionality:")
    print("1. Open two different browsers or incognito windows")
    print("2. Log in as test_mentor@peerlearn.com in one window")
    print("3. Log in as test_learner@example.com in the other window")
    print("4. Access the session URL in both windows")
    print("5. Ensure camera and microphone permissions are granted")
    print("6. Verify that video and audio are transmitted between users")
    
    # Print debugging tips
    print("\n===== Debugging Tips =====")
    print("1. Open the browser console (F12) in both windows to check for errors")
    print("2. Watch the Django server log for WebSocket connection events")
    print("3. Check for ICE connection failures in the browser console")
    print("4. Use a Network Monitor to verify signaling messages")
    print("5. Try accessing from different networks if connection fails")
    
    print_troubleshooting_guide()
    

if __name__ == "__main__":
    main()