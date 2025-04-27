"""
URL patterns for the users app.
"""

from django.urls import path
from django.contrib.auth import views as auth_views

from . import views

urlpatterns = [
    # Authentication
    path('login/', views.login_view, name='login'),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),
    path('verify-2fa/', views.verify_2fa_view, name='verify_2fa'),
    
    # Registration
    path('register/learner/', views.register_view, {'role': 'learner'}, name='register_learner'),
    path('register/mentor/', views.register_view, {'role': 'mentor'}, name='register_mentor'),
    
    # Password reset
    path('password-reset/', 
         auth_views.PasswordResetView.as_view(template_name='registration/password_reset_form.html'), 
         name='password_reset'),
    path('password-reset/done/', 
         auth_views.PasswordResetDoneView.as_view(template_name='registration/password_reset_done.html'), 
         name='password_reset_done'),
    path('password-reset/<uidb64>/<token>/', 
         auth_views.PasswordResetConfirmView.as_view(template_name='registration/password_reset_confirm.html'), 
         name='password_reset_confirm'),
    path('password-reset/complete/', 
         auth_views.PasswordResetCompleteView.as_view(template_name='registration/password_reset_complete.html'), 
         name='password_reset_complete'),
    
    # Dashboards
    path('dashboard/learner/', views.learner_dashboard, name='learner_dashboard'),
    path('dashboard/mentor/', views.mentor_dashboard, name='mentor_dashboard'),
    
    # Profile and settings
    path('profile/settings/', views.profile_settings_view, name='profile_settings'),
    
    # Booking management for mentors
    path('booking/<int:booking_id>/<str:action>/', views.accept_reject_booking, name='booking_action'),
]
