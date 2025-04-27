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
        if instance.role == 'mentor':
            MentorProfile.objects.create(user=instance)
        elif instance.role == 'learner':
            LearnerProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """Save user profile when user is saved."""
    if instance.role == 'mentor' and hasattr(instance, 'mentor_profile'):
        instance.mentor_profile.save()
    elif instance.role == 'learner' and hasattr(instance, 'learner_profile'):
        instance.learner_profile.save()