/**
 * Common JavaScript functionality for PeerLearn
 */
document.addEventListener('DOMContentLoaded', function() {
    // Handle welcome message popup
    initWelcomeMessage();
    
    // Initialize any feather icons
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
});

/**
 * Initialize the welcome message popup with proper storage and dismissal
 */
function initWelcomeMessage() {
    const welcomeMsg = document.querySelector('.welcome-message');
    const closeBtn = document.querySelector('.welcome-message .close-btn');
    
    if (welcomeMsg) {
        // Check if the welcome message has been shown before
        const hasSeenWelcome = localStorage.getItem('peerlearn_welcome_seen');
        
        if (!hasSeenWelcome) {
            // Show the welcome message and set a timeout to auto-hide it after 10 seconds
            welcomeMsg.classList.remove('hidden');
            setTimeout(() => {
                hideWelcomeMessage(welcomeMsg);
            }, 10000);
            
            // Mark that the user has seen the welcome message
            localStorage.setItem('peerlearn_welcome_seen', 'true');
        }
        
        // Add click event to close button
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                hideWelcomeMessage(welcomeMsg);
            });
        }
    }
}

/**
 * Hide the welcome message with a fade-out animation
 */
function hideWelcomeMessage(welcomeMsg) {
    welcomeMsg.style.opacity = '0';
    setTimeout(() => {
        welcomeMsg.classList.add('hidden');
        welcomeMsg.style.opacity = '1';
    }, 300);
}

/**
 * Global notification system
 */
const notification = {
    show: function(message, type = 'info', duration = 5000) {
        // Remove any existing notifications
        const existingNotifications = document.querySelectorAll('.global-notification');
        existingNotifications.forEach(notification => {
            notification.remove();
        });
        
        // Create new notification
        const notificationEl = document.createElement('div');
        notificationEl.className = `global-notification ${type}`;
        notificationEl.innerHTML = `
            <div class="notification-content">
                <span>${message}</span>
                <button class="notification-close">×</button>
            </div>
        `;
        
        // Add to document
        document.body.appendChild(notificationEl);
        
        // Animate in
        setTimeout(() => {
            notificationEl.classList.add('show');
        }, 10);
        
        // Setup close button
        const closeBtn = notificationEl.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            this.hide(notificationEl);
        });
        
        // Auto close after duration
        setTimeout(() => {
            this.hide(notificationEl);
        }, duration);
        
        return notificationEl;
    },
    
    hide: function(notificationEl) {
        notificationEl.classList.remove('show');
        setTimeout(() => {
            notificationEl.remove();
        }, 300);
    },
    
    success: function(message, duration = 5000) {
        return this.show(message, 'success', duration);
    },
    
    error: function(message, duration = 5000) {
        return this.show(message, 'error', duration);
    },
    
    info: function(message, duration = 5000) {
        return this.show(message, 'info', duration);
    },
    
    warning: function(message, duration = 5000) {
        return this.show(message, 'warning', duration);
    }
};

// Log that the notification system is initialized
console.log("Notification system initialized");