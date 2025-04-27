"""
Views for the admin panel.
"""

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib import messages
from django.http import JsonResponse
from django.utils.translation import gettext_lazy as _
from django.db.models import Count, Sum, Avg, F, Q
from django.utils import timezone
from datetime import timedelta

from users.models import User, MentorProfile
from learning_sessions.models import Session, Booking, Feedback
from payments.models import Transaction, WithdrawalRequest


def is_admin(user):
    """Check if user is an admin."""
    return user.is_authenticated and user.role == 'admin'


@login_required
@user_passes_test(is_admin)
def admin_dashboard(request):
    """Admin dashboard view."""
    # Get counts for overview stats
    total_users = User.objects.count()
    total_learners = User.objects.filter(role='learner').count()
    total_mentors = User.objects.filter(role='mentor').count()
    total_sessions = Session.objects.count()
    total_bookings = Booking.objects.filter(status='confirmed').count()
    total_revenue = Transaction.objects.filter(status='completed').aggregate(Sum('amount'))['amount__sum'] or 0
    
    # Get pending mentor approvals
    pending_mentors = MentorProfile.objects.filter(is_approved=False).select_related('user')
    
    # Get pending withdrawal requests
    pending_withdrawals = WithdrawalRequest.objects.filter(status='pending').select_related('mentor__user')
    
    # Calculate recent revenue (last 30 days)
    thirty_days_ago = timezone.now() - timedelta(days=30)
    recent_transactions = Transaction.objects.filter(
        status='completed',
        created_at__gte=thirty_days_ago
    )
    
    # Prepare chart data (daily revenue for last 30 days)
    revenue_by_day = {}
    for i in range(30):
        day = (timezone.now() - timedelta(days=i)).date()
        revenue_by_day[day.strftime('%Y-%m-%d')] = 0
    
    for transaction in recent_transactions:
        day = transaction.created_at.date().strftime('%Y-%m-%d')
        if day in revenue_by_day:
            revenue_by_day[day] += float(transaction.amount)
    
    # Format chart data for Chart.js
    chart_labels = list(revenue_by_day.keys())
    chart_data = list(revenue_by_day.values())
    
    # Get recent sessions
    recent_sessions = Session.objects.all().order_by('-created_at')[:10]
    
    context = {
        'total_users': total_users,
        'total_learners': total_learners,
        'total_mentors': total_mentors,
        'total_sessions': total_sessions,
        'total_bookings': total_bookings,
        'total_revenue': total_revenue,
        'pending_mentors': pending_mentors,
        'pending_withdrawals': pending_withdrawals,
        'chart_labels': chart_labels,
        'chart_data': chart_data,
        'recent_sessions': recent_sessions,
    }
    
    return render(request, 'admin_panel/dashboard.html', context)


@login_required
@user_passes_test(is_admin)
def mentor_approval(request):
    """View for approving mentor applications."""
    # Get all pending mentors
    pending_mentors = MentorProfile.objects.filter(is_approved=False).select_related('user')
    
    # Get approved mentors
    approved_mentors = MentorProfile.objects.filter(is_approved=True).select_related('user')
    
    context = {
        'pending_mentors': pending_mentors,
        'approved_mentors': approved_mentors,
    }
    
    return render(request, 'admin_panel/mentor_approval.html', context)


@login_required
@user_passes_test(is_admin)
def approve_mentor(request, mentor_id):
    """View to approve a mentor."""
    mentor = get_object_or_404(MentorProfile, id=mentor_id, is_approved=False)
    
    if request.method == 'POST':
        mentor.is_approved = True
        mentor.save()
        
        # Send notification email (in real implementation)
        
        messages.success(request, _(f'Mentor {mentor.user.get_full_name()} has been approved.'))
    
    return redirect('mentor_approval')


@login_required
@user_passes_test(is_admin)
def reject_mentor(request, mentor_id):
    """View to reject a mentor."""
    mentor = get_object_or_404(MentorProfile, id=mentor_id, is_approved=False)
    
    if request.method == 'POST':
        # Get the reason for rejection
        reason = request.POST.get('reason', '')
        
        # In a real app, send email notification with reason
        
        # Delete the mentor profile and optionally the user account
        user = mentor.user
        mentor.delete()
        
        if request.POST.get('delete_user'):
            user.delete()
            messages.success(request, _(f'Mentor application and user account deleted.'))
        else:
            messages.success(request, _(f'Mentor application for {user.get_full_name()} has been rejected.'))
    
    return redirect('mentor_approval')


@login_required
@user_passes_test(is_admin)
def session_management(request):
    """View for managing sessions."""
    # Get all sessions with filters
    sessions = Session.objects.all().select_related('mentor__user')
    
    # Apply filters if provided
    status_filter = request.GET.get('status')
    mentor_filter = request.GET.get('mentor')
    date_from = request.GET.get('date_from')
    date_to = request.GET.get('date_to')
    
    if status_filter:
        sessions = sessions.filter(status=status_filter)
    
    if mentor_filter:
        sessions = sessions.filter(mentor__user__id=mentor_filter)
    
    if date_from:
        sessions = sessions.filter(start_time__gte=date_from)
    
    if date_to:
        sessions = sessions.filter(start_time__lte=date_to)
    
    # Get mentors for filter dropdown
    mentors = MentorProfile.objects.filter(is_approved=True).select_related('user')
    
    context = {
        'sessions': sessions,
        'mentors': mentors,
        'status_filter': status_filter,
        'mentor_filter': mentor_filter,
        'date_from': date_from,
        'date_to': date_to,
    }
    
    return render(request, 'admin_panel/session_management.html', context)


@login_required
@user_passes_test(is_admin)
def user_management(request):
    """View for managing users."""
    # Get all users with filters
    users = User.objects.all()
    
    # Apply filters if provided
    role_filter = request.GET.get('role')
    search_query = request.GET.get('q')
    
    if role_filter:
        users = users.filter(role=role_filter)
    
    if search_query:
        users = users.filter(
            Q(email__icontains=search_query) |
            Q(first_name__icontains=search_query) |
            Q(last_name__icontains=search_query)
        )
    
    context = {
        'users': users,
        'role_filter': role_filter,
        'search_query': search_query,
    }
    
    return render(request, 'admin_panel/user_management.html', context)


@login_required
@user_passes_test(is_admin)
def payment_management(request):
    """View for managing payments and withdrawals."""
    # Get all transactions with filters
    transactions = Transaction.objects.all().select_related(
        'booking__learner',
        'booking__session__mentor__user'
    )
    
    # Apply filters if provided
    status_filter = request.GET.get('status')
    type_filter = request.GET.get('type')
    date_from = request.GET.get('date_from')
    date_to = request.GET.get('date_to')
    
    if status_filter:
        transactions = transactions.filter(status=status_filter)
    
    if type_filter == 'payment':
        transactions = transactions.exclude(status__startswith='withdrawal')
    elif type_filter == 'withdrawal':
        transactions = transactions.filter(status__startswith='withdrawal')
    
    if date_from:
        transactions = transactions.filter(created_at__gte=date_from)
    
    if date_to:
        transactions = transactions.filter(created_at__lte=date_to)
    
    # Get withdrawal requests
    withdrawals = WithdrawalRequest.objects.all().select_related('mentor__user')
    
    context = {
        'transactions': transactions,
        'withdrawals': withdrawals,
        'status_filter': status_filter,
        'type_filter': type_filter,
        'date_from': date_from,
        'date_to': date_to,
    }
    
    return render(request, 'admin_panel/payment_management.html', context)


@login_required
@user_passes_test(is_admin)
def analytics(request):
    """View for analytics and reporting."""
    # Time period selection
    period = request.GET.get('period', '30')  # Default to 30 days
    
    if period == '7':
        start_date = timezone.now() - timedelta(days=7)
        period_name = _('Last 7 Days')
    elif period == '30':
        start_date = timezone.now() - timedelta(days=30)
        period_name = _('Last 30 Days')
    elif period == '90':
        start_date = timezone.now() - timedelta(days=90)
        period_name = _('Last 90 Days')
    elif period == 'all':
        start_date = None
        period_name = _('All Time')
    else:
        start_date = timezone.now() - timedelta(days=30)
        period_name = _('Last 30 Days')
    
    # Base queryset filtering by date
    transactions_query = Transaction.objects.filter(status='completed')
    sessions_query = Session.objects.all()
    users_query = User.objects.all()
    
    if start_date:
        transactions_query = transactions_query.filter(created_at__gte=start_date)
        sessions_query = sessions_query.filter(created_at__gte=start_date)
        users_query = users_query.filter(date_joined__gte=start_date)
    
    # Calculate metrics
    total_revenue = transactions_query.aggregate(Sum('amount'))['amount__sum'] or 0
    total_sessions = sessions_query.count()
    total_new_users = users_query.count()
    
    avg_session_price = sessions_query.aggregate(Avg('price'))['price__avg'] or 0
    avg_booking_value = transactions_query.aggregate(Avg('amount'))['amount__avg'] or 0
    
    # Revenue by day for chart
    revenue_by_day = {}
    if start_date:
        days = (timezone.now().date() - start_date.date()).days + 1
        for i in range(days):
            day = (timezone.now().date() - timedelta(days=i))
            revenue_by_day[day.strftime('%Y-%m-%d')] = 0
        
        for transaction in transactions_query:
            day = transaction.created_at.date().strftime('%Y-%m-%d')
            if day in revenue_by_day:
                revenue_by_day[day] += float(transaction.amount)
    
    # Format chart data
    chart_dates = sorted(revenue_by_day.keys())
    chart_revenue = [revenue_by_day[date] for date in chart_dates]
    
    # Top mentors by earnings
    top_mentors = MentorProfile.objects.annotate(
        total_earnings=Sum('sessions__bookings__transactions__amount', 
                           filter=Q(sessions__bookings__transactions__status='completed'))
    ).filter(total_earnings__gt=0).order_by('-total_earnings')[:5]
    
    # Popular session topics
    all_tags = {}
    for session in sessions_query:
        if session.tags:
            for tag in session.tags.split(','):
                tag = tag.strip()
                if tag:
                    all_tags[tag] = all_tags.get(tag, 0) + 1
    
    popular_tags = sorted(all_tags.items(), key=lambda x: x[1], reverse=True)[:10]
    
    context = {
        'period': period,
        'period_name': period_name,
        'total_revenue': total_revenue,
        'total_sessions': total_sessions,
        'total_new_users': total_new_users,
        'avg_session_price': avg_session_price,
        'avg_booking_value': avg_booking_value,
        'chart_dates': chart_dates,
        'chart_revenue': chart_revenue,
        'top_mentors': top_mentors,
        'popular_tags': popular_tags,
    }
    
    return render(request, 'admin_panel/analytics.html', context)
