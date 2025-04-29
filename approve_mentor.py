"""
Utility script to approve all pending mentor accounts.
Run this script when you need to quickly approve mentors for testing.
"""

import os
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')
django.setup()

from users.models import MentorProfile
from django.utils import timezone

def approve_all_pending_mentors():
    """Approve all pending mentor accounts."""
    pending_mentors = MentorProfile.objects.filter(is_approved=False)
    count = pending_mentors.count()
    
    if count == 0:
        print("No pending mentor accounts found.")
        return
    
    # Approve all pending mentors
    for mentor in pending_mentors:
        mentor.is_approved = True
        mentor.updated_at = timezone.now()
        mentor.save()
        print(f"Approved mentor: {mentor.user.email} ({mentor.user.get_full_name()})")
    
    print(f"\nSuccessfully approved {count} mentor account(s).")

if __name__ == "__main__":
    print("Starting mentor approval script...")
    approve_all_pending_mentors()
    print("Script completed.")