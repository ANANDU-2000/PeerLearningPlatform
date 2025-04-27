import os
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')
django.setup()

# Import models
from users.models import User, MentorProfile
from django.utils import timezone

# Approve the first mentor
mentor = MentorProfile.objects.first()
if mentor:
    mentor.is_approved = True
    mentor.approved_at = timezone.now()
    mentor.save()
    print(f'Mentor {mentor.user.get_full_name()} approved!')
else:
    print('No mentor found to approve.')

# Create a test session
from learning_sessions.models import Session

# Check if we already have a session
existing_session = Session.objects.filter(status='scheduled').first()
if existing_session:
    print(f'Using existing session: {existing_session.title}')
    session = existing_session
else:
    # Create a new session
    if mentor and mentor.is_approved:
        # Set start time 5 minutes from now
        start_time = timezone.now() + timezone.timedelta(minutes=5)
        end_time = start_time + timezone.timedelta(hours=1)
        
        session = Session.objects.create(
            mentor=mentor,
            title="Test One-to-One WebRTC Session",
            description="This is a test session to demonstrate the WebRTC functionality.",
            start_time=start_time,
            end_time=end_time,
            price=500,  # ₹500
            max_participants=1,
            status='scheduled',
            tags='test,webrtc,demonstration'
        )
        print(f'Created new test session: {session.title}')
    else:
        print('Cannot create session: No approved mentor found.')
        session = None

# Create a test booking if we have a session
if session:
    from learning_sessions.models import Booking
    
    # Find a learner
    learner = User.objects.filter(role='learner').first()
    if not learner:
        # Create a learner if none exists
        learner = User.objects.create_user(
            email='test_learner@example.com',
            password='testpassword123',
            first_name='Test',
            last_name='Learner',
            role='learner'
        )
        print(f'Created test learner: {learner.email}')
    
    # Check if booking already exists
    existing_booking = Booking.objects.filter(session=session, learner=learner).first()
    if existing_booking:
        print(f'Booking already exists with status: {existing_booking.status}')
        booking = existing_booking
        
        # Ensure booking is confirmed and payment complete
        if booking.status != 'confirmed' or not booking.payment_complete:
            booking.status = 'confirmed'
            booking.payment_complete = True
            booking.save()
            print('Updated booking to confirmed with payment complete')
    else:
        # Create a new booking
        booking = Booking.objects.create(
            session=session,
            learner=learner,
            status='confirmed',
            payment_complete=True,
            final_price=session.price
        )
        
        # Update session participant count
        session.current_participants += 1
        session.save()
        
        print(f'Created new booking for learner: {learner.email}')
        
    print(f'\nTest environment ready!')
    print(f'Mentor: {mentor.user.email} (approved)')
    print(f'Learner: {learner.email}')
    print(f'Session: {session.title} at {session.start_time}')
    print(f'Session status: {session.status}')
    print(f'To access the session as mentor: /sessions/{session.id}/room/')
else:
    print('Test environment setup failed.')