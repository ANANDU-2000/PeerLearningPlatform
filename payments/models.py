"""
Models for the payments app.
"""

import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone

from users.models import MentorProfile
from learning_sessions.models import Booking


class Transaction(models.Model):
    """Model for payment transactions."""
    
    STATUS_CHOICES = (
        ('pending', _('Pending')),
        ('completed', _('Completed')),
        ('failed', _('Failed')),
        ('refunded', _('Refunded')),
        ('withdrawal_pending', _('Withdrawal Pending')),
        ('withdrawal_completed', _('Withdrawal Completed')),
    )
    
    PAYMENT_METHOD_CHOICES = (
        ('razorpay', _('Razorpay')),
        ('wallet', _('Wallet')),
        ('admin', _('Admin')),
    )
    
    reference_id = models.UUIDField(_('reference ID'), default=uuid.uuid4, editable=False, unique=True)
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name='transactions')
    amount = models.DecimalField(_('amount'), max_digits=10, decimal_places=2)
    currency = models.CharField(_('currency'), max_length=3, default='INR')
    status = models.CharField(_('status'), max_length=20, choices=STATUS_CHOICES, default='pending')
    payment_method = models.CharField(_('payment method'), max_length=20, choices=PAYMENT_METHOD_CHOICES)
    payment_gateway_reference = models.CharField(_('payment gateway reference'), max_length=255, blank=True, null=True)
    metadata = models.JSONField(_('metadata'), default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['reference_id']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.booking.learner.email} - {self.amount} {self.currency} - {self.get_status_display()}"


class Coupon(models.Model):
    """Model for discount coupons."""
    
    code = models.CharField(_('coupon code'), max_length=50, unique=True)
    description = models.CharField(_('description'), max_length=255, blank=True)
    discount_percent = models.PositiveSmallIntegerField(_('discount percentage'))
    max_discount_amount = models.DecimalField(_('maximum discount amount'), max_digits=10, decimal_places=2, null=True, blank=True)
    min_purchase_amount = models.DecimalField(_('minimum purchase amount'), max_digits=10, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(_('active status'), default=True)
    max_uses = models.PositiveIntegerField(_('maximum uses'), null=True, blank=True)
    current_uses = models.PositiveIntegerField(_('current uses'), default=0)
    expiry_date = models.DateTimeField(_('expiry date'), null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.code} - {self.discount_percent}%"
    
    @property
    def is_expired(self):
        """Check if the coupon is expired."""
        if not self.expiry_date:
            return False
        return self.expiry_date < timezone.now()
    
    @property
    def is_exhausted(self):
        """Check if the coupon has reached maximum uses."""
        if not self.max_uses:
            return False
        return self.current_uses >= self.max_uses
    
    @property
    def is_valid(self):
        """Check if the coupon is valid for use."""
        return self.is_active and not self.is_expired and not self.is_exhausted


class WithdrawalRequest(models.Model):
    """Model for mentor withdrawal requests."""
    
    STATUS_CHOICES = (
        ('pending', _('Pending')),
        ('completed', _('Completed')),
        ('rejected', _('Rejected')),
    )
    
    mentor = models.ForeignKey(MentorProfile, on_delete=models.CASCADE, related_name='withdrawal_requests')
    amount = models.DecimalField(_('amount'), max_digits=10, decimal_places=2)
    currency = models.CharField(_('currency'), max_length=3, default='INR')
    status = models.CharField(_('status'), max_length=10, choices=STATUS_CHOICES, default='pending')
    account_details = models.TextField(_('account details'))
    note = models.TextField(_('notes'), blank=True)
    admin_note = models.TextField(_('admin notes'), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.mentor.user.email} - {self.amount} {self.currency} - {self.get_status_display()}"
