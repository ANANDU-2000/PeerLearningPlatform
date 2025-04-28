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
    
    # Security management
    path('security/', views.security_management, name='security_management'),
    path('security/generate-key/', views.generate_access_key, name='generate_access_key'),
    path('security/keys/<int:key_id>/activate/', views.activate_access_key, name='activate_access_key'),
    path('security/keys/<int:key_id>/deactivate/', views.deactivate_access_key, name='deactivate_access_key'),
    path('security/keys/<int:key_id>/delete/', views.delete_access_key, name='delete_access_key'),
    path('security/ip/add/', views.add_allowed_ip, name='add_allowed_ip'),
    path('security/ip/<int:ip_id>/activate/', views.activate_allowed_ip, name='activate_allowed_ip'),
    path('security/ip/<int:ip_id>/deactivate/', views.deactivate_allowed_ip, name='deactivate_allowed_ip'),
    path('security/ip/<int:ip_id>/delete/', views.delete_allowed_ip, name='delete_allowed_ip'),
]
