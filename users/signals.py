"""
Signal handlers for the users app.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from django.utils.translation import gettext_lazy as _

from .models import User, MentorProfile, LearnerProfile


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """Create appropriate profile when user is created."""
    if created:
        # Only create profiles if they don't already exist and if not during registration
        # (Registration creates profiles with form data)
        if instance.role == 'mentor' and not hasattr(instance, 'mentor_profile'):
            # Set default values for required fields
            MentorProfile.objects.create(
                user=instance,
                expertise="",
                bio="",
                hourly_rate=0
            )
        elif instance.role == 'learner' and not hasattr(instance, 'learner_profile'):
            LearnerProfile.objects.create(
                user=instance,
                career_goals=""
            )


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """Save user profile when user is saved."""
    if instance.role == 'mentor' and hasattr(instance, 'mentor_profile'):
        instance.mentor_profile.save()
    elif instance.role == 'learner' and hasattr(instance, 'learner_profile'):
        instance.learner_profile.save()