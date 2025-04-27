"""
Models for the sessions app.
"""

from django.db import models
from django.utils.translation import gettext_lazy as _
from django.urls import reverse
from django.utils import timezone
from django.conf import settings

from users.models import User, MentorProfile


class Session(models.Model):
    """Model for educational sessions offered by mentors."""
    
    STATUS_CHOICES = (
        ('scheduled', _('Scheduled')),
        ('in_progress', _('In Progress')),
        ('completed', _('Completed')),
        ('cancelled', _('Cancelled')),
    )
    
    mentor = models.ForeignKey(MentorProfile, on_delete=models.CASCADE, related_name='sessions')
    title = models.CharField(_('title'), max_length=255)
    description = models.TextField(_('description'))
    start_time = models.DateTimeField(_('start time'))
    end_time = models.DateTimeField(_('end time'))
    price = models.DecimalField(_('price'), max_digits=10, decimal_places=2)
    max_participants = models.PositiveIntegerField(_('maximum participants'), default=1)
    current_participants = models.PositiveIntegerField(_('current participants'), default=0)
    status = models.CharField(_('status'), max_length=20, choices=STATUS_CHOICES, default='scheduled')
    tags = models.CharField(_('tags'), max_length=255, blank=True, help_text=_("Comma-separated tags"))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['start_time']
        indexes = [
            models.Index(fields=['start_time']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return self.title
    
    def get_absolute_url(self):
        """Return the URL for the session detail page."""
        return reverse('session_detail', args=[self.id])
    
    @property
    def is_full(self):
        """Return True if the session is fully booked."""
        return self.current_participants >= self.max_participants
    
    @property
    def is_past(self):
        """Return True if the session end time has passed."""
        return self.end_time < timezone.now()
    
    @property
    def is_ongoing(self):
        """Return True if the session is currently in progress."""
        now = timezone.now()
        return self.start_time <= now <= self.end_time
    
    @property
    def duration_minutes(self):
        """Return the session duration in minutes."""
        delta = self.end_time - self.start_time
        return delta.total_seconds() / 60


class Booking(models.Model):
    """Model for session bookings by learners."""
    
    STATUS_CHOICES = (
        ('pending', _('Pending')),
        ('confirmed', _('Confirmed')),
        ('rejected', _('Rejected')),
        ('cancelled', _('Cancelled')),
        ('completed', _('Completed')),
    )
    
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='bookings')
    learner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bookings')
    status = models.CharField(_('status'), max_length=20, choices=STATUS_CHOICES, default='pending')
    payment_complete = models.BooleanField(_('payment complete'), default=False)
    coupon_applied = models.CharField(_('coupon code'), max_length=50, blank=True, null=True)
    discount_amount = models.DecimalField(_('discount amount'), max_digits=10, decimal_places=2, default=0)
    final_price = models.DecimalField(_('final price'), max_digits=10, decimal_places=2, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        unique_together = ('session', 'learner')
    
    def __str__(self):
        return f"{self.learner.email} - {self.session.title}"
    
    def get_final_price(self):
        """Calculate the final price after any discounts."""
        if self.final_price is not None:
            return self.final_price
        return self.session.price - self.discount_amount


class Feedback(models.Model):
    """Model for session feedback from learners."""
    
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name='feedback')
    rating = models.PositiveSmallIntegerField(_('rating'), choices=[(i, i) for i in range(1, 6)])
    comments = models.TextField(_('comments'), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Feedback: {self.booking.session.title} - {self.rating}/5"
