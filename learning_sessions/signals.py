"""
Signal handlers for the learning_sessions app.
"""

from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver

# Define signal handlers as needed