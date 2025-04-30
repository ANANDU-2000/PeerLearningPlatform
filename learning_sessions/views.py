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
    # Special handling for mentors - redirect to their sessions page
    if request.user.is_authenticated and request.user.role == 'mentor':
        return redirect('mentor_sessions')
    
    # Get current time for filtering
    now = timezone.now()
    
    # Get live sessions (in progress right now)
    live_sessions = Session.objects.filter(
        status='in_progress',
        mentor__is_approved=True
    ).select_related('mentor', 'mentor__user').order_by('start_time').distinct()
    
    # Get upcoming sessions (scheduled for future)
    upcoming_sessions = Session.objects.filter(
        status='scheduled',
        start_time__gt=now,
        mentor__is_approved=True
    ).select_related('mentor', 'mentor__user').order_by('start_time').distinct()
    
    # Extract categories for the visual filtering system
    categories = ['programming', 'data-science', 'design', 'web-development', 'mobile-development']
    
    # For authenticated learners, get their booked sessions
    my_sessions = []
    liked_sessions = []
    
    if request.user.is_authenticated and request.user.role == 'learner':
        # Get bookings for this learner
        my_bookings = Booking.objects.filter(
            learner=request.user,
            status='confirmed'
        ).select_related('session', 'session__mentor', 'session__mentor__user')
        
        # Extract sessions from bookings
        my_sessions = [booking.session for booking in my_bookings]
        
        # Get liked sessions (placeholder for future feature)
        # liked_sessions = request.user.liked_sessions.all()
    
    # Get personalized recommendations for authenticated users
    recommended_sessions = []
    if request.user.is_authenticated and request.user.role == 'learner':
        try:
            from .ml_recommendations import get_personalized_recommendations
            recommended_sessions = get_personalized_recommendations(request.user, limit=8)
        except Exception as e:
            # Fallback to random upcoming sessions if ML fails
            recommended_sessions = upcoming_sessions.order_by('?')[:8]
            # Log the error
            print(f"Error getting recommendations: {str(e)}")
    
    # Add topics_list to all sessions for better display
    for session in list(live_sessions) + list(upcoming_sessions) + recommended_sessions:
        if hasattr(session, 'tags') and session.tags:
            session.topics_list = [tag.strip() for tag in session.tags.split(',')][:3]  # Limit to 3 tags
    
    # Get mentor profiles for mentor section
    mentor_profiles = MentorProfile.objects.filter(is_approved=True).annotate(
        avg_rating=Avg('feedback__rating')
    ).select_related('user').order_by('-avg_rating')[:4]
    
    context = {
        'live_sessions': live_sessions,
        'upcoming_sessions': upcoming_sessions,
        'my_sessions': my_sessions,
        'liked_sessions': liked_sessions,
        'recommended_sessions': recommended_sessions,
        'categories': categories,
        'mentor_profiles': mentor_profiles,
    }
    
    return render(request, 'sessions/session_list_improved.html', context)


@login_required
def mentor_sessions(request):
    """View for mentors to manage their own sessions."""
    if request.user.role != 'mentor':
        messages.error(request, _('Only mentors can access this page.'))
        return redirect('landing_page')
    
    mentor_profile = get_object_or_404(MentorProfile, user=request.user)
    
    # Get all sessions for this mentor
    now = timezone.now()
    
    # Upcoming sessions (scheduled and not started yet)
    upcoming_sessions = Session.objects.filter(
        mentor=mentor_profile,
        status='scheduled',
        start_time__gt=now
    ).order_by('start_time')
    
    # Live sessions (in progress)
    live_sessions = Session.objects.filter(
        mentor=mentor_profile,
        status='in_progress'
    ).order_by('start_time')
    
    # Mark sessions that start within the next hour
    for session in upcoming_sessions:
        time_until_start = session.start_time - now
        session.starts_soon = time_until_start.total_seconds() < 3600  # 1 hour
    
    # Past sessions (completed or cancelled)
    past_sessions = Session.objects.filter(
        mentor=mentor_profile,
        status__in=['completed', 'cancelled']
    ).order_by('-start_time')[:10]  # Last 10 sessions
    
    # Add earnings and attendees to past sessions
    for session in past_sessions:
        # Get confirmed bookings
        confirmed_bookings = session.bookings.filter(status='confirmed', payment_complete=True)
        session.attendees = confirmed_bookings.count()
        
        # Calculate earnings (minus platform fees)
        session.earnings = sum(booking.final_price * 0.8 for booking in confirmed_bookings)
        
        # Get average rating if any
        feedback_ratings = Feedback.objects.filter(booking__session=session).values_list('rating', flat=True)
        session.avg_rating = round(sum(feedback_ratings) / len(feedback_ratings), 1) if feedback_ratings else None
    
    # Recent activities (bookings, feedbacks, payments)
    recent_activities = []
    
    # New bookings in the last 7 days
    recent_bookings = Booking.objects.filter(
        session__mentor=mentor_profile,
        created_at__gte=now - timezone.timedelta(days=7)
    ).select_related('session', 'learner').order_by('-created_at')[:5]
    
    for booking in recent_bookings:
        recent_activities.append({
            'type': 'booking',
            'title': f"{booking.learner.get_full_name()} booked your session",
            'description': booking.session.title,
            'time_ago': get_time_ago(booking.created_at)
        })
    
    # Recent feedback
    recent_feedback = Feedback.objects.filter(
        booking__session__mentor=mentor_profile,
        created_at__gte=now - timezone.timedelta(days=7)
    ).select_related('booking__session', 'booking__learner').order_by('-created_at')[:5]
    
    for feedback in recent_feedback:
        recent_activities.append({
            'type': 'feedback',
            'title': f"{feedback.booking.learner.get_full_name()} rated your session {feedback.rating}/5",
            'description': feedback.booking.session.title,
            'time_ago': get_time_ago(feedback.created_at)
        })
    
    # Sort recent activities by date
    recent_activities.sort(key=lambda x: x['time_ago'])
    
    # Stats
    upcoming_count = upcoming_sessions.count()
    completed_count = Session.objects.filter(mentor=mentor_profile, status='completed').count()
    
    # Calculate total earnings
    total_earnings = 0
    completed_sessions = Session.objects.filter(mentor=mentor_profile, status='completed')
    for session in completed_sessions:
        confirmed_bookings = session.bookings.filter(status='confirmed', payment_complete=True)
        session_earnings = sum(booking.final_price * 0.8 for booking in confirmed_bookings)  # 80% to mentor
        total_earnings += session_earnings
    
    context = {
        'mentor_profile': mentor_profile,
        'upcoming_sessions': upcoming_sessions,
        'live_sessions': live_sessions,
        'past_sessions': past_sessions,
        'recent_activities': recent_activities,
        'upcoming_count': upcoming_count,
        'completed_count': completed_count,
        'total_earnings': round(total_earnings, 2),
    }
    
    return render(request, 'sessions/mentor_sessions.html', context)


def get_time_ago(timestamp):
    """Helper function to get human-readable time ago string."""
    now = timezone.now()
    diff = now - timestamp
    
    if diff.days > 0:
        return f"{diff.days} days ago"
    
    hours = diff.seconds // 3600
    if hours > 0:
        return f"{hours} hours ago"
    
    minutes = diff.seconds // 60
    if minutes > 0:
        return f"{minutes} minutes ago"
    
    return "Just now"


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
    
    # Get related session recommendations
    try:
        if request.user.is_authenticated and request.user.role == 'learner':
            # Try to use ML recommendations for authenticated learners
            from .ml_recommendations import get_content_based_recommendations
            related_sessions = get_content_based_recommendations(request.user, limit=3)
            # Exclude the current session from recommendations
            related_sessions = [s for s in related_sessions if s.id != session.id][:3]
        else:
            # Use simple tag-based recommendations for non-authenticated users
            raise Exception("User not authenticated as learner, using fallback")
    except Exception as e:
        # Log the error for debugging
        print(f"Session detail recommendation error: {str(e)}")
        # Fallback to simple tag-based recommendations
        related_sessions = Session.objects.filter(
            tags__icontains=session.tags.split(',')[0] if session.tags else '',
            start_time__gt=timezone.now(),
            mentor__is_approved=True
        ).exclude(id=session.id).order_by('start_time')[:3]
    
    # Check if user is a mentor and specifically the one who created this session
    is_mentor = request.user.is_authenticated and request.user.role == 'mentor' and session.mentor.user == request.user
    
    # Check if user has already booked this session
    is_booked = user_booking is not None
    
    context = {
        'session': session,
        'user_booking': user_booking,
        'is_booked': is_booked,
        'is_mentor': is_mentor,
        'related_sessions': related_sessions,
        'booking_form': BookingForm(),
        'now': timezone.now(),  # Pass current time for countdown
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
        messages.warning(request, _('Your mentor profile is pending approval. You can create sessions, but they will only be visible after your profile is approved.'))
    
    if request.method == 'POST':
        form = SessionForm(request.POST, request.FILES)
        if form.is_valid():
            session = form.save(commit=False)
            session.mentor = mentor_profile
            
            # Handle additional fields
            is_free = form.cleaned_data.get('is_free')
            if is_free:
                session.price = 0
                
            # Set SEO metadata if provided
            seo_keywords = form.cleaned_data.get('seo_keywords')
            if seo_keywords:
                # Store SEO keywords in the tags field or process them as needed
                # Combine with regular tags if present
                existing_tags = session.tags
                if existing_tags:
                    session.tags = f"{existing_tags},{seo_keywords}"
                else:
                    session.tags = seo_keywords
            
            # Save the session to get an ID
            session.save()
            
            # Process thumbnail (either uploaded or selected from presets)
            thumbnail = form.cleaned_data.get('thumbnail')
            selected_thumbnail = request.POST.get('selected_thumbnail')
            
            # If both are provided, prioritize the uploaded thumbnail
            if thumbnail:
                # Process uploaded thumbnail
                # Here you would save the image to a specific location or pass it to a service
                pass  # Implementation depends on your image storage system
            elif selected_thumbnail:
                # Store reference to the selected preset thumbnail
                # This might involve copying from static files or saving a reference
                thumbnail_name = request.POST.get('selected_thumbnail_name', '')
                # You might want to store this information in a separate model or field
                pass
            
            messages.success(request, _('Session created successfully! Learners will now be able to book it.'))
            return redirect('session_detail', session_id=session.id)
        else:
            # Form validation errors
            for field, errors in form.errors.items():
                for error in errors:
                    messages.error(request, f"{field}: {error}")
    else:
        # Initialize form with defaults for better UX
        initial_data = {
            'max_participants': 5,  # Default to 5 participants
        }
        form = SessionForm(initial=initial_data)
    
    return render(request, 'sessions/create_session.html', {
        'form': form,
        'mentor_profile': mentor_profile
    })


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
    try:
        # Check if user is a learner
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
        
        # Check if user has already booked this session (including any status)
        existing_booking = Booking.objects.filter(session=session, learner=request.user).first()
        if existing_booking:
            if existing_booking.status == 'confirmed' or existing_booking.status == 'pending':
                messages.info(request, _('You have already booked this session. Check your upcoming sessions.'))
                # Add a more helpful link to view their booking
                return redirect('learner_dashboard')
            elif existing_booking.status == 'cancelled':
                messages.warning(request, _('You previously cancelled this booking. You can book it again.'))
                # Allow rebooking if previously cancelled
                # Delete the old booking
                existing_booking.delete()
            else:
                messages.info(request, _('You have already booked this session. Check your cart.'))
                return redirect('cart')
        
        # For GET requests, show confirmation page first
        if request.method == 'GET':
            confirm = request.GET.get('confirm', 'false') == 'true'
            
            if not confirm:
                # Show confirmation first before adding to cart
                return render(request, 'sessions/book_session.html', {
                    'session': session,
                    'form': BookingForm(),
                    'confirmation_needed': True
                })
        
        # Process booking (either POST or GET with confirm=true)
        if request.method == 'POST' or (request.method == 'GET' and request.GET.get('confirm') == 'true'):
            form = BookingForm(request.POST) if request.method == 'POST' else BookingForm()
            
            if form.is_valid() or request.method == 'GET':
                # Begin database transaction
                from django.db import transaction
                with transaction.atomic():
                    # Create the booking
                    booking = Booking() if request.method == 'GET' else form.save(commit=False)
                    booking.session = session
                    booking.learner = request.user
                    
                    # Set the final price (handling free sessions)
                    booking.final_price = session.price
                    
                    # Apply coupon code if provided
                    coupon_code = form.cleaned_data.get('coupon_code') if request.method == 'POST' else None
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
                    
                    # Check if the session is now full
                    current_bookings = Booking.objects.filter(
                        session=session, 
                        status__in=['pending', 'confirmed']
                    ).count()
                    
                    # Update the session participants count
                    session.current_participants = current_bookings
                    session.save()
                
                messages.success(request, _('Session added to cart! Proceed to payment.'))
                return redirect('cart')
            else:
                # Form is invalid
                for field, errors in form.errors.items():
                    for error in errors:
                        messages.error(request, f"{field}: {error}")
        
        # GET request without confirmation
        return render(request, 'sessions/book_session.html', {
            'form': BookingForm(),
            'session': session
        })
        
    except Exception as e:
        # Log the error
        print(f"Error in book_session: {str(e)}")
        messages.error(request, _('An error occurred while booking the session. Please try again.'))
        return redirect('session_list')


@login_required
def session_room_enhanced(request, session_id):
    """Enhanced view for WebRTC live session room."""
    try:
        # Get session with proper error handling
        try:
            session = get_object_or_404(Session, id=session_id)
        except Exception as e:
            messages.error(request, _('The requested session does not exist.'))
            return redirect('dashboard')
        
        # First, authenticate the user
        if not request.user.is_authenticated:
            messages.error(request, _('Please log in to access the session room.'))
            return redirect('login')
        
        # Default permission settings
        is_learner_allowed = False
        is_mentor_allowed = False
        
        # DEVELOPMENT MODE - Always allow direct access for testing
        # This bypasses normal access control for easier testing
        print(f"DEVELOPMENT MODE: Allowing user {request.user.id} to join enhanced session {session_id}")
        
        # Set development mode flag (always True for now)
        dev_mode = True
        
        # AUTO-CREATE BOOKING LOGIC
        if dev_mode:
            # If user is a learner, ensure they have a confirmed booking
            if request.user.role == 'learner':
                # Try to find an existing booking
                booking = Booking.objects.filter(
                    session=session,
                    learner=request.user
                ).first()
                
                # If no booking exists, create one
                if not booking:
                    print(f"AUTO-CREATING booking for learner {request.user.id}")
                    booking = Booking.objects.create(
                        session=session,
                        learner=request.user,
                        status='confirmed',
                        payment_complete=True,
                        final_price=0,  # Free for testing
                        discount_amount=session.price if session.price else 0  # Full discount
                    )
                    
                    # Create a transaction record
                    from payments.models import Transaction
                    Transaction.objects.create(
                        booking=booking,
                        amount=session.price or 0,
                        currency='INR',
                        status='completed',
                        payment_method='free_dev_mode',
                        metadata={'dev_mode': True}
                    )
                    
                    messages.success(request, _('DEV MODE: Auto-created booking for testing.'))
                    
                # If booking exists but isn't confirmed/paid, update it
                elif not booking.payment_complete or booking.status != 'confirmed':
                    print(f"UPDATING existing booking to confirmed for learner {request.user.id}")
                    booking.status = 'confirmed'
                    booking.payment_complete = True
                    booking.save()
                    
                    # Make sure there's a transaction record
                    from payments.models import Transaction
                    if not Transaction.objects.filter(booking=booking).exists():
                        Transaction.objects.create(
                            booking=booking,
                            amount=session.price or 0,
                            currency='INR',
                            status='completed',
                            payment_method='free_dev_mode',
                            metadata={'dev_mode': True, 'auto_updated': True}
                        )
                    
                    messages.success(request, _('DEV MODE: Updated booking to confirmed status.'))
                
                is_learner_allowed = True
                
            # If user is a mentor, check if they own this session
            elif request.user.role == 'mentor':
                # For testing, allow any mentor to join
                is_mentor_allowed = True
        else:
            # Normal permission checks
            # Check if user is the mentor for this session
            if hasattr(request.user, 'mentorprofile') and session.mentor == request.user.mentorprofile:
                is_mentor_allowed = True
            
            # Or check if user is a learner with a confirmed booking
            elif request.user.role == 'learner':
                # Try to find a booking for this learner
                booking = Booking.objects.filter(
                    session=session,
                    learner=request.user,
                    status='confirmed',
                    payment_complete=True
                ).exists()
                
                is_learner_allowed = booking
        
        # Final authorization check
        if not (is_learner_allowed or is_mentor_allowed):
            messages.error(request, _('You are not authorized to access this session room.'))
            return redirect('dashboard')
        
        # Determine if the session has started
        now = timezone.now()
        session_started = now >= session.start_time
        session_ended = now > session.end_time
        
        # Get booking for context (mainly for learner name)
        booking = Booking.objects.filter(session=session).first()
        
        # Prepare context for template
        context = {
            'session': session,
            'booking': booking,
            'is_mentor': is_mentor_allowed,
            'session_started': session_started,
            'session_ended': session_ended,
            'dev_mode': dev_mode
        }
        
        # Render the enhanced session room template
        return render(request, 'sessions/session_room_enhanced.html', context)
        
    except Exception as e:
        # Log the exception for debugging
        print(f"Error in session_room_enhanced: {str(e)}")
        messages.error(request, _('An error occurred while loading the session room.'))
        return redirect('dashboard')


def session_room(request, session_id):
    """View for the live session room."""
    try:
        # Get session with proper error handling
        try:
            session = get_object_or_404(Session, id=session_id)
        except Exception as e:
            messages.error(request, _('The requested session does not exist.'))
            return redirect('dashboard')
        
        # First, authenticate the user
        if not request.user.is_authenticated:
            messages.error(request, _('Please log in to access the session room.'))
            return redirect('login')
        
        # Default permission settings
        is_learner_allowed = False
        is_mentor_allowed = False
        
        # DEVELOPMENT MODE - Always allow direct access for testing
        # This bypasses normal access control for easier testing
        print(f"DEVELOPMENT MODE: Allowing user {request.user.id} to join session {session_id}")
        
        # Set development mode flag (always True for now)
        dev_mode = True
        
        # AUTO-CREATE BOOKING LOGIC
        if dev_mode:
            # If user is a learner, ensure they have a confirmed booking
            if request.user.role == 'learner':
                # Try to find an existing booking
                booking = Booking.objects.filter(
                    session=session,
                    learner=request.user
                ).first()
                
                # If no booking exists at all, create one that's confirmed and paid
                if not booking:
                    print(f"AUTO-CREATING new confirmed booking for learner {request.user.id}")
                    booking = Booking(
                        session=session,
                        learner=request.user,
                        status='confirmed',
                        payment_complete=True,
                        final_price=session.price or 0
                    )
                    booking.save()
                    
                    # Create payment record
                    from payments.models import Transaction
                    Transaction.objects.create(
                        booking=booking,
                        amount=session.price or 0,
                        currency='INR',
                        status='completed',
                        payment_method='free_dev_mode',
                        metadata={'dev_mode': True}
                    )
                    
                    messages.success(request, _('DEV MODE: Auto-created booking for testing.'))
                    
                # If booking exists but isn't confirmed/paid, update it
                elif not booking.payment_complete or booking.status != 'confirmed':
                    print(f"UPDATING existing booking to confirmed for learner {request.user.id}")
                    booking.status = 'confirmed'
                    booking.payment_complete = True
                    booking.save()
                    
                    # Make sure there's a transaction record
                    from payments.models import Transaction
                    if not Transaction.objects.filter(booking=booking).exists():
                        Transaction.objects.create(
                            booking=booking,
                            amount=session.price or 0,
                            currency='INR',
                            status='completed',
                            payment_method='free_dev_mode',
                            metadata={'dev_mode': True, 'auto_updated': True}
                        )
                    
                    messages.success(request, _('DEV MODE: Updated booking to confirmed status.'))
            
            # Set permissions based on role for development mode
            if request.user.role == 'learner':
                is_learner_allowed = True
                is_mentor_allowed = False
            elif request.user.role == 'mentor':
                is_mentor_allowed = True
                is_learner_allowed = False
                
                # If this mentor isn't assigned to the session, assign them now
                if not session.mentor or session.mentor.user_id != request.user.id:
                    from users.models import MentorProfile
                    mentor_profile = MentorProfile.objects.filter(user=request.user).first()
                    if mentor_profile:
                        session.mentor = mentor_profile
                        session.save()
                        print(f"AUTO-ASSIGNED mentor {request.user.id} to session {session_id}")
                        messages.success(request, _('DEV MODE: Auto-assigned you as the mentor for this session.'))
        else:
            # PRODUCTION MODE CHECKS (more strict)
            if request.user.role == 'learner':
                # Check if learner has a confirmed booking for this session
                try:
                    has_booking = Booking.objects.filter(
                        session=session, 
                        learner=request.user,
                        status='confirmed',
                        payment_complete=True
                    ).exists()
                    
                    if not has_booking:
                        # Check if they have an unpaid booking
                        has_unpaid = Booking.objects.filter(
                            session=session,
                            learner=request.user,
                            payment_complete=False
                        ).exists()
                        
                        if has_unpaid:
                            messages.error(request, _('Please complete payment for this session before joining.'))
                            return redirect('cart')
                        else:
                            messages.error(request, _('You need to book this session before joining.'))
                            return redirect('session_detail', session_id=session_id)
                except Exception as e:
                    messages.error(request, _('Error checking booking status. Please try again.'))
                    print(f"Error checking learner booking: {str(e)}")
                    return redirect('learner_dashboard')
            else:
                # For mentor role
                is_mentor_allowed = (
                    request.user.role == 'mentor' and 
                    session.mentor and  # Check if mentor exists
                    session.mentor.user_id == request.user.id
                )
                
                if not is_mentor_allowed:
                    messages.error(request, _('You do not have permission to access this session.'))
                    return redirect('dashboard')
        
        # Check session timing to prevent access to past or far-future sessions
        now = timezone.now()
        
        # Only check timing in production mode, skip in dev mode
        if not dev_mode:
            # Check if session has ended
            if session.end_time < now:
                messages.error(request, _('This session has already ended.'))
                return redirect('dashboard')
            
            # Check if session is too far in the future (more than 1 hour before start)
            if session.start_time > now + timezone.timedelta(hours=1):
                time_until = session.start_time - now
                hours = time_until.seconds // 3600
                minutes = (time_until.seconds % 3600) // 60
                
                if time_until.days > 0:
                    messages.error(request, _(f'This session starts in {time_until.days} days and {hours} hours. You can join up to 1 hour before the start time.'))
                else:
                    messages.error(request, _(f'This session starts in {hours} hours and {minutes} minutes. You can join up to 1 hour before the start time.'))
                
                return redirect('session_detail', session_id=session_id)
        else:
            # In development mode, allow access regardless of timing
            print("DEV MODE: Bypassing time restrictions for session room access")
        
        # Update session status if it's starting
        if session.status == 'scheduled' and session.start_time <= now:
            try:
                session.status = 'in_progress'
                session.save()
            except Exception as e:
                print(f"Error updating session status: {str(e)}")
                # Continue anyway - non-critical error
        
        # WebRTC configuration
        try:
            stun_servers = settings.STUN_SERVERS
            turn_servers = settings.TURN_SERVERS
            turn_username = settings.TURN_USERNAME
            turn_credential = settings.TURN_CREDENTIAL
        except Exception as e:
            # Use defaults if settings are missing
            print(f"Error loading WebRTC config: {str(e)}")
            stun_servers = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']
            turn_servers = []
            turn_username = ''
            turn_credential = ''
        
        # Get participants with error handling
        try:
            bookings = session.bookings.filter(
                status='confirmed', 
                payment_complete=True
            ).select_related('learner')
            participants = [booking.learner for booking in bookings]
        except Exception as e:
            print(f"Error loading participants: {str(e)}")
            participants = []
        
        # Add booking to context for feedback link
        booking = None
        if request.user.role == 'learner':
            try:
                booking = Booking.objects.get(
                    session=session,
                    learner=request.user,
                    status='confirmed'
                )
            except Exception as e:
                print(f"Error finding booking for feedback link: {str(e)}")
        
        context = {
            'session': session,
            'is_mentor': is_mentor_allowed,
            'is_learner': is_learner_allowed,
            'participants': participants,
            'stun_servers': stun_servers,
            'turn_servers': turn_servers,
            'turn_username': turn_username,
            'turn_credential': turn_credential,
            'booking': booking,  # Add booking to context
        }
        
        return render(request, 'sessions/session_room.html', context)
        
    except Exception as e:
        print(f"Unexpected error in session_room: {str(e)}")
        messages.error(request, _('An unexpected error occurred. Please try again.'))
        return redirect('dashboard')


@login_required
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
    
    if request.method == 'POST':
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
            return redirect('learner_dashboard')
        else:
            messages.error(request, _('There was an error submitting your feedback. Please try again.'))
    else:
        form = FeedbackForm()
    
    context = {
        'booking': booking,
        'form': form,
        'session': booking.session,
    }
    
    return render(request, 'sessions/submit_feedback.html', context)


@login_required
def my_booked_sessions(request):
    """View for learners to see all their booked sessions."""
    # Check if user is a learner
    if request.user.role != 'learner':
        messages.error(request, _('This page is only for learners.'))
        return redirect('landing_page')
    
    # Get current time for filtering
    now = timezone.now()
    
    # Get upcoming booked sessions (confirmed bookings for future sessions)
    upcoming_sessions = Booking.objects.filter(
        learner=request.user,
        status='confirmed',
        payment_complete=True,
        session__end_time__gt=now
    ).select_related('session', 'session__mentor', 'session__mentor__user').order_by('session__start_time')
    
    # Get past sessions (completed bookings for past sessions)
    past_sessions = Booking.objects.filter(
        learner=request.user,
        status='confirmed',
        payment_complete=True,
        session__end_time__lte=now
    ).select_related('session', 'session__mentor', 'session__mentor__user').order_by('-session__start_time')
    
    # Get pending bookings (in cart, not paid yet)
    pending_bookings = Booking.objects.filter(
        learner=request.user,
        status='pending',
        payment_complete=False
    ).select_related('session', 'session__mentor', 'session__mentor__user').order_by('session__start_time')
    
    context = {
        'upcoming_sessions': upcoming_sessions,
        'past_sessions': past_sessions,
        'pending_bookings': pending_bookings,
    }
    
    return render(request, 'sessions/my_booked_sessions.html', context)


def webrtc_test_page(request):
    """WebRTC testing page."""
    return render(request, 'sessions/webrtc_test.html')


@login_required
def webrtc_live_test(request, session_id):
    """Live WebRTC test room for real-time video sessions."""
    # This is a simple view that passes the session_id to the template
    # We'll handle connection logic on the frontend
    return render(request, 'sessions/webrtc_live_test.html', {
        'session_id': session_id
    })
