"""
Middleware for the admin panel to add an extra layer of security
"""

import ipaddress
import logging
import re

from django.utils import timezone
from django.shortcuts import redirect
from django.urls import resolve, reverse
from django.contrib import messages
from django.utils.translation import gettext as _

from .models import AdminAccessLog, AllowedIP

# Create a logger for recording security events
security_logger = logging.getLogger('admin_security')


class AdminSecurityMiddleware:
    """
    Middleware to enforce additional security checks for admin panel access.
    This adds multiple layers of protection beyond standard Django auth.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        # Pattern for admin panel URLs
        self.admin_url_pattern = re.compile(r'^/admin-panel/')
    
    def __call__(self, request):
        # Check if this is an admin panel URL
        if self.admin_url_pattern.match(request.path):
            # Skip for secure login URL to prevent redirect loop
            if request.path == reverse('secure_admin_login'):
                return self.get_response(request)
            
            # Get client information
            client_ip = request.META.get('REMOTE_ADDR', '')
            user_agent = request.META.get('HTTP_USER_AGENT', '')
            
            # Check if user is authenticated
            if not request.user.is_authenticated:
                # Log unauthorized access attempt
                security_logger.warning(f"Unauthenticated access attempt to admin panel: {request.path} from IP: {client_ip}")
                
                # Create access log entry
                AdminAccessLog.objects.create(
                    ip_address=client_ip,
                    action='access_attempt',
                    path=request.path,
                    status='blocked',
                    user_agent=user_agent,
                    details='Not authenticated'
                )
                
                messages.error(request, _("You must login to access this area."))
                return redirect('secure_admin_login')
            
            # Check if user is admin
            if not request.user.role == 'admin':
                # Log unauthorized access attempt
                security_logger.warning(f"Non-admin access attempt to admin panel: {request.path} by user: {request.user.username} from IP: {client_ip}")
                
                # Create access log entry
                AdminAccessLog.objects.create(
                    user=request.user,
                    ip_address=client_ip,
                    action='access_attempt',
                    path=request.path,
                    status='blocked',
                    user_agent=user_agent,
                    details='Not admin user'
                )
                
                messages.error(request, _("You do not have permissions to access this area."))
                return redirect('home')  # Redirect to home page
            
            # Check admin session verification flag
            if not request.session.get('admin_verified'):
                # Log unauthorized access attempt
                security_logger.warning(f"Admin access attempt without verification: {request.path} by user: {request.user.username} from IP: {client_ip}")
                
                # Create access log entry
                AdminAccessLog.objects.create(
                    user=request.user,
                    ip_address=client_ip,
                    action='access_attempt',
                    path=request.path,
                    status='blocked',
                    user_agent=user_agent,
                    details='Admin verification missing'
                )
                
                messages.warning(request, _("Please login to the admin panel."))
                return redirect('secure_admin_login')
            
            # Check admin session expiry
            admin_verified_at = request.session.get('admin_verified_at')
            if admin_verified_at:
                verified_time = timezone.datetime.fromisoformat(admin_verified_at)
                session_age = timezone.now() - verified_time
                # Force re-verification after 12 hours maximum, regardless of session settings
                if session_age.total_seconds() > 60 * 60 * 12:  # 12 hours
                    # Log session expiry
                    security_logger.info(f"Admin session expired for user: {request.user.username}")
                    
                    # Create access log entry
                    AdminAccessLog.objects.create(
                        user=request.user,
                        ip_address=client_ip,
                        action='session_expired',
                        path=request.path,
                        status='blocked',
                        user_agent=user_agent,
                        details='Admin session timed out'
                    )
                    
                    # Clear admin session flag
                    request.session.pop('admin_verified', None)
                    request.session.pop('admin_verified_at', None)
                    
                    messages.warning(request, _("Your admin session has expired. Please login again."))
                    return redirect('secure_admin_login')
            
            # Check if IP is still allowed (in case IP restrictions changed)
            try:
                client_ip_obj = ipaddress.ip_address(client_ip)
                allowed_ips = AllowedIP.objects.filter(is_active=True)
                
                if allowed_ips.exists():  # Only check if restrictions are configured
                    ip_allowed = False
                    for allowed_ip in allowed_ips:
                        # Check if it's a network range or single IP
                        if '/' in allowed_ip.ip_address:
                            network = ipaddress.ip_network(allowed_ip.ip_address)
                            if client_ip_obj in network:
                                ip_allowed = True
                                break
                        elif client_ip == allowed_ip.ip_address:
                            ip_allowed = True
                            break
                    
                    if not ip_allowed:
                        # Log unauthorized IP
                        security_logger.warning(f"Admin access from unauthorized IP: {client_ip} by user: {request.user.username}")
                        
                        # Create access log entry
                        AdminAccessLog.objects.create(
                            user=request.user,
                            ip_address=client_ip,
                            action='access_attempt',
                            path=request.path,
                            status='blocked',
                            user_agent=user_agent,
                            details='IP not in allowed list'
                        )
                        
                        # Clear admin session flag
                        request.session.pop('admin_verified', None)
                        request.session.pop('admin_verified_at', None)
                        
                        messages.error(request, _("Access denied from your current location."))
                        return redirect('secure_admin_login')
            except ValueError:
                # Invalid IP format - should never happen, but log it
                security_logger.warning(f"Invalid IP format in admin middleware: {client_ip}")
            
            # Log successful access
            if request.method == 'GET':  # Only log GET requests to avoid excessive logging
                security_logger.info(f"Admin access: {request.path} by user: {request.user.username} from IP: {client_ip}")
                
                # Create access log entry
                AdminAccessLog.objects.create(
                    user=request.user,
                    ip_address=client_ip,
                    action='page_view',
                    path=request.path,
                    status='success',
                    user_agent=user_agent
                )
        
        response = self.get_response(request)
        return response