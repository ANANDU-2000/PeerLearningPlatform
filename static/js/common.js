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
 * - Shows only on dashboard pages
 * - Specific to user role (mentor/learner)
 * - Page-specific persistence with localStorage
 */
function initWelcomeMessage() {
    // Only show welcome message on dashboard pages
    const currentPath = window.location.pathname;
    const isDashboardPage = currentPath.includes('/dashboard/');
    
    if (!isDashboardPage) return;
    
    // Get role-specific welcome message
    const welcomeMsg = document.querySelector('.welcome-message');
    
    // Only proceed if welcome message exists
    if (!welcomeMsg) return;
    
    const userRole = welcomeMsg.getAttribute('data-role');
    const closeBtn = welcomeMsg.querySelector('.close-btn');
    
    // Create unique key for this path and role
    const storageKey = `${currentPath}_${userRole}_dismissed`;
    
    console.log("Welcome message check:", {
        path: currentPath,
        role: userRole,
        storageKey: storageKey,
        isDismissed: localStorage.getItem(storageKey)
    });
    
    // Only show if not dismissed for this specific path and role
    if (!localStorage.getItem(storageKey)) {
        // Wait a moment before showing the message
        setTimeout(() => {
            // Check for duplicate welcome messages and only show one
            const visibleWelcomeMessages = document.querySelectorAll('.welcome-message:not(.hidden)');
            if (visibleWelcomeMessages.length === 0) {
                welcomeMsg.classList.remove('hidden');
            }
        }, 2000);
    }
    
    // Handle close button click
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            hideWelcomeMessage(welcomeMsg);
            // Remember that user dismissed the message for this specific page and role
            localStorage.setItem(storageKey, 'true');
        });
    }
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        // Check if welcomeMsg still exists in the DOM
        if (welcomeMsg && document.body.contains(welcomeMsg) && !welcomeMsg.classList.contains('hidden')) {
            hideWelcomeMessage(welcomeMsg);
        }
    }, 10000);
}

/**
 * Hide welcome message with animation
 */
function hideWelcomeMessage(welcomeMsg) {
    if (!welcomeMsg) return;
    
    // First set opacity to 0 (fade out)
    welcomeMsg.style.opacity = '0';
    
    // After the fade-out transition completes, hide the element
    setTimeout(() => {
        welcomeMsg.classList.add('hidden');
        welcomeMsg.style.opacity = ''; // Reset the inline style
        console.log('Welcome message hidden');
    }, 300);
}

/**
 * Initialize dropdown menus with proper accessibility
 */
function initDropdowns() {
    try {
        // Explicitly handle user profile menu
        const userMenuButton = document.querySelector('#user-menu-button, .profile-menu-button');
        const userMenu = document.querySelector('#user-menu-dropdown, .profile-dropdown');
        
        if (userMenuButton && userMenu) {
            console.log("Profile menu elements found:", {userMenuButton, userMenu});
            
            userMenuButton.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log("Profile menu clicked");
                
                // Toggle visibility
                const isHidden = userMenu.classList.contains('hidden');
                if (isHidden) {
                    // Show menu
                    userMenu.classList.remove('hidden');
                    userMenuButton.setAttribute('aria-expanded', 'true');
                } else {
                    // Hide menu
                    userMenu.classList.add('hidden');
                    userMenuButton.setAttribute('aria-expanded', 'false');
                }
            });
            
            // Close menu when clicking outside
            document.addEventListener('click', function(e) {
                if (!userMenuButton.contains(e.target) && !userMenu.contains(e.target)) {
                    userMenu.classList.add('hidden');
                    userMenuButton.setAttribute('aria-expanded', 'false');
                }
            });
        } else {
            console.log("Profile menu elements not found");
        }
        
        // Generic dropdowns
        const dropdownToggles = document.querySelectorAll('.dropdown button:not(#user-menu-button):not(.profile-menu-button)');
        if (dropdownToggles && dropdownToggles.length > 0) {
            dropdownToggles.forEach(toggle => {
                if (!toggle) return;
                
                toggle.addEventListener('click', function(e) {
                    e.stopPropagation();
                    
                    try {
                        const content = this.nextElementSibling;
                        if (!content) return;
                        
                        const isExpanded = this.getAttribute('aria-expanded') === 'true';
                        
                        // Close all other dropdowns first
                        dropdownToggles.forEach(otherToggle => {
                            if (!otherToggle || otherToggle === toggle) return;
                            
                            try {
                                otherToggle.setAttribute('aria-expanded', 'false');
                            const otherContent = otherToggle.nextElementSibling;
                            if (otherContent && otherContent.classList) {
                                otherContent.classList.add('hidden');
                            }
                        } catch (err) {
                            console.error('Error closing other dropdown:', err);
                        }
                    });
                    
                    // Toggle current dropdown
                    this.setAttribute('aria-expanded', !isExpanded);
                    content.classList.toggle('hidden');
                    
                    // Add focus trap for keyboard users
                    if (content.classList && !content.classList.contains('hidden')) {
                        const focusableElements = content.querySelectorAll('a, button');
                        if (focusableElements.length) {
                            setTimeout(() => focusableElements[0].focus(), 100);
                        }
                    }
                } catch (err) {
                    console.error('Error in dropdown click handler:', err);
                }
            });
        });
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', function(e) {
            try {
                if (!e.target.closest('.dropdown')) {
                    dropdownToggles.forEach(toggle => {
                        if (!toggle) return;
                        
                        try {
                            toggle.setAttribute('aria-expanded', 'false');
                            const content = toggle.nextElementSibling;
                            if (content && content.classList) {
                                content.classList.add('hidden');
                            }
                        } catch (err) {
                            console.error('Error closing dropdown on outside click:', err);
                        }
                    });
                }
            } catch (err) {
                console.error('Error in document click handler:', err);
            }
        });
        
        // Close dropdowns on Escape key
        document.addEventListener('keydown', function(e) {
            try {
                if (e.key === 'Escape') {
                    dropdownToggles.forEach(toggle => {
                        if (!toggle) return;
                        
                        try {
                            toggle.setAttribute('aria-expanded', 'false');
                            const content = toggle.nextElementSibling;
                            if (content && content.classList) {
                                content.classList.add('hidden');
                            }
                        } catch (err) {
                            console.error('Error closing dropdown on escape:', err);
                        }
                    });
                }
            } catch (err) {
                console.error('Error in escape key handler:', err);
            }
        });
    } catch (err) {
        console.error('Error initializing dropdowns:', err);
    }
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