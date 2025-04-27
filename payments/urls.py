"""
URL patterns for the payments app.
"""

from django.urls import path

from . import views

urlpatterns = [
    # Cart and checkout
    path('cart/', views.cart_view, name='cart'),
    path('cart/remove/<int:booking_id>/', views.remove_from_cart, name='remove_from_cart'),
    path('cart/apply-coupon/', views.apply_coupon, name='apply_coupon'),
    
    # Payment processing
    path('payment-callback/', views.payment_callback, name='payment_callback'),
    path('payment-success/', views.payment_success, name='payment_success'),
    path('payment-failed/', views.payment_failed, name='payment_failed'),
    
    # Withdrawals and history
    path('withdrawal-request/', views.withdrawal_request, name='withdrawal_request'),
    path('transaction-history/', views.transaction_history, name='transaction_history'),
]
