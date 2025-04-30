"""
Script to check session bookings and verify if mentors and learners have proper permission.
"""
import sys
import os
import django

# Set up Django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')
django.setup()

from learning_sessions.models import Session, Booking
from users.models import User, MentorProfile, LearnerProfile

def check_session_bookings():
    # Display all active sessions
    print("Active Sessions:")
    active_sessions = Session.objects.filter(status__in=['scheduled', 'in_progress'])
    
    if active_sessions.count() == 0:
        print("No active sessions found!")
        return
    
    for session in active_sessions:
        print(f"\nSession ID: {session.id}")
        print(f"Title: {session.title}")
        print(f"Status: {session.status}")
        print(f"Start time: {session.start_time}")
        print(f"End time: {session.end_time}")
        
        # Get mentor info
        mentor = session.mentor
        if mentor:
            mentor_user = mentor.user
            print(f"Mentor: {mentor_user.get_full_name()} (ID: {mentor_user.id}, Email: {mentor_user.email})")
        else:
            print("No mentor assigned!")
        
        # Get bookings for this session
        bookings = Booking.objects.filter(session=session)
        print(f"Bookings count: {bookings.count()}")
        
        for booking in bookings:
            learner = booking.learner
            if learner:
                learner_user = learner.user
                print(f"- Learner: {learner_user.get_full_name()} (ID: {learner_user.id}, Email: {learner_user.email})")
                print(f"  Booking status: {booking.status}")
            else:
                print("- No learner associated with this booking!")

if __name__ == "__main__":
    check_session_bookings()