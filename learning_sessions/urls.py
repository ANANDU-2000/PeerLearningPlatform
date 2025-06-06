"""
URL patterns for the sessions app.
"""

from django.urls import path

from . import views
from . import test_views

urlpatterns = [
    # Session browsing
    path('', views.session_list, name='session_list'),
    path('<int:session_id>/', views.session_detail, name='session_detail'),
    
    # Session management (for mentors)
    path('mentor/', views.mentor_sessions, name='mentor_sessions'),
    path('create/', views.create_session, name='create_session'),
    path('<int:session_id>/edit/', views.edit_session, name='edit_session'),
    path('<int:session_id>/cancel/', views.cancel_session, name='cancel_session'),
    
    # Booking and attendance
    path('<int:session_id>/book/', views.book_session, name='book_session'),
    path('<int:session_id>/room/', views.session_room, name='session_room'),
    path('<int:session_id>/room-enhanced/', views.session_room_enhanced, name='session_room_enhanced'),
    
    # Feedback
    path('feedback/<int:booking_id>/', views.submit_feedback, name='submit_feedback'),
    
    # Learner session management
    path('my-booked-sessions/', views.my_booked_sessions, name='my_booked_sessions'),
    
    # Testing pages
    path('test/mobile-compatibility/', test_views.mobile_compatibility_test, name='mobile_compatibility_test'),
    path('test/webrtc/', views.webrtc_test_page, name='webrtc_test_page'),
    path('test/webrtc/live/<int:session_id>/', views.webrtc_live_test, name='webrtc_live_test'),
]
