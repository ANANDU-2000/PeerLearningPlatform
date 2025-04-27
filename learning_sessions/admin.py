"""
Admin configuration for sessions app.
"""

from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .models import Session, Booking, Feedback


@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    """Admin interface for Session model."""
    list_display = ('title', 'mentor', 'start_time', 'end_time', 'price', 'status')
    list_filter = ('status', 'start_time')
    search_fields = ('title', 'description', 'mentor__user__email')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'start_time'


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    """Admin interface for Booking model."""
    list_display = ('session', 'learner', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('session__title', 'learner__email')
    readonly_fields = ('created_at',)


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    """Admin interface for Feedback model."""
    list_display = ('booking', 'rating', 'created_at')
    list_filter = ('rating', 'created_at')
    search_fields = ('booking__session__title', 'booking__learner__email', 'comments')
    readonly_fields = ('created_at',)
