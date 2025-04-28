/**
 * Razorpay payment integration for PeerLearn
 */

// Payment handling with Razorpay
function initializeRazorpay(options) {
    console.log("Initializing Razorpay");
    
    const rzp = new Razorpay(options);
    
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
    
    // Send payment verification to backend
    fetch('/payments/payment-callback/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // Redirect to success page
            window.location.href = '/payments/payment-success/';
        } else {
            // Show error message
            alert('Payment verification failed: ' + data.message);
            window.location.href = '/payments/payment-failed/';
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred during payment verification.');
        window.location.href = '/payments/payment-failed/';
    });
}

function handlePaymentError(response) {
    console.error("Payment failed", response);
    alert('Payment failed. Please try again.');
    window.location.href = '/payments/payment-failed/';
}

// Document ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize checkout button
    const checkoutButton = document.getElementById('checkout-button');
    if (checkoutButton) {
        checkoutButton.addEventListener('click', function() {
            const options = window.razorpayOptions || {};
            
            if (options.order_id) {
                const rzp = initializeRazorpay(options);
                rzp.open();
            } else if (options.total === 0) {
                // Handle free sessions
                handleFreeCheckout();
            } else {
                console.error("Razorpay options not properly initialized");
                alert("Payment system error. Please try again later.");
            }
        });
    }
    
    // Handle free checkout
    function handleFreeCheckout() {
        fetch('/payments/payment-callback/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                free_checkout: true
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                window.location.href = '/payments/payment-success/';
            } else {
                alert('Error: ' + data.message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred during checkout.');
        });
    }
});