"""
Models for the admin panel.
"""

from django.db import models
from django.utils import timezone
from django.conf import settings

class AdminAccessKey(models.Model):
    """
    Stores secure access keys for admin panel.
    These are used as an additional layer of authentication beyond passwords.
    """
    key_name = models.CharField(max_length=100)
    key_value = models.CharField(max_length=255)  # Hashed value of the key
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_access_keys'
    )
    
    def __str__(self):
        return f"{self.key_name} ({'Active' if self.is_active else 'Inactive'})"
    
    @property
    def is_expired(self):
        """Check if key has expired."""
        if not self.expires_at:
            return False
        return self.expires_at < timezone.now()


class AdminAccessLog(models.Model):
    """
    Logs all access attempts to the admin panel for security auditing.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, 
        null=True,
        blank=True,
        related_name='admin_access_logs'
    )
    ip_address = models.GenericIPAddressField()
    action = models.CharField(max_length=100)  # login, logout, page_view, etc.
    path = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=50)  # success, failed, blocked
    user_agent = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    details = models.TextField(blank=True)  # Additional details like reason for failure
    
    class Meta:
        ordering = ['-timestamp']
    
    def __str__(self):
        return f"{self.action} by {self.user or 'Unknown'} from {self.ip_address} - {self.status}"


class AllowedIP(models.Model):
    """
    Stores IP addresses or ranges allowed to access the admin panel.
    """
    ip_address = models.CharField(max_length=50)  # Can be single IP or CIDR notation
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='added_allowed_ips'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.ip_address} - {self.description}"