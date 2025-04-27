"""
ML-powered session recommendation system.

This module provides recommendation algorithms for suggesting relevant sessions
to learners based on their interests, past sessions, and behavioral patterns.
"""

import numpy as np
from django.db.models import Q
from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import Session, Booking, Feedback
from users.models import LearnerProfile

User = get_user_model()


def get_content_based_recommendations(user, limit=5):
    """
    Generate content-based recommendations for a user.
    
    Analyzes the user's past bookings, interests, and profile data to suggest
    similar sessions they might be interested in.
    
    Args:
        user: The User object to generate recommendations for
        limit: Maximum number of recommendations to return
        
    Returns:
        QuerySet of recommended Session objects
    """
    # Get user's past bookings
    past_bookings = Booking.objects.filter(
        learner=user,
        status__in=['confirmed', 'completed']
    ).select_related('session')
    
    # If user has no past bookings, fall back to their interests
    if not past_bookings.exists():
        try:
            # Get learner profile and interests
            learner_profile = LearnerProfile.objects.get(user=user)
            interests = learner_profile.interests or ""
            
            # Find sessions that match the user's interests
            interest_keywords = [kw.strip() for kw in interests.split(',') if kw.strip()]
            
            if interest_keywords:
                # Build a query that checks if any interest keyword is in the session tags or title
                query = Q()
                for keyword in interest_keywords:
                    query |= Q(tags__icontains=keyword) | Q(title__icontains=keyword)
                    
                # Filter upcoming sessions with approved mentors
                recommendations = Session.objects.filter(
                    query,
                    status='scheduled',
                    start_time__gt=timezone.now(),
                    mentor__is_approved=True
                ).exclude(
                    # Exclude sessions the user has already booked
                    id__in=Booking.objects.filter(learner=user).values_list('session_id', flat=True)
                ).order_by('start_time')[:limit]
                
                return recommendations
        except LearnerProfile.DoesNotExist:
            pass
    
    # If user has past bookings, recommend similar sessions
    else:
        # Extract tags from past sessions
        tags_list = []
        for booking in past_bookings:
            if booking.session.tags:
                tags_list.extend([tag.strip() for tag in booking.session.tags.split(',')])
        
        # Count tag frequencies
        tag_counts = {}
        for tag in tags_list:
            if tag:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        
        # If we have tags, find sessions with similar tags
        if tag_counts:
            # Sort tags by frequency (most frequent first)
            sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)
            top_tags = [tag for tag, count in sorted_tags[:5]]  # Use top 5 tags
            
            # Build query for sessions with top tags
            query = Q()
            for tag in top_tags:
                query |= Q(tags__icontains=tag)
            
            # Filter upcoming sessions with the top tags
            recommendations = Session.objects.filter(
                query,
                status='scheduled',
                start_time__gt=timezone.now(),
                mentor__is_approved=True
            ).exclude(
                # Exclude sessions the user has already booked
                id__in=Booking.objects.filter(learner=user).values_list('session_id', flat=True)
            ).order_by('start_time')[:limit]
            
            return recommendations
    
    # Fallback to popular sessions if no recommendations were generated
    return get_popular_sessions(limit)


def get_collaborative_filtering_recommendations(user, limit=5):
    """
    Generate collaborative filtering recommendations for a user.
    
    Finds users with similar session booking patterns and recommends sessions
    that those similar users have booked but the current user hasn't.
    
    Args:
        user: The User object to generate recommendations for
        limit: Maximum number of recommendations to return
        
    Returns:
        QuerySet of recommended Session objects
    """
    # Get sessions booked by the current user
    user_sessions = Booking.objects.filter(
        learner=user,
        status__in=['confirmed', 'completed']
    ).values_list('session_id', flat=True)
    
    # If user has no bookings, fall back to content-based recommendations
    if not user_sessions:
        return get_content_based_recommendations(user, limit)
    
    # Find other users who booked at least one of the same sessions
    similar_users = User.objects.filter(
        bookings__session_id__in=user_sessions,
        bookings__status__in=['confirmed', 'completed']
    ).exclude(id=user.id).distinct()
    
    # If no similar users found, fall back to content-based recommendations
    if not similar_users.exists():
        return get_content_based_recommendations(user, limit)
    
    # Get sessions booked by similar users that the current user hasn't booked
    recommendations = Session.objects.filter(
        bookings__learner__in=similar_users,
        bookings__status__in=['confirmed', 'completed'],
        status='scheduled',
        start_time__gt=timezone.now(),
        mentor__is_approved=True
    ).exclude(
        id__in=user_sessions
    ).distinct().order_by('start_time')[:limit]
    
    # If we couldn't find enough recommendations, supplement with content-based
    if recommendations.count() < limit:
        content_recommendations = get_content_based_recommendations(
            user, limit - recommendations.count()
        )
        
        # Combine the recommendations (avoiding duplicates)
        recommendation_ids = set(recommendations.values_list('id', flat=True))
        additional_recommendations = [
            r for r in content_recommendations 
            if r.id not in recommendation_ids
        ][:limit - recommendations.count()]
        
        # Convert recommendations to list and extend
        recommendations = list(recommendations)
        recommendations.extend(additional_recommendations)
    
    return recommendations


def get_popular_sessions(limit=5):
    """
    Get the most popular upcoming sessions based on booking counts.
    
    Args:
        limit: Maximum number of sessions to return
        
    Returns:
        QuerySet of popular Session objects
    """
    # Get upcoming scheduled sessions with approved mentors
    upcoming_sessions = Session.objects.filter(
        status='scheduled',
        start_time__gt=timezone.now(),
        mentor__is_approved=True
    )
    
    # Annotate with booking count and order by popularity
    popular_sessions = upcoming_sessions.filter(
        bookings__status__in=['confirmed', 'completed']
    ).distinct().order_by('-current_participants', 'start_time')[:limit]
    
    # If we don't have enough popular sessions, add some recent ones
    if popular_sessions.count() < limit:
        # Get additional sessions, sorted by recently created
        additional_sessions = upcoming_sessions.exclude(
            id__in=popular_sessions.values_list('id', flat=True)
        ).order_by('-created_at')[:limit - popular_sessions.count()]
        
        # Convert popular_sessions to a list and extend it
        popular_sessions = list(popular_sessions)
        popular_sessions.extend(additional_sessions)
    
    return popular_sessions


def get_personalized_recommendations(user, limit=10):
    """
    Generate personalized session recommendations for a user.
    
    This is the main recommendation function that combines multiple recommendation
    approaches to provide the best suggestions for a user.
    
    Args:
        user: The User object to generate recommendations for
        limit: Maximum number of recommendations to return
        
    Returns:
        List of recommended Session objects
    """
    if not user.is_authenticated or user.role != 'learner':
        # For anonymous users or non-learners, just return popular sessions
        return get_popular_sessions(limit)
    
    # Allocate recommendations from different sources
    collaborative_count = limit // 2
    content_count = limit - collaborative_count
    
    # Get collaborative filtering recommendations
    collaborative_recommendations = get_collaborative_filtering_recommendations(user, collaborative_count)
    
    # Get content-based recommendations
    content_recommendations = get_content_based_recommendations(user, content_count)
    
    # Combine the recommendations (avoiding duplicates)
    recommendation_ids = set()
    final_recommendations = []
    
    # First add collaborative recommendations
    for session in collaborative_recommendations:
        if session.id not in recommendation_ids:
            recommendation_ids.add(session.id)
            final_recommendations.append(session)
    
    # Then add content-based recommendations
    for session in content_recommendations:
        if session.id not in recommendation_ids and len(final_recommendations) < limit:
            recommendation_ids.add(session.id)
            final_recommendations.append(session)
    
    # If we still don't have enough, add popular sessions
    if len(final_recommendations) < limit:
        popular_sessions = get_popular_sessions(limit - len(final_recommendations))
        for session in popular_sessions:
            if session.id not in recommendation_ids and len(final_recommendations) < limit:
                recommendation_ids.add(session.id)
                final_recommendations.append(session)
    
    return final_recommendations