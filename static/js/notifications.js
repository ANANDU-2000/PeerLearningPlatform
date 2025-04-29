/**
 * PeerLearn Notifications System
 * 
 * Provides real-time notifications and alerts for user activities.
 * Supports different notification types with customizable behavior.
 */

// Notification display time in milliseconds
const NOTIFICATION_DISPLAY_TIME = 5000;

// Maximum number of notifications to show at once
const MAX_NOTIFICATIONS = 5;

// Store for active notifications
let activeNotifications = [];

// Initialize notification system
function initNotifications() {
    console.log("Notification system initialized");
    
    // Create notification container if it doesn't exist
    createNotificationContainer();
    
    // Setup WebSocket connections for real-time notifications
    setupNotificationSockets();
}

/**
 * Creates the notification container in the DOM
 */
function createNotificationContainer() {
    // Check if container already exists
    if (document.getElementById('notification-container')) {
        return;
    }
    
    // Create container
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'fixed top-20 right-5 z-50 flex flex-col gap-3 items-end max-w-xs w-full';
    document.body.appendChild(container);
}

/**
 * Setup WebSocket connection for real-time notifications
 */
function setupNotificationSockets() {
    // Check if user is authenticated by looking for user data
    const userElement = document.getElementById('user-data');
    if (!userElement) {
        return; // User not logged in
    }
    
    try {
        // Get user ID from data attribute
        const userId = userElement.dataset.userId;
        
        if (!userId) {
            return; // No user ID available
        }
        
        // Setup WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/notifications/${userId}/`;
        
        const socket = new WebSocket(wsUrl);
        
        socket.onopen = function(e) {
            console.log('Notification socket connected');
        };
        
        socket.onmessage = function(e) {
            const data = JSON.parse(e.data);
            
            if (data.type === 'notification') {
                // Display the notification
                showNotification(data.message, data.notification_type, data.url);
                
                // Play sound if applicable
                if (data.play_sound) {
                    playNotificationSound(data.notification_type);
                }
            }
        };
        
        socket.onclose = function(e) {
            console.log('Notification socket closed. Reconnecting in 5s...');
            // Try to reconnect after 5 seconds
            setTimeout(setupNotificationSockets, 5000);
        };
        
        socket.onerror = function(error) {
            console.error('Notification socket error:', error);
        };
        
    } catch (error) {
        console.error('Error setting up notification socket:', error);
    }
}

/**
 * Show a notification to the user
 * 
 * @param {string} message - The notification message
 * @param {string} type - Notification type (success, error, info, warning)
 * @param {string|null} url - Optional URL to navigate to when clicked
 */
function showNotification(message, type = 'info', url = null) {
    // Get container
    const container = document.getElementById('notification-container');
    if (!container) {
        createNotificationContainer();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification transform transition-all duration-300 translate-x-full';
    
    // Add appropriate styles based on type
    let iconName, bgColor, textColor, borderColor;
    
    switch (type) {
        case 'success':
            iconName = 'check-circle';
            bgColor = 'bg-green-50';
            textColor = 'text-green-800';
            borderColor = 'border-green-100';
            break;
        case 'error':
            iconName = 'alert-circle';
            bgColor = 'bg-red-50';
            textColor = 'text-red-800';
            borderColor = 'border-red-100';
            break;
        case 'warning':
            iconName = 'alert-triangle';
            bgColor = 'bg-yellow-50';
            textColor = 'text-yellow-800'; 
            borderColor = 'border-yellow-100';
            break;
        case 'info':
        default:
            iconName = 'info';
            bgColor = 'bg-blue-50';
            textColor = 'text-blue-800';
            borderColor = 'border-blue-100';
            break;
    }
    
    // Set notification styles
    notification.className += ` ${bgColor} ${textColor} rounded-lg p-4 shadow-lg border ${borderColor} w-full flex items-start`;
    
    // Add click behavior if URL provided
    if (url) {
        notification.classList.add('cursor-pointer', 'hover:shadow-md');
        notification.addEventListener('click', function() {
            window.location.href = url;
        });
    }
    
    // Create content
    notification.innerHTML = `
        <div class="flex-shrink-0 mr-3">
            <i data-feather="${iconName}" class="h-5 w-5"></i>
        </div>
        <div class="flex-1">
            <p class="text-sm font-medium">${message}</p>
        </div>
        <button class="ml-4 flex-shrink-0 rounded-full p-1 hover:bg-white hover:bg-opacity-25 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <span class="sr-only">Dismiss</span>
            <i data-feather="x" class="h-4 w-4"></i>
        </button>
    `;
    
    // Attach to DOM and animate in
    const notificationContainer = document.getElementById('notification-container');
    notificationContainer.appendChild(notification);
    
    // Initialize Feather icons for the notification
    if (typeof feather !== 'undefined') {
        feather.replace(notification.querySelectorAll('[data-feather]'));
    }
    
    // Track this notification
    const notificationId = Date.now();
    activeNotifications.push({
        id: notificationId,
        element: notification,
        timeout: null
    });
    
    // Limit number of notifications
    enforceNotificationLimit();
    
    // Add closing functionality
    const closeButton = notification.querySelector('button');
    closeButton.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent triggering URL navigation
        removeNotification(notificationId);
    });
    
    // Animate in
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 10);
    
    // Auto dismiss after timeout
    const timeout = setTimeout(() => {
        removeNotification(notificationId);
    }, NOTIFICATION_DISPLAY_TIME);
    
    // Store timeout ID
    activeNotifications.find(n => n.id === notificationId).timeout = timeout;
    
    return notificationId;
}

/**
 * Enforce the maximum number of notifications
 */
function enforceNotificationLimit() {
    if (activeNotifications.length <= MAX_NOTIFICATIONS) {
        return;
    }
    
    // Remove oldest notifications
    const excessCount = activeNotifications.length - MAX_NOTIFICATIONS;
    
    for (let i = 0; i < excessCount; i++) {
        const oldest = activeNotifications[0];
        removeNotification(oldest.id);
    }
}

/**
 * Remove a notification by ID
 */
function removeNotification(id) {
    const index = activeNotifications.findIndex(n => n.id === id);
    
    if (index !== -1) {
        const notification = activeNotifications[index];
        
        // Clear timeout if exists
        if (notification.timeout) {
            clearTimeout(notification.timeout);
        }
        
        // Animate out
        notification.element.classList.add('translate-x-full');
        
        // Remove after animation
        setTimeout(() => {
            if (notification.element.parentNode) {
                notification.element.parentNode.removeChild(notification.element);
            }
        }, 300);
        
        // Remove from tracking array
        activeNotifications.splice(index, 1);
    }
}

/**
 * Play notification sound based on type
 */
function playNotificationSound(type) {
    let soundUrl;
    
    switch (type) {
        case 'success':
            soundUrl = '/static/sounds/notification-success.mp3';
            break;
        case 'error':
            soundUrl = '/static/sounds/notification-error.mp3';
            break;
        case 'warning':
            soundUrl = '/static/sounds/notification-warning.mp3';
            break;
        case 'info':
        default:
            soundUrl = '/static/sounds/notification-info.mp3';
            break;
    }
    
    try {
        const audio = new Audio(soundUrl);
        audio.volume = 0.5;
        audio.play().catch(e => {
            console.log('Auto-play prevented. User interaction required.');
        });
    } catch (error) {
        console.error('Error playing notification sound:', error);
    }
}

// Export functions
window.showNotification = showNotification;
window.initNotifications = initNotifications;