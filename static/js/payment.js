/**
 * Razorpay payment integration for PeerLearn
 */

// Payment handling with Razorpay
function initializeRazorpay(options) {
    console.log("Initializing Razorpay");
    
    var rzp = new Razorpay(options);
    
    rzp.on('payment.success', function(response) {
        // Handle successful payment
        handlePaymentSuccess(response);
    });
    
    rzp.on('payment.error', function(response) {
        // Handle payment failure
        handlePaymentError(response);
    });
    
    return rzp;
}

function handlePaymentSuccess(response) {
    console.log("Payment successful", response);
    
    // Create XHR for older browser compatibility instead of fetch
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/payments/payment-callback/', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (data.status === 'success') {
                        // Redirect to My Booked Sessions page
                        window.location.href = '/sessions/my-booked-sessions/';
                    } else {
                        // Show error message
                        alert('Payment verification failed: ' + data.message);
                        window.location.href = '/payments/payment-failed/';
                    }
                } catch (e) {
                    console.error('Error parsing JSON:', e);
                    alert('An error occurred during payment verification.');
                    window.location.href = '/payments/payment-failed/';
                }
            } else {
                console.error('Server error:', xhr.status);
                alert('An error occurred during payment verification.');
                window.location.href = '/payments/payment-failed/';
            }
        }
    };
    
    var payload = JSON.stringify({
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature
    });
    
    xhr.send(payload);
}

function handlePaymentError(response) {
    console.error("Payment failed", response);
    alert('Payment failed. Please try again.');
    window.location.href = '/payments/payment-failed/';
}

// Document ready
document.addEventListener('DOMContentLoaded', function() {
    console.log("Payment.js loaded");
    
    // Initialize checkout button
    var checkoutButton = document.getElementById('checkout-button');
    if (checkoutButton) {
        console.log("Checkout button found");
        
        checkoutButton.addEventListener('click', function() {
            console.log("Checkout button clicked");
            
            // Get razorpay options from the window object
            var options = window.razorpayOptions || {};
            console.log("Razorpay options:", options);
            
            if (options.order_id) {
                console.log("Starting Razorpay checkout with order ID:", options.order_id);
                var rzp = initializeRazorpay(options);
                rzp.open();
            } else if (options.total === 0 || options.total === '0' || options.total === '0.00') {
                console.log("Free checkout initiated");
                // Handle free sessions
                handleFreeCheckout();
            } else {
                console.error("Razorpay options not properly initialized", options);
                alert("Payment system error. Please try again later.");
            }
        });
    } else {
        console.error("Checkout button not found");
    }
    
    // Handle free checkout
    function handleFreeCheckout() {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/payments/payment-callback/', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        if (data.status === 'success') {
                            window.location.href = '/sessions/my-booked-sessions/';
                        } else {
                            alert('Error: ' + data.message);
                        }
                    } catch (e) {
                        console.error('Error parsing JSON:', e);
                        alert('An error occurred during checkout.');
                    }
                } else {
                    console.error('Server error:', xhr.status);
                    alert('An error occurred during checkout.');
                }
            }
        };
        
        var payload = JSON.stringify({
            free_checkout: true
        });
        
        xhr.send(payload);
    }
});