"""
Temporary fix to create dashboard_redirect function.
"""
from django.shortcuts import redirect
from django.contrib.auth.decorators import login_required

@login_required
def dashboard_redirect(request):
    """
    Redirect users to their role-specific dashboard.
    """
    if request.user.role == 'learner':
        return redirect('learner_dashboard')
    elif request.user.role == 'mentor':
        return redirect('mentor_dashboard')
    elif request.user.role == 'admin':
        return redirect('admin_dashboard')
    else:
        # Fallback to landing page if role is not recognized
        return redirect('landing_page')