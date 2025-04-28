"""
URL patterns for the admin panel.
"""

from django.urls import path

from . import views

urlpatterns = [
    # Secure admin access URLs
    path('secure-login/', views.secure_admin_login, name='secure_admin_login'),
    path('secure-logout/', views.secure_admin_logout, name='secure_admin_logout'),
    
    # Admin dashboard and features
    path('', views.admin_dashboard, name='admin_dashboard'),
    path('mentor-approval/', views.mentor_approval, name='mentor_approval'),
    path('mentor-approval/<int:mentor_id>/approve/', views.approve_mentor, name='approve_mentor'),
    path('mentor-approval/<int:mentor_id>/reject/', views.reject_mentor, name='reject_mentor'),
    path('sessions/', views.session_management, name='session_management'),
    path('users/', views.user_management, name='user_management'),
    path('payments/', views.payment_management, name='payment_management'),
    path('analytics/', views.analytics, name='analytics'),
    path('video-storage/', views.video_storage, name='video_storage'),
]
