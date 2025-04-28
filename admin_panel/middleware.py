"""
Middleware for the admin panel to add an extra layer of security
"""

import logging
import time
from django.utils import timezone
from django.shortcuts import redirect
from django.urls import reverse
from django.contrib import messages
from django.utils.translation import gettext_lazy as _

# Get the logger
security_logger = logging.getLogger('admin_security')

class AdminSecurityMiddleware:
    """
    Middleware to enforce additional security checks for admin panel access.
    This adds multiple layers of protection beyond standard Django auth.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Process request - check if attempting to access admin panel
        if request.path.startswith('/admin-panel/') and not request.path.startswith('/admin-panel/secure-login'):
            # Check if user has the admin_verified flag
            if not request.session.get('admin_verified'):
                security_logger.warning(f"Attempted admin access without verification from IP: {request.META.get('REMOTE_ADDR')}")
                messages.error(request, _("Secure admin verification required."))
                return redirect('secure_admin_login')
            
            # Check if verification session has expired (session might still be active but admin verification expired)
            admin_verified_at = request.session.get('admin_verified_at')
            if admin_verified_at:
                try:
                    # Parse ISO format datetime string
                    verified_time = timezone.datetime.fromisoformat(admin_verified_at)
                    current_time = timezone.now()
                    
                    # Calculate hours since verification
                    hours_diff = (current_time - verified_time).total_seconds() / 3600
                    
                    # If more than 4 hours (or custom timeout), require re-verification
                    if hours_diff > 4:
                        security_logger.info(f"Admin verification expired for user: {request.user} from IP: {request.META.get('REMOTE_ADDR')}")
                        request.session.pop('admin_verified', None)
                        request.session.pop('admin_verified_at', None)
                        messages.info(request, _("Your admin session has expired. Please verify your identity again."))
                        return redirect('secure_admin_login')
                except (ValueError, TypeError):
                    # If there's any issue with the timestamp, require re-verification
                    security_logger.warning(f"Invalid admin verification timestamp for user: {request.user}")
                    request.session.pop('admin_verified', None)
                    request.session.pop('admin_verified_at', None)
                    return redirect('secure_admin_login')
            
            # Record admin activity
            security_logger.info(f"Admin page accessed: {request.path} by user: {request.user} from IP: {request.META.get('REMOTE_ADDR')}")
        
        # Continue processing the request
        response = self.get_response(request)
        
        # Process response
        return response