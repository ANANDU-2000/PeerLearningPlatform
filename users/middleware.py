"""
Custom middleware for the PeerLearn platform.
"""

from django.shortcuts import redirect
from django.urls import resolve, reverse


class UserRoleMiddleware:
    """
    Middleware to ensure users can only access pages appropriate for their role.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Skip middleware for authentication-related URLs
        auth_urls = [
            'login', 'logout', 'password_reset', 'password_reset_done',
            'password_reset_confirm', 'password_reset_complete', 'verify_2fa'
        ]
        
        path = request.path
        
        if not request.user.is_authenticated:
            # Process response for anonymous users
            response = self.get_response(request)
            return response
        
        # Check if trying to access dashboard of another role
        try:
            url_name = resolve(path).url_name
            
            if url_name == 'learner_dashboard' and request.user.role != 'learner':
                return redirect(request.user.get_dashboard_url())
            
            if url_name == 'mentor_dashboard' and request.user.role != 'mentor':
                return redirect(request.user.get_dashboard_url())
            
            if url_name == 'admin_dashboard' and request.user.role != 'admin':
                return redirect(request.user.get_dashboard_url())
        
        except:
            # If URL doesn't resolve, just continue
            pass
        
        # Process response
        response = self.get_response(request)
        return response
