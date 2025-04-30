"""
Test script to create and verify live sessions between mentors and learners.
This script will:
1. Create a test session
2. Book the session with a test learner
3. Print URLs that can be used to test the session
"""
import sys
import os
import django
from datetime import datetime, timedelta, timezone

# Set up Django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')
django.setup()

from learning_sessions.models import Session, Booking
from users.models import User, MentorProfile, LearnerProfile

def create_test_session():
    # Get test mentor and learner
    test_mentors = User.objects.filter(role='mentor', email__contains='test')
    test_learners = User.objects.filter(role='learner', email__contains='test')
    
    if not test_mentors.exists():
        print("No test mentors found!")
        return None, None
    
    if not test_learners.exists():
        print("No test learners found!")
        return None, None
    
    test_mentor = test_mentors.first()
    test_learner = test_learners.first()
    
    print(f"Using mentor: {test_mentor.get_full_name()} (ID: {test_mentor.id}, Email: {test_mentor.email})")
    print(f"Using learner: {test_learner.get_full_name()} (ID: {test_learner.id}, Email: {test_learner.email})")
    
    # Ensure mentor has MentorProfile
    mentor_profile, created = MentorProfile.objects.get_or_create(user=test_mentor)
    if created:
        print(f"Created MentorProfile for {test_mentor.email}")
    
    # Ensure learner has LearnerProfile
    learner_profile, created = LearnerProfile.objects.get_or_create(user=test_learner)
    if created:
        print(f"Created LearnerProfile for {test_learner.email}")
    
    # Create a session starting in 1 minute and lasting 30 minutes
    start_time = datetime.now(timezone.utc) + timedelta(minutes=1)
    end_time = start_time + timedelta(minutes=30)
    
    session = Session.objects.create(
        title="WebRTC Test Session",
        description="Session created for testing WebRTC functionality",
        mentor=mentor_profile,
        start_time=start_time,
        end_time=end_time,
        status="scheduled",
        price=0,  # Free for testing
        topics_to_cover="Testing WebRTC and real-time video functionality",
        max_participants=1,
        current_participants=0,
        tags="test,webrtc,video"
    )
    
    print(f"Created test session: ID {session.id}, Title: {session.title}")
    print(f"Session starts at: {start_time}")
    print(f"Session ends at: {end_time}")
    
    # Book the session for the test learner
    booking = Booking.objects.create(
        session=session,
        learner=test_learner,
        status="confirmed",
        payment_complete=True,
        final_price=0,
        discount_amount=0
    )
    
    print(f"Created booking: ID {booking.id}")
    
    # Update session participants count
    session.current_participants = 1
    session.save()
    
    print("\nTest URLs:")
    # Get the base URL from the ALLOWED_HOSTS setting or use a default
    base_url = os.environ.get('REPLIT_DOMAINS', 'localhost:5000').split(',')[0]
    protocol = "https" if not "localhost" in base_url else "http" 
    base_url = f"{protocol}://{base_url}"
    
    mentor_url = f"{base_url}/sessions/{session.id}/"
    learner_url = f"{base_url}/sessions/{session.id}/"
    
    print(f"Mentor URL: {mentor_url}")
    print(f"Learner URL: {learner_url}")
    print("\nTo test:")
    print("1. Open two different browsers or incognito windows")
    print("2. Log in as the mentor in one window and as the learner in the other")
    print("3. Use the URLs above to join the session from both sides")
    
    return session, booking

if __name__ == "__main__":
    print("Creating test WebRTC session...")
    create_test_session()