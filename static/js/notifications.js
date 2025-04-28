/**
 * Notifications system for PeerLearn
 */

// Initialize WebSocket for real-time notifications
function initializeNotifications() {
    console.log('Notification system initialized');
    
    // Don't show welcome notifications on admin pages
    const currentPath = window.location.pathname;
    const isAdminPage = currentPath.includes('/admin-panel/') || currentPath.includes('/admin/');
    
    if (isAdminPage) {
        console.log('Admin page detected, not showing welcome notification');
        return;
    }
    
    // We'll implement real WebSocket notifications later
    // For now, we'll just set up the UI
    
    // Only show this on dashboard pages
    const isDashboardPage = currentPath.includes('/dashboard/');
    if (isDashboardPage) {
        // Show a sample notification after 3 seconds (for testing)
        setTimeout(function() {
            showNotification('Welcome to PeerLearn', 'Your dashboard is ready. Explore the features!');
        }, 3000);
    }
}

// Function to show a notification toast
function showNotification(title, message) {
    const notificationToast = document.getElementById('notification-toast');
    
    // Create notification content
    notificationToast.innerHTML = `
        <div class="bg-white rounded-lg shadow-lg p-4 flex items-start max-w-md transform transition-all duration-300">
            <div class="flex-shrink-0 text-blue-500 mr-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <div class="flex-1">
                <h3 class="font-bold text-gray-900">${title}</h3>
                <p class="text-sm text-gray-600">${message}</p>
            </div>
            <button class="text-gray-400 hover:text-gray-600 focus:outline-none ml-4" onclick="hideNotification()">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    `;
    
    // Show notification
    notificationToast.classList.remove('translate-x-full');
    notificationToast.classList.add('translate-x-0');
    
    // Auto-hide after 5 seconds
    setTimeout(hideNotification, 5000);
}

// Function to hide notification toast
function hideNotification() {
    const notificationToast = document.getElementById('notification-toast');
    notificationToast.classList.remove('translate-x-0');
    notificationToast.classList.add('translate-x-full');
}