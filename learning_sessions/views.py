"""
Views for the sessions app.
"""

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponseForbidden
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.db.models import Q, Avg
from django.views.decorators.http import require_POST
from django.conf import settings

from .models import Session, Booking, Feedback
from .forms import SessionForm, BookingForm, FeedbackForm
from users.models import MentorProfile


def session_list(request):
    """View for listing all available sessions."""
    # Get base queryset of upcoming, non-full sessions with approved mentors
    queryset = Session.objects.filter(
        status='scheduled',
        start_time__gt=timezone.now(),
        mentor__is_approved=True
    ).select_related('mentor__user').order_by('start_time')
    
    # Apply filters if provided
    search_query = request.GET.get('q')
    tag_filter = request.GET.get('tag')
    min_price = request.GET.get('min_price')
    max_price = request.GET.get('max_price')
    
    if search_query:
        queryset = queryset.filter(
            Q(title__icontains=search_query) |
            Q(description__icontains=search_query) |
            Q(tags__icontains=search_query) |
            Q(mentor__expertise__icontains=search_query)
        )
    
    if tag_filter:
        queryset = queryset.filter(tags__icontains=tag_filter)
    
    if min_price:
        queryset = queryset.filter(price__gte=min_price)
    
    if max_price:
        queryset = queryset.filter(price__lte=max_price)
    
    # Get all available tags for filtering
    all_tags = set()
    for session in Session.objects.filter(mentor__is_approved=True):
        if session.tags:
            all_tags.update([tag.strip() for tag in session.tags.split(',')])
    
    # Add ML-powered personalized recommendations for authenticated users
    personalized_recommendations = []
    if request.user.is_authenticated and request.user.role == 'learner' and not (search_query or tag_filter or min_price or max_price):
        # Only show personalized recommendations when no filters are applied
        from .ml_recommendations import get_personalized_recommendations
        personalized_recommendations = get_personalized_recommendations(request.user, limit=4)
    
    context = {
        'sessions': queryset,
        'search_query': search_query,
        'tag_filter': tag_filter,
        'min_price': min_price,
        'max_price': max_price,
        'all_tags': sorted(all_tags),
        'personalized_recommendations': personalized_recommendations,
    }
    
    return render(request, 'sessions/session_list.html', context)


def session_detail(request, session_id):
    """View for viewing details of a specific session."""
    session = get_object_or_404(Session, id=session_id, mentor__is_approved=True)
    
    # Check if user has already booked this session
    user_booking = None
    if request.user.is_authenticated:
        try:
            user_booking = Booking.objects.get(session=session, learner=request.user)
        except Booking.DoesNotExist:
            pass
    
    # Get ML-powered similar session recommendations
    if request.user.is_authenticated and request.user.role == 'learner':
        # Use machine learning recommendations for authenticated learners
        from .ml_recommendations import get_content_based_recommendations
        related_sessions = get_content_based_recommendations(request.user, limit=3)
        # Exclude the current session from recommendations
        related_sessions = [s for s in related_sessions if s.id != session.id][:3]
    else:
        # Fallback to simple tag-based recommendations for non-authenticated users
        related_sessions = Session.objects.filter(
            tags__icontains=session.tags.split(',')[0] if session.tags else '',
            start_time__gt=timezone.now(),
            mentor__is_approved=True
        ).exclude(id=session.id).order_by('start_time')[:3]
    
    context = {
        'session': session,
        'user_booking': user_booking,
        'related_sessions': related_sessions,
        'booking_form': BookingForm(),
    }
    
    return render(request, 'sessions/session_detail.html', context)


@login_required
def create_session(request):
    """View for mentors to create a new session."""
    if request.user.role != 'mentor':
        messages.error(request, _('Only mentors can create sessions.'))
        return redirect('landing_page')
    
    # Check if mentor is approved
    mentor_profile = get_object_or_404(MentorProfile, user=request.user)
    if not mentor_profile.is_approved:
        messages.error(request, _('Your mentor profile needs to be approved before you can create sessions.'))
        return redirect('mentor_dashboard')
    
    if request.method == 'POST':
        form = SessionForm(request.POST)
        if form.is_valid():
            session = form.save(commit=False)
            session.mentor = mentor_profile
            session.save()
            
            messages.success(request, _('Session created successfully!'))
            return redirect('session_detail', session_id=session.id)
    else:
        form = SessionForm()
    
    return render(request, 'sessions/create_session.html', {'form': form})


@login_required
def edit_session(request, session_id):
    """View for mentors to edit an existing session."""
    session = get_object_or_404(Session, id=session_id)
    
    # Check if user is the mentor for this session
    if request.user.role != 'mentor' or session.mentor.user != request.user:
        messages.error(request, _('You do not have permission to edit this session.'))
        return redirect('session_detail', session_id=session.id)
    
    # Don't allow editing past sessions
    if session.is_past:
        messages.error(request, _('You cannot edit past sessions.'))
        return redirect('session_detail', session_id=session.id)
    
    if request.method == 'POST':
        form = SessionForm(request.POST, instance=session)
        if form.is_valid():
            form.save()
            messages.success(request, _('Session updated successfully!'))
            return redirect('session_detail', session_id=session.id)
    else:
        form = SessionForm(instance=session)
    
    return render(request, 'sessions/edit_session.html', {'form': form, 'session': session})


@login_required
def cancel_session(request, session_id):
    """View for mentors to cancel a session."""
    session = get_object_or_404(Session, id=session_id)
    
    # Check if user is the mentor for this session
    if request.user.role != 'mentor' or session.mentor.user != request.user:
        messages.error(request, _('You do not have permission to cancel this session.'))
        return redirect('session_detail', session_id=session.id)
    
    # Don't allow cancelling past sessions
    if session.is_past:
        messages.error(request, _('You cannot cancel past sessions.'))
        return redirect('session_detail', session_id=session.id)
    
    if request.method == 'POST':
        session.status = 'cancelled'
        session.save()
        
        # Notify all participants
        bookings = session.bookings.filter(status='confirmed')
        for booking in bookings:
            # In a real app, send email notifications
            booking.status = 'cancelled'
            booking.save()
        
        messages.success(request, _('Session cancelled successfully.'))
        return redirect('mentor_dashboard')
    
    return render(request, 'sessions/cancel_session.html', {'session': session})


@login_required
def book_session(request, session_id):
    """View for learners to book a session."""
    if request.user.role != 'learner':
        messages.error(request, _('Only learners can book sessions.'))
        return redirect('landing_page')
    
    session = get_object_or_404(Session, id=session_id, mentor__is_approved=True)
    
    # Check if session is available for booking
    if session.is_past:
        messages.error(request, _('This session has already ended.'))
        return redirect('session_list')
    
    if session.is_full:
        messages.error(request, _('This session is already fully booked.'))
        return redirect('session_list')
    
    # Check if user has already booked this session
    existing_booking = Booking.objects.filter(session=session, learner=request.user).first()
    if existing_booking:
        messages.info(request, _('You have already booked this session.'))
        return redirect('cart')
    
    if request.method == 'POST':
        form = BookingForm(request.POST)
        if form.is_valid():
            booking = form.save(commit=False)
            booking.session = session
            booking.learner = request.user
            
            # Apply coupon code if provided
            coupon_code = form.cleaned_data.get('coupon_code')
            if coupon_code:
                # In a real app, validate coupon code against a database
                # For now, just use a simple example
                if coupon_code == 'WELCOME10':
                    discount = session.price * 0.1  # 10% discount
                    booking.coupon_applied = coupon_code
                    booking.discount_amount = discount
                    booking.final_price = session.price - discount
                else:
                    messages.warning(request, _('Invalid coupon code.'))
            
            booking.save()
            
            # Increment current participants count
            session.current_participants += 1
            session.save()
            
            messages.success(request, _('Session booked successfully! Proceed to payment.'))
            return redirect('cart')
    else:
        form = BookingForm()
    
    return render(request, 'sessions/book_session.html', {
        'form': form,
        'session': session
    })


@login_required
def session_room(request, session_id):
    """View for the live session room."""
    session = get_object_or_404(Session, id=session_id)
    
    # Check if user has permission to access this session
    # TESTING ONLY: Allow any learner to join any session
    if request.user.role == 'learner':
        # For testing, consider all learners allowed if they have a booking or are the test user
        has_booking = Booking.objects.filter(
            session=session, 
            learner=request.user
        ).exists()
        is_learner_allowed = has_booking or 'test_learner' in request.user.email
    else:
        is_learner_allowed = False
    
    is_mentor_allowed = (
        request.user.role == 'mentor' and 
        session.mentor.user == request.user
    )
    
    if not (is_learner_allowed or is_mentor_allowed):
        messages.error(request, _('You do not have permission to access this session.'))
        return redirect('dashboard')
    
    # Update session status if it's starting
    if session.status == 'scheduled' and session.start_time <= timezone.now():
        session.status = 'in_progress'
        session.save()
    
    # WebRTC configuration
    stun_servers = settings.STUN_SERVERS
    turn_servers = settings.TURN_SERVERS
    turn_username = settings.TURN_USERNAME
    turn_credential = settings.TURN_CREDENTIAL
    
    # Get participants
    bookings = session.bookings.filter(status='confirmed', payment_complete=True).select_related('learner')
    participants = [booking.learner for booking in bookings]
    
    context = {
        'session': session,
        'is_mentor': is_mentor_allowed,
        'is_learner': is_learner_allowed,
        'participants': participants,
        'stun_servers': stun_servers,
        'turn_servers': turn_servers,
        'turn_username': turn_username,
        'turn_credential': turn_credential,
    }
    
    return render(request, 'sessions/session_room.html', context)


@login_required
@require_POST
def submit_feedback(request, booking_id):
    """View for learners to submit feedback after a session."""
    booking = get_object_or_404(Booking, id=booking_id, learner=request.user)
    
    # Check if session is completed
    if booking.session.status != 'completed':
        messages.error(request, _('You can only provide feedback for completed sessions.'))
        return redirect('learner_dashboard')
    
    # Check if feedback already exists
    try:
        feedback = booking.feedback
        messages.info(request, _('You have already provided feedback for this session.'))
        return redirect('learner_dashboard')
    except Feedback.DoesNotExist:
        pass
    
    form = FeedbackForm(request.POST)
    if form.is_valid():
        feedback = form.save(commit=False)
        feedback.booking = booking
        feedback.save()
        
        # Update mentor's average rating
        mentor = booking.session.mentor
        total_ratings = Feedback.objects.filter(booking__session__mentor=mentor).count()
        avg_rating = Feedback.objects.filter(booking__session__mentor=mentor).aggregate(avg=Avg('rating'))['avg']
        
        mentor.total_reviews = total_ratings
        mentor.average_rating = avg_rating
        mentor.save()
        
        messages.success(request, _('Thank you for your feedback!'))
    else:
        messages.error(request, _('There was an error submitting your feedback. Please try again.'))
    
    return redirect('learner_dashboard')
