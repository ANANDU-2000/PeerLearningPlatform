"""
Signal handlers for the payments app.
"""

from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver
from django.utils.translation import gettext_lazy as _

from .models import Transaction, WithdrawalRequest
from learning_sessions.models import Session, Booking

# Define payment-related signal handlers as needed