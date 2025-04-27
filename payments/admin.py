"""
Admin configuration for payments app.
"""

from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .models import Transaction, Coupon, WithdrawalRequest


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    """Admin interface for Transaction model."""
    list_display = ('reference_id', 'booking', 'amount', 'status', 'payment_method', 'created_at')
    list_filter = ('status', 'payment_method', 'created_at')
    search_fields = ('reference_id', 'booking__learner__email', 'booking__session__title')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    """Admin interface for Coupon model."""
    list_display = ('code', 'discount_percent', 'is_active', 'expiry_date')
    list_filter = ('is_active', 'expiry_date')
    search_fields = ('code', 'description')


@admin.register(WithdrawalRequest)
class WithdrawalRequestAdmin(admin.ModelAdmin):
    """Admin interface for WithdrawalRequest model."""
    list_display = ('mentor', 'amount', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('mentor__user__email', 'account_details')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
    
    actions = ['approve_withdrawals', 'reject_withdrawals']
    
    def approve_withdrawals(self, request, queryset):
        """Approve selected withdrawal requests."""
        updated = queryset.filter(status='pending').update(status='completed')
        self.message_user(request, _(f'{updated} withdrawal requests were successfully approved.'))
    approve_withdrawals.short_description = _("Approve selected withdrawal requests")
    
    def reject_withdrawals(self, request, queryset):
        """Reject selected withdrawal requests."""
        updated = queryset.filter(status='pending').update(status='rejected')
        self.message_user(request, _(f'{updated} withdrawal requests were successfully rejected.'))
    reject_withdrawals.short_description = _("Reject selected withdrawal requests")
