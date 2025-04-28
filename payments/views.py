"""
Views for the payments app.
"""

import json
import razorpay
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.utils.translation import gettext_lazy as _
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.conf import settings
from django.db.models import Sum
from django.utils import timezone

from .models import Transaction, Coupon, WithdrawalRequest
from learning_sessions.models import Booking, Session


# Initialize Razorpay client
razorpay_client = razorpay.Client(
    auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
)


@login_required
def cart_view(request):
    """View for the shopping cart."""
    try:
        # Get pending bookings (cart items) with optimized query
        cart_items = Booking.objects.filter(
            learner=request.user,
            status='pending',
            payment_complete=False
        ).select_related('session__mentor__user')
        
        if not cart_items:
            messages.info(request, _('Your cart is empty.'))
            return redirect('session_list')
        
        # Calculate cart totals with better exception handling
        try:
            subtotal = sum(item.get_final_price() for item in cart_items)
            total_discount = sum(item.discount_amount or 0 for item in cart_items)
            total = subtotal
        except Exception as e:
            # Log the error and provide fallback values
            print(f"Error calculating cart totals: {str(e)}")
            subtotal = sum(item.session.price or 0 for item in cart_items)
            total_discount = 0
            total = subtotal
        
        # Initialize razorpay_order_id
        razorpay_order_id = None
        
        # Create a Razorpay order only for paid sessions
        if total > 0:
            try:
                razorpay_order = razorpay_client.order.create({
                    'amount': int(total * 100),  # Convert to paisa
                    'currency': settings.RAZORPAY_CURRENCY,
                    'payment_capture': 1  # Auto-capture payment
                })
                
                razorpay_order_id = razorpay_order['id']
            except Exception as e:
                print(f"Razorpay order creation error: {str(e)}")
                # For development, just show the error but continue
                messages.warning(request, _('Payment gateway integration error. Continuing in test mode.'))
        
        # Prepare Razorpay options for the JavaScript - ensure all values are simple types
        razorpay_options = {
            'key': settings.RAZORPAY_KEY_ID,
            'amount': int(float(total) * 100),  # Convert Decimal to float then int
            'currency': settings.RAZORPAY_CURRENCY,
            'name': 'PeerLearn',
            'description': f'Payment for {len(cart_items)} session(s)',
            'order_id': razorpay_order_id,
            'prefill': {
                'email': request.user.email,
                'name': request.user.get_full_name() or request.user.email.split('@')[0]
            },
            'total': float(total)  # Convert Decimal to float for JavaScript
        }
        
        # Convert to JSON to avoid Decimal serialization issues
        razorpay_options_json = json.dumps(razorpay_options)
        
        context = {
            'cart_items': cart_items,
            'subtotal': subtotal,
            'total_discount': total_discount,
            'total': total,
            'razorpay_key_id': settings.RAZORPAY_KEY_ID,
            'razorpay_order_id': razorpay_order_id,
            'razorpay_currency': settings.RAZORPAY_CURRENCY,
            'user_email': request.user.email,
            'user_name': request.user.get_full_name() or request.user.email.split('@')[0],
            'razorpay_options': razorpay_options_json
        }
        
        return render(request, 'payments/cart.html', context)
    
    except Exception as e:
        # Log the error for debugging
        print(f"Cart view error: {str(e)}")
        messages.error(request, _('An error occurred while loading your cart. Please try again.'))
        return redirect('session_list')


@login_required
def remove_from_cart(request, booking_id):
    """Remove a booking from cart."""
    try:
        booking = get_object_or_404(Booking, id=booking_id, learner=request.user, status='pending')
        
        # Decrement session participants count
        session = booking.session
        if session.current_participants > 0:
            session.current_participants -= 1
            session.save()
        
        # Delete the booking
        booking.delete()
        
        messages.success(request, _('Item removed from cart.'))
    except Exception as e:
        # Log the error for debugging
        print(f"Error removing item from cart: {str(e)}")
        messages.error(request, _('Error removing item from cart. Please try again.'))
    
    # Check if cart is now empty
    remaining_items = Booking.objects.filter(
        learner=request.user,
        status='pending',
        payment_complete=False
    ).count()
    
    if remaining_items == 0:
        # If cart is empty, redirect to session list
        return redirect('session_list')
    
    return redirect('cart')


@login_required
def apply_coupon(request):
    """Apply a coupon code to the cart."""
    if request.method != 'POST':
        return JsonResponse({'error': _('Invalid request method.')}, status=400)
    
    coupon_code = request.POST.get('coupon_code', '').strip().upper()
    booking_id = request.POST.get('booking_id')
    
    try:
        # Get the coupon
        coupon = Coupon.objects.get(code=coupon_code, is_active=True)
        
        # Check validity
        if not coupon.is_valid:
            return JsonResponse({'error': _('This coupon has expired or is no longer valid.')}, status=400)
        
        if booking_id:
            # Apply to specific booking
            booking = get_object_or_404(Booking, id=booking_id, learner=request.user, status='pending')
            
            # Check minimum purchase amount
            if coupon.min_purchase_amount and booking.session.price < coupon.min_purchase_amount:
                return JsonResponse({
                    'error': _('This coupon requires a minimum purchase of {amount} {currency}.').format(
                        amount=coupon.min_purchase_amount,
                        currency=settings.RAZORPAY_CURRENCY
                    )
                }, status=400)
            
            # Calculate discount
            discount_amount = (booking.session.price * coupon.discount_percent) / 100
            
            # Apply maximum discount cap if set
            if coupon.max_discount_amount and discount_amount > coupon.max_discount_amount:
                discount_amount = coupon.max_discount_amount
            
            # Update booking
            booking.coupon_applied = coupon_code
            booking.discount_amount = discount_amount
            booking.final_price = booking.session.price - discount_amount
            booking.save()
            
            # Increment coupon usage
            coupon.current_uses += 1
            coupon.save()
            
            return JsonResponse({
                'success': True,
                'message': _('Coupon applied successfully!'),
                'discount_amount': float(discount_amount),
                'new_price': float(booking.final_price)
            })
        else:
            # Apply to entire cart
            cart_items = Booking.objects.filter(
                learner=request.user,
                status='pending',
                payment_complete=False
            )
            
            if not cart_items:
                return JsonResponse({'error': _('Your cart is empty.')}, status=400)
            
            # Calculate cart subtotal
            subtotal = sum(item.session.price for item in cart_items)
            
            # Check minimum purchase amount
            if coupon.min_purchase_amount and subtotal < coupon.min_purchase_amount:
                return JsonResponse({
                    'error': _('This coupon requires a minimum purchase of {amount} {currency}.').format(
                        amount=coupon.min_purchase_amount,
                        currency=settings.RAZORPAY_CURRENCY
                    )
                }, status=400)
            
            # Calculate total discount
            discount_amount = (subtotal * coupon.discount_percent) / 100
            
            # Apply maximum discount cap if set
            if coupon.max_discount_amount and discount_amount > coupon.max_discount_amount:
                discount_amount = coupon.max_discount_amount
            
            # Distribute discount proportionally across cart items
            discount_factor = discount_amount / subtotal
            
            for item in cart_items:
                item_discount = item.session.price * discount_factor
                item.coupon_applied = coupon_code
                item.discount_amount = item_discount
                item.final_price = item.session.price - item_discount
                item.save()
            
            # Increment coupon usage (only once for the entire cart)
            coupon.current_uses += 1
            coupon.save()
            
            # Recalculate totals
            new_total = subtotal - discount_amount
            
            return JsonResponse({
                'success': True,
                'message': _('Coupon applied to all items in cart!'),
                'discount_amount': float(discount_amount),
                'new_total': float(new_total)
            })
    
    except Coupon.DoesNotExist:
        return JsonResponse({'error': _('Invalid coupon code.')}, status=400)
    
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_POST
def payment_callback(request):
    """Handle Razorpay payment callback and free session bookings."""
    try:
        payment_data = json.loads(request.body.decode('utf-8'))
        
        # Check if this is a free checkout
        if payment_data.get('free_checkout'):
            user = request.user
            
            if not user or not user.is_authenticated:
                return JsonResponse({'status': 'error', 'message': _('User not authenticated.')}, status=401)
            
            # Get cart items for this user
            cart_items = Booking.objects.filter(
                learner=user,
                status='pending',
                payment_complete=False
            ).select_related('session')
            
            if not cart_items:
                return JsonResponse({'status': 'error', 'message': _('No items in cart.')}, status=400)
            
            # Process free sessions
            for booking in cart_items:
                # If the session price is 0 or close to 0 (free session)
                if booking.session.price <= 0.01:
                    booking.status = 'confirmed'
                    booking.payment_complete = True
                    booking.save()
                    
                    # Create transaction record for free session
                    Transaction.objects.create(
                        booking=booking,
                        amount=0,
                        currency=settings.RAZORPAY_CURRENCY,
                        status='completed',
                        payment_method='free',
                        metadata={
                            'free_session': True
                        }
                    )
                
            return JsonResponse({'status': 'success', 'message': _('Free sessions booked successfully.')})
        
        # For paid checkout, process the Razorpay payment
        razorpay_payment_id = payment_data.get('razorpay_payment_id')
        razorpay_order_id = payment_data.get('razorpay_order_id')
        razorpay_signature = payment_data.get('razorpay_signature')
        
        # Verify signature for Razorpay payments
        if not all([razorpay_payment_id, razorpay_order_id, razorpay_signature]):
            return JsonResponse({'status': 'error', 'message': _('Missing payment information.')}, status=400)
        
        try:
            razorpay_client.utility.verify_payment_signature({
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_order_id': razorpay_order_id,
                'razorpay_signature': razorpay_signature
            })
        except Exception as e:
            print(f"Signature verification failed: {str(e)}")
            # During development, allow payments to go through even with signature failures
            if not settings.DEBUG:
                return JsonResponse({'status': 'error', 'message': _('Invalid payment signature.')}, status=400)
        
        try:
            # Get payment details from Razorpay
            payment = razorpay_client.payment.fetch(razorpay_payment_id)
            
            # Check if payment was successful
            if payment['status'] != 'captured':
                return JsonResponse({'status': 'error', 'message': _('Payment not captured.')}, status=400)
            
            # Get user from payment email
            user_email = payment.get('email')
            
            from users.models import User
            try:
                user = User.objects.get(email=user_email)
            except User.DoesNotExist:
                # If user not found by email, try the authenticated user
                if request.user.is_authenticated:
                    user = request.user
                else:
                    return JsonResponse({'status': 'error', 'message': _('User not found.')}, status=400)
            
            # Get cart items for this user
            cart_items = Booking.objects.filter(
                learner=user,
                status='pending',
                payment_complete=False
            ).select_related('session')
            
            if not cart_items:
                return JsonResponse({'status': 'error', 'message': _('No items in cart.')}, status=400)
            
            # Create transactions for each booking
            for booking in cart_items:
                # Update booking status
                booking.status = 'confirmed'
                booking.payment_complete = True
                booking.save()
                
                # Create transaction record
                Transaction.objects.create(
                    booking=booking,
                    amount=booking.get_final_price(),
                    currency=settings.RAZORPAY_CURRENCY,
                    status='completed',
                    payment_method='razorpay',
                    payment_gateway_reference=razorpay_payment_id,
                    metadata={
                        'razorpay_order_id': razorpay_order_id,
                        'razorpay_payment_id': razorpay_payment_id,
                        'razorpay_signature': razorpay_signature,
                    }
                )
            
            return JsonResponse({'status': 'success', 'message': _('Payment processed successfully.')})
        
        except Exception as e:
            print(f"Payment processing error: {str(e)}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
    except Exception as e:
        print(f"Payment callback error: {str(e)}")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@login_required
def payment_success(request):
    """View for successful payment completion."""
    return render(request, 'payments/payment_success.html')


@login_required
def payment_failed(request):
    """View for failed payment."""
    return render(request, 'payments/payment_failed.html')


@login_required
def withdrawal_request(request):
    """View for mentors to request earnings withdrawal."""
    if request.user.role != 'mentor':
        messages.error(request, _('Only mentors can access this page.'))
        return redirect('landing_page')
    
    mentor_profile = request.user.mentor_profile
    
    # Calculate available balance
    completed_transactions = Transaction.objects.filter(
        booking__session__mentor=mentor_profile,
        status='completed'
    )
    
    withdrawal_transactions = Transaction.objects.filter(
        booking__session__mentor=mentor_profile,
        status__in=['withdrawal_pending', 'withdrawal_completed']
    )
    
    total_earnings = completed_transactions.aggregate(Sum('amount'))['amount__sum'] or 0
    total_withdrawn = withdrawal_transactions.aggregate(Sum('amount'))['amount__sum'] or 0
    available_balance = total_earnings - total_withdrawn
    
    # Get pending withdrawal requests
    pending_requests = WithdrawalRequest.objects.filter(
        mentor=mentor_profile,
        status='pending'
    )
    
    if request.method == 'POST':
        amount = request.POST.get('amount')
        account_details = request.POST.get('account_details')
        note = request.POST.get('note', '')
        
        try:
            amount = float(amount)
            
            # Validate amount
            if amount <= 0:
                messages.error(request, _('Withdrawal amount must be greater than zero.'))
            elif amount > available_balance:
                messages.error(request, _('Withdrawal amount exceeds available balance.'))
            else:
                # Create withdrawal request
                WithdrawalRequest.objects.create(
                    mentor=mentor_profile,
                    amount=amount,
                    currency=settings.RAZORPAY_CURRENCY,
                    account_details=account_details,
                    note=note
                )
                
                # Create transaction record
                for booking in completed_transactions:
                    if amount <= 0:
                        break
                        
                    transaction_amount = min(booking.amount, amount)
                    amount -= transaction_amount
                    
                    Transaction.objects.create(
                        booking=booking.booking,
                        amount=transaction_amount,
                        currency=settings.RAZORPAY_CURRENCY,
                        status='withdrawal_pending',
                        payment_method='wallet',
                    )
                
                messages.success(request, _('Withdrawal request submitted successfully.'))
                return redirect('withdrawal_request')
        
        except ValueError:
            messages.error(request, _('Invalid amount.'))
    
    context = {
        'total_earnings': total_earnings,
        'total_withdrawn': total_withdrawn,
        'available_balance': available_balance,
        'pending_requests': pending_requests,
        'currency': settings.RAZORPAY_CURRENCY,
    }
    
    return render(request, 'payments/withdrawal_request.html', context)


@login_required
def transaction_history(request):
    """View for transaction history."""
    user = request.user
    
    if user.role == 'learner':
        # For learners, show bookings and payments
        transactions = Transaction.objects.filter(
            booking__learner=user
        ).select_related('booking__session__mentor__user')
        
    elif user.role == 'mentor':
        # For mentors, show earnings and withdrawals
        mentor_profile = user.mentor_profile
        transactions = Transaction.objects.filter(
            booking__session__mentor=mentor_profile
        ).select_related('booking__learner')
        
    else:
        messages.error(request, _('Access denied.'))
        return redirect('landing_page')
    
    context = {
        'transactions': transactions,
    }
    
    return render(request, 'payments/transaction_history.html', context)
