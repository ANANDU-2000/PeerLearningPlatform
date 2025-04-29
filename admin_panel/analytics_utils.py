"""
Advanced analytics utilities for the admin panel.
These functions use numpy and pandas for more sophisticated
data analysis and predictions.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from django.utils import timezone
from django.db.models import Sum, Avg, Count, F, Q

from users.models import User, MentorProfile, LearnerProfile
from learning_sessions.models import Session, Booking, Feedback
from payments.models import Transaction, WithdrawalRequest


def get_revenue_forecast(days=30, prediction_days=30):
    """
    Generate revenue forecast using time series analysis.
    
    Args:
        days: Number of past days to use for prediction
        prediction_days: Number of days to forecast
    
    Returns:
        Dictionary with forecast dates and values
    """
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=days)
    
    # Fetch daily revenue data
    transactions = Transaction.objects.filter(
        status='completed',
        created_at__date__gte=start_date,
        created_at__date__lte=end_date
    ).values('created_at__date').annotate(
        daily_revenue=Sum('amount')
    ).order_by('created_at__date')
    
    # Convert to pandas DataFrame
    df = pd.DataFrame(list(transactions))
    
    # If no data, return empty forecast
    if df.empty:
        # Generate empty forecast
        forecast_dates = [(end_date + timedelta(days=i+1)).strftime('%Y-%m-%d') 
                        for i in range(prediction_days)]
        return {
            'dates': forecast_dates,
            'values': [0] * prediction_days,
            'lower_bound': [0] * prediction_days,
            'upper_bound': [0] * prediction_days
        }
    
    # Ensure we have data for every day by filling in missing dates with zeros
    date_range = pd.date_range(start=start_date, end=end_date)
    
    # Create complete DataFrame with all dates
    complete_df = pd.DataFrame({'created_at__date': date_range})
    
    # Merge with actual data, filling missing values with 0
    if 'created_at__date' in df.columns and 'daily_revenue' in df.columns:
        df_merged = pd.merge(
            complete_df, 
            df, 
            on='created_at__date', 
            how='left'
        ).fillna(0)
    else:
        # Handle case where columns don't exist
        df_merged = complete_df
        df_merged['daily_revenue'] = 0
    
    # Get revenue values for calculation
    values = df_merged['daily_revenue'].values
    
    # Simple forecasting approach: moving average with trend extrapolation
    window_size = min(7, len(values))  # Use 7-day window or less if not enough data
    
    # Calculate moving average
    if len(values) >= window_size:
        moving_avg = np.convolve(values, np.ones(window_size)/window_size, mode='valid')
        
        # Calculate average trend over the last window_size days
        if len(moving_avg) >= 2:
            trend = (moving_avg[-1] - moving_avg[0]) / (len(moving_avg) - 1)
        else:
            trend = 0
    else:
        # Not enough data for a moving average
        moving_avg = [np.mean(values)] if len(values) > 0 else [0]
        trend = 0
    
    # Last value in the moving average
    last_avg = moving_avg[-1] if len(moving_avg) > 0 else (np.mean(values) if len(values) > 0 else 0)
    
    # Generate forecast
    forecast = [max(0, last_avg + (i * trend)) for i in range(1, prediction_days + 1)]
    
    # Add error bounds - increase uncertainty over time
    uncertainty_factor = 0.1  # 10% initial uncertainty
    lower_bound = []
    upper_bound = []
    
    for i, value in enumerate(forecast):
        # Increase uncertainty for further predictions
        day_uncertainty = uncertainty_factor * (1 + (i / prediction_days))
        bound = value * day_uncertainty
        lower_bound.append(max(0, value - bound))
        upper_bound.append(value + bound)
    
    # Generate dates for the forecast period
    forecast_dates = [(end_date + timedelta(days=i+1)).strftime('%Y-%m-%d') 
                     for i in range(prediction_days)]
    
    return {
        'dates': forecast_dates,
        'values': forecast,
        'lower_bound': lower_bound,
        'upper_bound': upper_bound
    }


def get_learner_engagement_stats(days=30):
    """
    Calculate learner engagement metrics.
    
    Args:
        days: Number of days to analyze
    
    Returns:
        Dictionary with engagement metrics
    """
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=days)
    
    # Get total learners
    total_learners = User.objects.filter(role='learner').count()
    
    # Get active learners (booked at least one session in the period)
    active_learners = User.objects.filter(
        role='learner',
        learnerprofile__bookings__created_at__date__gte=start_date
    ).distinct().count()
    
    # Repeat bookers (booked more than one session)
    repeat_learners = User.objects.filter(
        role='learner',
        learnerprofile__bookings__created_at__date__gte=start_date
    ).annotate(
        booking_count=Count('learnerprofile__bookings')
    ).filter(booking_count__gt=1).count()
    
    # Feedback submission rate
    bookings_with_feedback = Booking.objects.filter(
        created_at__date__gte=start_date,
        feedback__isnull=False
    ).count()
    
    total_bookings = Booking.objects.filter(
        created_at__date__gte=start_date
    ).count()
    
    feedback_rate = (bookings_with_feedback / total_bookings * 100) if total_bookings > 0 else 0
    
    # Booking completion rate
    completed_bookings = Booking.objects.filter(
        created_at__date__gte=start_date,
        status='completed'
    ).count()
    
    completion_rate = (completed_bookings / total_bookings * 100) if total_bookings > 0 else 0
    
    # Average time spent
    avg_session_minutes = Booking.objects.filter(
        created_at__date__gte=start_date,
        status='completed',
        session__isnull=False
    ).aggregate(
        avg_duration=Avg(F('session__end_time') - F('session__start_time'))
    )['avg_duration']
    
    avg_minutes = 0
    if avg_session_minutes:
        avg_minutes = avg_session_minutes.total_seconds() / 60
    
    # Engagement percentage
    engagement_rate = (active_learners / total_learners * 100) if total_learners > 0 else 0
    
    return {
        'total_learners': total_learners,
        'active_learners': active_learners,
        'engagement_rate': engagement_rate,
        'repeat_learners': repeat_learners,
        'repeat_booking_rate': (repeat_learners / active_learners * 100) if active_learners > 0 else 0,
        'feedback_rate': feedback_rate,
        'completion_rate': completion_rate,
        'avg_session_minutes': avg_minutes
    }


def get_session_quality_metrics(days=30):
    """
    Analyze session quality metrics.
    
    Args:
        days: Number of days to analyze
    
    Returns:
        Dictionary with quality metrics
    """
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days)
    
    # Get feedback ratings
    feedback_data = Feedback.objects.filter(
        created_at__gte=start_date
    ).aggregate(
        avg_rating=Avg('rating'),
        count=Count('id')
    )
    
    avg_rating = feedback_data['avg_rating'] or 0
    feedback_count = feedback_data['count'] or 0
    
    # Get ratings distribution
    ratings_distribution = []
    for rating in range(1, 6):  # 1 to 5 stars
        count = Feedback.objects.filter(
            created_at__gte=start_date,
            rating=rating
        ).count()
        ratings_distribution.append({
            'rating': rating,
            'count': count,
            'percentage': (count / feedback_count * 100) if feedback_count > 0 else 0
        })
    
    # Most common feedback themes (using keywords in comments)
    positive_keywords = ['excellent', 'great', 'amazing', 'helpful', 'clear', 'knowledgeable']
    negative_keywords = ['poor', 'bad', 'unclear', 'confusing', 'disappointed', 'waste']
    
    keyword_counts = {keyword: 0 for keyword in positive_keywords + negative_keywords}
    
    # Count occurrences of each keyword in feedback comments
    all_feedback = Feedback.objects.filter(created_at__gte=start_date)
    for feedback in all_feedback:
        if feedback.comments:
            lower_comments = feedback.comments.lower()
            for keyword in keyword_counts:
                if keyword in lower_comments:
                    keyword_counts[keyword] += 1
    
    # Organize into positive and negative themes
    feedback_themes = {
        'positive': {k: keyword_counts[k] for k in positive_keywords},
        'negative': {k: keyword_counts[k] for k in negative_keywords}
    }
    
    # Session durations
    session_durations = Session.objects.filter(
        created_at__gte=start_date,
        end_time__isnull=False
    ).annotate(
        duration=F('end_time') - F('start_time')
    )
    
    # Convert to minutes for easier analysis
    durations_minutes = []
    for session in session_durations:
        if session.duration:
            minutes = session.duration.total_seconds() / 60
            durations_minutes.append(minutes)
    
    # Calculate duration statistics
    duration_stats = {}
    if durations_minutes:
        duration_stats = {
            'min': np.min(durations_minutes),
            'max': np.max(durations_minutes),
            'mean': np.mean(durations_minutes),
            'median': np.median(durations_minutes),
            'p25': np.percentile(durations_minutes, 25),
            'p75': np.percentile(durations_minutes, 75)
        }
    else:
        duration_stats = {
            'min': 0, 'max': 0, 'mean': 0, 'median': 0, 'p25': 0, 'p75': 0
        }
    
    return {
        'avg_rating': avg_rating,
        'feedback_count': feedback_count,
        'ratings_distribution': ratings_distribution,
        'feedback_themes': feedback_themes,
        'duration_stats': duration_stats
    }


def get_mentor_performance_metrics(days=30):
    """
    Calculate mentor performance metrics.
    
    Args:
        days: Number of days to analyze
    
    Returns:
        Dictionary with performance metrics
    """
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=days)
    
    # Get active mentors in the period
    active_mentors = MentorProfile.objects.filter(
        sessions__start_time__date__gte=start_date
    ).distinct()
    
    # Get total number of mentors
    total_mentors = MentorProfile.objects.count()
    
    # Calculate session counts per mentor
    mentor_sessions = []
    
    for mentor in active_mentors:
        sessions_count = Session.objects.filter(
            mentor=mentor,
            start_time__date__gte=start_date
        ).count()
        
        bookings_count = Booking.objects.filter(
            session__mentor=mentor,
            created_at__date__gte=start_date
        ).count()
        
        # Calculate booking rate (bookings / sessions)
        booking_rate = (bookings_count / sessions_count * 100) if sessions_count > 0 else 0
        
        # Get average rating
        avg_rating = Feedback.objects.filter(
            booking__session__mentor=mentor,
            created_at__date__gte=start_date
        ).aggregate(avg=Avg('rating'))['avg'] or 0
        
        # Calculate earnings
        earnings = Transaction.objects.filter(
            booking__session__mentor=mentor,
            status='completed',
            created_at__date__gte=start_date
        ).aggregate(total=Sum('amount'))['total'] or 0
        
        mentor_sessions.append({
            'mentor_id': mentor.id,
            'mentor_name': f"{mentor.user.first_name} {mentor.user.last_name}",
            'sessions_count': sessions_count,
            'bookings_count': bookings_count,
            'booking_rate': booking_rate,
            'avg_rating': avg_rating,
            'earnings': earnings
        })
    
    # Sort by earnings (highest first)
    mentor_sessions.sort(key=lambda x: x['earnings'], reverse=True)
    
    # Number of mentors with no activity
    inactive_mentors = total_mentors - len(active_mentors)
    
    # Calculate average metrics across all mentors
    total_sessions = sum(mentor['sessions_count'] for mentor in mentor_sessions)
    total_bookings = sum(mentor['bookings_count'] for mentor in mentor_sessions)
    
    # Average booking rate across active mentors
    if mentor_sessions:
        avg_booking_rate = sum(mentor['booking_rate'] for mentor in mentor_sessions) / len(mentor_sessions)
    else:
        avg_booking_rate = 0
    
    # Calculate average metrics
    avg_sessions_per_mentor = total_sessions / len(active_mentors) if len(active_mentors) > 0 else 0
    
    return {
        'total_mentors': total_mentors,
        'active_mentors': len(active_mentors),
        'inactive_mentors': inactive_mentors,
        'mentor_activation_rate': (len(active_mentors) / total_mentors * 100) if total_mentors > 0 else 0,
        'avg_sessions_per_mentor': avg_sessions_per_mentor,
        'avg_booking_rate': avg_booking_rate,
        'mentor_performance': mentor_sessions[:10]  # Top 10 mentors
    }