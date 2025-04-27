"""
URL patterns for the sessions app.
"""

from django.urls import path

from . import views

urlpatterns = [
    # Session browsing
    path('', views.session_list, name='session_list'),
    path('<int:session_id>/', views.session_detail, name='session_detail'),
    
    # Session management (for mentors)
    path('create/', views.create_session, name='create_session'),
    path('<int:session_id>/edit/', views.edit_session, name='edit_session'),
    path('<int:session_id>/cancel/', views.cancel_session, name='cancel_session'),
    
    # Booking and attendance
    path('<int:session_id>/book/', views.book_session, name='book_session'),
    path('<int:session_id>/room/', views.session_room, name='session_room'),
    
    # Feedback
    path('feedback/<int:booking_id>/', views.submit_feedback, name='submit_feedback'),
]
