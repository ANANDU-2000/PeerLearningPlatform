/**
 * PeerLearn Notification System
 * Real-time notifications using WebSockets
 */

// Define EDUCATIONAL_DOMAINS if it doesn't exist
window.EDUCATIONAL_DOMAINS = window.EDUCATIONAL_DOMAINS || [
    'edu', 'ac.uk', 'edu.au', 'ac.in', 'edu.sg', 'ac.jp',
    'edu.cn', 'ac.za', 'edu.mx', 'edu.br', 'edu.ar',
    'ac.nz', 'edu.hk', 'edu.tw', 'ac.kr', 'school'
];

// Wait for document to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Notification system initialized');
    
    // Store notification configuration
    const NotificationSystem = {
        // Connection settings
        socket: null,
        connected: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
        reconnectDelay: 3000,
        
        // UI Elements
        notificationsContainer: null,
        notificationCount: 0,
        
        // Initialize the notification system
        init() {
            // Create notifications container if it doesn't exist
            if (!document.querySelector('.notifications-container')) {
                this.createNotificationsContainer();
            }
            
            // Get current user info if available
            const currentUser = this.getCurrentUser();
            
            // Only connect if user is authenticated
            if (currentUser && currentUser.id) {
                this.connectWebSocket(currentUser);
            }
            
            // Setup event handlers for existing notifications
            this.setupNotificationEvents();
        },
        
        // Get current user info from the document
        getCurrentUser() {
            // Check if we have user data embedded in the page
            const userDataEl = document.getElementById('user-data');
            if (userDataEl) {
                try {
                    return JSON.parse(userDataEl.getAttribute('data-user'));
                } catch (e) {
                    console.error('Error parsing user data:', e);
                }
            }
            
            // Default to user info that might be in a meta tag
            const userIdMeta = document.querySelector('meta[name="user-id"]');
            const userRoleMeta = document.querySelector('meta[name="user-role"]');
            
            if (userIdMeta && userRoleMeta) {
                return {
                    id: userIdMeta.getAttribute('content'),
                    role: userRoleMeta.getAttribute('content')
                };
            }
            
            return null;
        },
        
        // Create the notifications container
        createNotificationsContainer() {
            const container = document.createElement('div');
            container.className = 'notifications-container fixed top-5 right-5 z-[9999] max-w-md flex flex-col items-end';
            document.body.appendChild(container);
            this.notificationsContainer = container;
        },
        
        // Connect to WebSocket server
        connectWebSocket(user) {
            // Determine WebSocket URI based on current protocol
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Using the correct path without user ID since the server handles that
            const wsUrl = `${protocol}//${window.location.host}/ws/notifications/`;
            
            try {
                this.socket = new WebSocket(wsUrl);
                
                // Setup event handlers
                this.socket.onopen = this.handleSocketOpen.bind(this);
                this.socket.onmessage = this.handleSocketMessage.bind(this);
                this.socket.onclose = this.handleSocketClose.bind(this);
                this.socket.onerror = this.handleSocketError.bind(this);
            } catch (error) {
                console.error('WebSocket connection error:', error);
            }
        },
        
        // WebSocket event handlers
        handleSocketOpen(event) {
            console.log('WebSocket connection established');
            this.connected = true;
            this.reconnectAttempts = 0;
        },
        
        handleSocketMessage(event) {
            try {
                const data = JSON.parse(event.data);
                
                // Handle different types of notifications
                if (data.type === 'notification') {
                    this.showNotification(data);
                } else if (data.type === 'session_update') {
                    this.handleSessionUpdate(data);
                } else if (data.type === 'system_message') {
                    this.showSystemMessage(data);
                }
            } catch (error) {
                console.error('Error handling WebSocket message:', error);
            }
        },
        
        handleSocketClose(event) {
            this.connected = false;
            console.log('WebSocket connection closed');
            
            // Attempt to reconnect if not closed cleanly
            if (event.code !== 1000) {
                this.attemptReconnect();
            }
        },
        
        handleSocketError(error) {
            console.error('WebSocket error:', error);
            this.connected = false;
        },
        
        // Reconnection logic
        attemptReconnect() {
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                
                setTimeout(() => {
                    const currentUser = this.getCurrentUser();
                    if (currentUser && currentUser.id) {
                        this.connectWebSocket(currentUser);
                    }
                }, this.reconnectDelay);
            } else {
                console.log('Maximum reconnection attempts reached');
            }
        },
        
        // Display a notification
        showNotification(data) {
            const { title, message, type, icon, duration, actions } = data;
            
            // Create notification element
            const notification = document.createElement('div');
            notification.className = `notification shadow-lg rounded-lg overflow-hidden mt-4 flex transition-all transform-gpu duration-300 ease-out translate-x-full opacity-0 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700`;
            notification.id = `notification-${Date.now()}`;
            
            // Add CSS class based on notification type
            if (type) {
                notification.classList.add(`notification-${type}`);
                
                // Add border based on type
                if (type === 'success') {
                    notification.classList.add('border-l-4', 'border-l-success');
                } else if (type === 'error') {
                    notification.classList.add('border-l-4', 'border-l-danger');
                } else if (type === 'warning') {
                    notification.classList.add('border-l-4', 'border-l-warning');
                } else {
                    notification.classList.add('border-l-4', 'border-l-primary');
                }
            }
            
            // Determine icon based on notification type
            let iconName = icon || 'bell';
            if (!icon) {
                if (type === 'success') iconName = 'check-circle';
                else if (type === 'error') iconName = 'alert-circle';
                else if (type === 'warning') iconName = 'alert-triangle';
                else if (type === 'info') iconName = 'info';
            }
            
            // Create notification content
            notification.innerHTML = `
                <div class="flex flex-1 p-4">
                    <div class="flex-shrink-0 mr-3">
                        <i data-feather="${iconName}" class="h-5 w-5 ${this.getIconColorClass(type)}"></i>
                    </div>
                    <div class="flex-1">
                        ${title ? `<h4 class="text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">${title}</h4>` : ''}
                        <p class="text-sm text-gray-700 dark:text-gray-300">${message}</p>
                        ${actions ? this.createActionButtons(actions) : ''}
                    </div>
                </div>
                <button class="close-notification p-2 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <i data-feather="x" class="h-4 w-4 text-gray-500 dark:text-gray-400"></i>
                </button>
            `;
            
            // Add to container
            this.notificationsContainer.appendChild(notification);
            this.notificationCount++;
            
            // Initialize Feather icons in the notification
            if (window.feather) {
                feather.replace();
            }
            
            // Add event listener to close button
            const closeButton = notification.querySelector('.close-notification');
            if (closeButton) {
                closeButton.addEventListener('click', () => {
                    this.dismissNotification(notification);
                });
            }
            
            // Set auto-dismiss timer
            const autoHideDuration = duration || 5000;
            if (autoHideDuration > 0) {
                setTimeout(() => {
                    this.dismissNotification(notification);
                }, autoHideDuration);
            }
            
            // Animate in
            requestAnimationFrame(() => {
                notification.classList.remove('translate-x-full', 'opacity-0');
                notification.classList.add('translate-x-0', 'opacity-100');
            });
        },
        
        // Return appropriate color class based on notification type
        getIconColorClass(type) {
            switch (type) {
                case 'success': return 'text-success';
                case 'error': return 'text-danger';
                case 'warning': return 'text-warning';
                case 'info': return 'text-primary';
                default: return 'text-gray-500 dark:text-gray-400';
            }
        },
        
        // Create action buttons for a notification
        createActionButtons(actions) {
            if (!actions || !actions.length) return '';
            
            const buttonsHtml = actions.map(action => {
                const buttonClass = action.primary ? 
                    'btn-sm btn-primary' : 
                    'btn-sm btn-outline text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600';
                
                return `<button 
                    class="btn ${buttonClass} text-xs mt-2 mr-2" 
                    data-action="${action.id || ''}"
                    data-url="${action.url || ''}"
                >${action.text}</button>`;
            }).join('');
            
            return `<div class="notification-actions mt-1">${buttonsHtml}</div>`;
        },
        
        // Dismiss a notification with animation
        dismissNotification(notification) {
            // Animate out
            notification.classList.add('translate-x-full', 'opacity-0');
            
            // Remove after animation completes
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                    this.notificationCount--;
                }
            }, 300);
        },
        
        // Handle session updates
        handleSessionUpdate(data) {
            // Update UI elements related to a session if necessary
            if (data.session_id) {
                const sessionElements = document.querySelectorAll(`[data-session-id="${data.session_id}"]`);
                if (sessionElements.length > 0) {
                    // Update status indicators or other dynamic content
                    sessionElements.forEach(el => {
                        const statusEl = el.querySelector('.session-status');
                        if (statusEl && data.status) {
                            statusEl.textContent = data.status;
                            // Update status class
                            statusEl.className = statusEl.className.replace(/status-\w+/, `status-${data.status.toLowerCase()}`);
                        }
                    });
                }
            }
            
            // Show notification about the update
            this.showNotification({
                title: data.title || 'Session Update',
                message: data.message,
                type: data.notification_type || 'info',
                icon: data.icon,
                actions: data.actions
            });
        },
        
        // Display a system message
        showSystemMessage(data) {
            this.showNotification({
                title: data.title || 'System Message',
                message: data.message,
                type: 'info',
                icon: 'info',
                duration: 8000
            });
        },
        
        // Set up event handlers for notification interactions
        setupNotificationEvents() {
            // Handle clicks on notification action buttons
            document.addEventListener('click', (event) => {
                if (event.target.closest('.notification-actions button')) {
                    const button = event.target.closest('.notification-actions button');
                    const actionId = button.getAttribute('data-action');
                    const actionUrl = button.getAttribute('data-url');
                    
                    // Handle action
                    if (actionUrl) {
                        window.location.href = actionUrl;
                    } else if (actionId) {
                        // Handle custom actions
                        this.handleNotificationAction(actionId, button);
                    }
                }
            });
        },
        
        // Handle custom notification actions
        handleNotificationAction(actionId, buttonElement) {
            console.log(`Handling notification action: ${actionId}`);
            
            // Find the parent notification
            const notification = buttonElement.closest('.notification');
            
            // Close the notification
            if (notification) {
                this.dismissNotification(notification);
            }
        },
        
        // Manually send a test notification (for development)
        testNotification() {
            this.showNotification({
                title: 'Test Notification',
                message: 'This is a test notification from the PeerLearn notification system.',
                type: 'info',
                duration: 5000,
                actions: [
                    { id: 'dismiss', text: 'Dismiss' },
                    { id: 'view', text: 'View Details', primary: true }
                ]
            });
        }
    };
    
    // Initialize the notification system
    NotificationSystem.init();
    
    // Expose notification system globally
    window.NotificationSystem = NotificationSystem;
});