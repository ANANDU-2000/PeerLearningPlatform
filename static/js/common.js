/**
 * PeerLearn Common JavaScript Functionality
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the welcome message popup
    initWelcomeMessage();
    
    // Initialize dropdown menus
    initDropdowns();
    
    // Initialize mobile navigation
    initMobileNavigation();
});

/**
 * Initialize welcome message functionality
 */
function initWelcomeMessage() {
    const welcomeMsg = document.querySelector('.welcome-message');
    const closeBtn = welcomeMsg?.querySelector('.close-btn');
    
    // Only proceed if welcome message exists
    if (!welcomeMsg) return;
    
    // Check if user has dismissed the message before
    const welcomeDismissed = localStorage.getItem('welcome_dismissed');
    
    // Only show if not dismissed
    if (!welcomeDismissed) {
        // Wait a moment before showing the message
        setTimeout(() => {
            welcomeMsg.classList.remove('hidden');
        }, 1500);
    }
    
    // Handle close button click
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            hideWelcomeMessage(welcomeMsg);
            // Remember that user dismissed the message
            localStorage.setItem('welcome_dismissed', 'true');
        });
    }
}

/**
 * Hide welcome message with animation
 */
function hideWelcomeMessage(welcomeMsg) {
    welcomeMsg.style.opacity = '0';
    setTimeout(() => {
        welcomeMsg.classList.add('hidden');
        welcomeMsg.style.opacity = '1';
    }, 300);
}

/**
 * Initialize dropdown menus with proper accessibility
 */
function initDropdowns() {
    const dropdownToggles = document.querySelectorAll('.dropdown button');
    
    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            
            const content = this.nextElementSibling;
            const isExpanded = this.getAttribute('aria-expanded') === 'true';
            
            // Close all other dropdowns first
            dropdownToggles.forEach(otherToggle => {
                if (otherToggle !== toggle) {
                    otherToggle.setAttribute('aria-expanded', 'false');
                    otherToggle.nextElementSibling.classList.add('hidden');
                }
            });
            
            // Toggle current dropdown
            this.setAttribute('aria-expanded', !isExpanded);
            content.classList.toggle('hidden');
            
            // Add focus trap for keyboard users
            if (!content.classList.contains('hidden')) {
                const focusableElements = content.querySelectorAll('a, button');
                if (focusableElements.length) {
                    setTimeout(() => focusableElements[0].focus(), 100);
                }
            }
        });
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.dropdown')) {
            dropdownToggles.forEach(toggle => {
                toggle.setAttribute('aria-expanded', 'false');
                toggle.nextElementSibling.classList.add('hidden');
            });
        }
    });
    
    // Close dropdowns on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            dropdownToggles.forEach(toggle => {
                toggle.setAttribute('aria-expanded', 'false');
                toggle.nextElementSibling.classList.add('hidden');
            });
        }
    });
}

/**
 * Initialize mobile navigation behavior
 */
function initMobileNavigation() {
    const mobileBottomNav = document.querySelector('.mobile-bottom-nav');
    
    // Add padding to the bottom of the page when mobile navigation is present
    if (mobileBottomNav) {
        const navHeight = mobileBottomNav.offsetHeight;
        document.body.style.paddingBottom = `${navHeight}px`;
    }
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of notification (success, error, info, warning)
 * @param {number} duration - Duration in milliseconds
 */
function showNotification(message, type = 'info', duration = 3000) {
    const container = document.getElementById('notification-toast');
    if (!container) return;
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `global-notification ${type}`;
    
    // Inner content structure
    notification.innerHTML = `
        <div class="notification-content">
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        </div>
    `;
    
    // Add to container
    container.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Attach close handler
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        });
    }
    
    // Auto-remove after duration
    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }
    }, duration);
}