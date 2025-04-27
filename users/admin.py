"""
Admin configuration for users app.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.translation import gettext_lazy as _

from .models import User, LearnerProfile, MentorProfile

class CustomUserAdmin(UserAdmin):
    """Custom User Admin to handle custom user model."""
    list_display = ('email', 'full_name', 'role', 'is_active', 'date_joined')
    search_fields = ('email', 'first_name', 'last_name')
    readonly_fields = ('date_joined', 'last_login')
    ordering = ('-date_joined',)
    list_filter = ('role', 'is_active', 'is_staff')
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        (_('Personal info'), {'fields': ('first_name', 'last_name', 'profile_picture')}),
        (_('Role'), {'fields': ('role',)}),
        (_('Permissions'), {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
        }),
        (_('Important dates'), {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2', 'role'),
        }),
    )

admin.site.register(User, CustomUserAdmin)

@admin.register(LearnerProfile)
class LearnerProfileAdmin(admin.ModelAdmin):
    """Admin for LearnerProfile model."""
    list_display = ('user', 'career_goals')
    search_fields = ('user__email', 'career_goals')
    
@admin.register(MentorProfile)
class MentorProfileAdmin(admin.ModelAdmin):
    """Admin for MentorProfile model."""
    list_display = ('user', 'expertise', 'is_approved', 'hourly_rate')
    list_filter = ('is_approved', 'expertise')
    search_fields = ('user__email', 'expertise', 'bio')
    actions = ['approve_mentors']
    
    def approve_mentors(self, request, queryset):
        """Approve selected mentors."""
        updated = queryset.update(is_approved=True)
        self.message_user(request, _(f'{updated} mentors were successfully approved.'))
    approve_mentors.short_description = _("Approve selected mentors")
