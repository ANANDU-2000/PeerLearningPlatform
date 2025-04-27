"""
Views for the users app.
"""

import secrets
import time
from django.contrib.auth import login, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.core.mail import send_mail
from django.shortcuts import render, redirect, get_object_or_404
from django.http import HttpResponse, JsonResponse
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_protect
from django.conf import settings
from django.db.models import Q

from .models import User, LearnerProfile, MentorProfile
from .forms import (
    UserRegistrationForm, LearnerProfileForm, MentorProfileForm,
    CustomAuthenticationForm, UserProfilePictureForm, Two2FACodeForm,
    UserSettingsForm
)

# Cache for 2FA codes
TWO_FACTOR_CACHE = {}  # {email: {'code': '123456', 'expires': timestamp}}


def landing_page(request):
    """
    Render the landing page.
    If user is authenticated, redirect to their role-specific dashboard.
    """
    # If user is already logged in, redirect to their dashboard
    if request.user.is_authenticated:
        return redirect(request.user.get_dashboard_url())
    
    # Get some featured mentors for the showcase section
    featured_mentors = MentorProfile.objects.filter(
        is_approved=True
    ).order_by('-average_rating')[:6]
    
    return render(request, 'landing.html', {
        'featured_mentors': featured_mentors,
    })


def role_selection_view(request):
    """View for role selection (learner or mentor)."""
    if request.user.is_authenticated:
        return redirect(request.user.get_dashboard_url())
    
    return render(request, 'role_selection.html')


@csrf_protect
def register_view(request, role='learner'):
    """Registration view with role selection."""
    if request.user.is_authenticated:
        return redirect(request.user.get_dashboard_url())
    
    if role not in ['learner', 'mentor']:
        return redirect('role_selection')
    
    if request.method == 'POST':
        user_form = UserRegistrationForm(request.POST)
        
        if role == 'learner':
            profile_form = LearnerProfileForm(request.POST)
        else:
            profile_form = MentorProfileForm(request.POST)
        
        if user_form.is_valid() and profile_form.is_valid():
            user = user_form.save(commit=False)
            user.role = role
            user.save()
            
            profile = profile_form.save(commit=False)
            profile.user = user
            profile.save()
            
            # Log in the user
            login(request, user)
            messages.success(request, _('Registration successful!'))
            
            return redirect(user.get_dashboard_url())
    else:
        user_form = UserRegistrationForm()
        
        if role == 'learner':
            profile_form = LearnerProfileForm()
        else:
            profile_form = MentorProfileForm()
    
    return render(request, 'registration/register.html', {
        'user_form': user_form,
        'profile_form': profile_form,
        'role': role,
    })


@csrf_protect
def login_view(request):
    """Custom login view with 2FA support."""
    if request.user.is_authenticated:
        return redirect(request.user.get_dashboard_url())
    
    if request.method == 'POST':
        form = CustomAuthenticationForm(request, data=request.POST)
        
        if form.is_valid():
            user = form.get_user()
            
            if user.two_factor_enabled:
                # Generate and send 2FA code
                code = ''.join([str(secrets.randbelow(10)) for _ in range(6)])
                
                # Store code in cache with 10-minute expiration
                TWO_FACTOR_CACHE[user.email] = {
                    'code': code,
                    'expires': time.time() + 600,  # 10 minutes
                }
                
                # Send code via email (in production, use proper email service)
                send_mail(
                    _('Your Login Verification Code'),
                    _('Your verification code is: {}').format(code),
                    settings.DEFAULT_FROM_EMAIL,
                    [user.email],
                    fail_silently=False,
                )
                
                # Store user email in session for 2FA verification
                request.session['two_factor_email'] = user.email
                
                return redirect('verify_2fa')
            else:
                # If 2FA not enabled, log in directly
                login(request, user)
                messages.success(request, _('Login successful!'))
                
                # Redirect to the appropriate dashboard
                return redirect(user.get_dashboard_url())
    else:
        form = CustomAuthenticationForm()
    
    return render(request, 'registration/login.html', {'form': form})


@csrf_protect
def verify_2fa_view(request):
    """View for 2FA code verification."""
    if 'two_factor_email' not in request.session:
        return redirect('login')
    
    email = request.session['two_factor_email']
    
    if request.method == 'POST':
        form = Two2FACodeForm(request.POST)
        
        if form.is_valid():
            entered_code = form.cleaned_data['code']
            
            # Check if code exists and is valid
            if (email in TWO_FACTOR_CACHE and 
                TWO_FACTOR_CACHE[email]['code'] == entered_code and
                TWO_FACTOR_CACHE[email]['expires'] > time.time()):
                
                # Clean up
                del TWO_FACTOR_CACHE[email]
                del request.session['two_factor_email']
                
                # Log in the user
                user = authenticate(request, username=email, password=request.POST.get('password'))
                login(request, user)
                
                messages.success(request, _('Two-factor authentication successful!'))
                return redirect(user.get_dashboard_url())
            else:
                messages.error(request, _('Invalid or expired verification code.'))
    else:
        form = Two2FACodeForm()
    
    return render(request, 'registration/verify_2fa.html', {'form': form})


@login_required
def profile_settings_view(request):
    """View for user profile settings."""
    user = request.user
    
    if request.method == 'POST':
        form = UserSettingsForm(request.POST, request.FILES, instance=user)
        picture_form = UserProfilePictureForm(request.POST, request.FILES, instance=user)
        
        if 'update_profile' in request.POST and form.is_valid():
            form.save()
            messages.success(request, _('Profile updated successfully!'))
        
        if 'update_picture' in request.POST and picture_form.is_valid():
            picture_form.save()
            messages.success(request, _('Profile picture updated!'))
        
        if 'toggle_2fa' in request.POST:
            user.two_factor_enabled = not user.two_factor_enabled
            user.save()
            
            status = _('enabled') if user.two_factor_enabled else _('disabled')
            messages.info(request, _('Two-factor authentication {}.').format(status))
    else:
        form = UserSettingsForm(instance=user)
        picture_form = UserProfilePictureForm(instance=user)
    
    return render(request, 'profile/settings.html', {
        'form': form,
        'picture_form': picture_form,
    })


@login_required
def learner_dashboard(request):
    """Dashboard view for learners."""
    if request.user.role != 'learner':
        return redirect(request.user.get_dashboard_url())
    
    # Import here to avoid circular imports
    from learning_sessions.models import Session, Booking
    
    # Get upcoming bookings for this learner
    upcoming_bookings = Booking.objects.filter(
        learner=request.user,
        session__start_time__gt=timezone.now(),
        status='confirmed'
    ).order_by('session__start_time')
    
    # Get recommended sessions based on career goals
    learner_profile = request.user.learner_profile
    recommended_sessions = Session.objects.filter(
        mentor__is_approved=True,
        start_time__gt=timezone.now(),
    ).exclude(
        bookings__learner=request.user
    ).order_by('start_time')[:6]
    
    # Get top-rated mentors
    top_mentors = MentorProfile.objects.filter(
        is_approved=True
    ).order_by('-average_rating')[:6]
    
    return render(request, 'dashboard/learner_dashboard.html', {
        'upcoming_bookings': upcoming_bookings,
        'recommended_sessions': recommended_sessions,
        'top_mentors': top_mentors,
    })


@login_required
def mentor_dashboard(request):
    """Dashboard view for mentors."""
    if request.user.role != 'mentor':
        return redirect(request.user.get_dashboard_url())
    
    # Import here to avoid circular imports
    from learning_sessions.models import Session, Booking
    from payments.models import Transaction
    from .models import MentorProfile
    
    # Get or create mentor profile
    try:
        mentor_profile = request.user.mentor_profile
    except MentorProfile.DoesNotExist:
        # If profile doesn't exist, create it with default values
        mentor_profile = MentorProfile.objects.create(
            user=request.user,
            expertise="",
            bio="",
            hourly_rate=0
        )
    
    # Get upcoming sessions
    upcoming_sessions = Session.objects.filter(
        mentor=mentor_profile,
        start_time__gt=timezone.now(),
    ).order_by('start_time')
    
    # Get pending booking requests
    pending_bookings = Booking.objects.filter(
        session__mentor=mentor_profile,
        status='pending'
    ).order_by('created_at')
    
    # Get earning stats
    earnings = Transaction.objects.filter(
        booking__session__mentor=mentor_profile,
        status='completed'
    )
    
    total_earnings = sum(t.amount for t in earnings)
    pending_withdrawals = Transaction.objects.filter(
        booking__session__mentor=mentor_profile,
        status='withdrawal_pending'
    ).count()
    
    return render(request, 'dashboard/mentor_dashboard.html', {
        'mentor_profile': mentor_profile,
        'upcoming_sessions': upcoming_sessions,
        'pending_bookings': pending_bookings,
        'total_earnings': total_earnings,
        'pending_withdrawals': pending_withdrawals,
    })


@login_required
def mentor_profile_view(request, mentor_id):
    """
    View for displaying a mentor's public profile.
    
    Args:
        mentor_id: ID of the MentorProfile to display
    """
    mentor_profile = get_object_or_404(MentorProfile, id=mentor_id)
    
    # Get upcoming public sessions
    upcoming_sessions = Session.objects.filter(
        mentor=mentor_profile,
        start_time__gt=timezone.now(),
        status='scheduled'
    ).order_by('start_time')[:5]
    
    # Get feedback and ratings
    from learning_sessions.models import Feedback
    
    feedback_list = Feedback.objects.filter(
        booking__session__mentor=mentor_profile
    ).select_related('booking__learner').order_by('-created_at')[:10]
    
    # Check if the current user has booked a session with this mentor
    has_booked = False
    if request.user.is_authenticated and request.user.role == 'learner':
        from learning_sessions.models import Booking
        has_booked = Booking.objects.filter(
            learner=request.user,
            session__mentor=mentor_profile,
            status__in=['confirmed', 'completed']
        ).exists()
    
    return render(request, 'users/mentor_profile.html', {
        'mentor': mentor_profile,
        'upcoming_sessions': upcoming_sessions,
        'feedback_list': feedback_list,
        'has_booked': has_booked,
    })


@login_required
def accept_reject_booking(request, booking_id, action):
    """
    View for mentors to accept or reject booking requests.
    
    Args:
        booking_id: ID of the booking
        action: Either 'accept' or 'reject'
    """
    if request.user.role != 'mentor':
        messages.error(request, _('Only mentors can perform this action.'))
        return redirect('landing_page')
    
    # Import here to avoid circular imports
    from learning_sessions.models import Booking
    
    booking = get_object_or_404(Booking, id=booking_id)
    
    # Verify that this booking is for a session by this mentor
    if booking.session.mentor.user != request.user:
        messages.error(request, _('You do not have permission to manage this booking.'))
        return redirect('mentor_dashboard')
    
    if action == 'accept':
        booking.status = 'confirmed'
        messages.success(request, _('Booking confirmed successfully!'))
    elif action == 'reject':
        booking.status = 'rejected'
        messages.info(request, _('Booking request rejected.'))
    else:
        messages.error(request, _('Invalid action.'))
        return redirect('mentor_dashboard')
    
    booking.save()
    return redirect('mentor_dashboard')


def handler404(request, exception=None):
    """Custom 404 error handler."""
    return render(request, 'errors/404.html', status=404)


def handler500(request):
    """Custom 500 error handler."""
    return render(request, 'errors/500.html', status=500)


def rate_limited_error(request, exception=None):
    """View for rate limiting errors."""
    return render(request, 'errors/429.html', status=429)
