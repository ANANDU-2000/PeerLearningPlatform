/**
 * PeerLearn Page Transitions
 * Provides smooth page transitions for better UX
 */

// Create a self-executing function to avoid global namespace pollution
window.PageTransitionSystem = (() => {
    // Store references to key elements
    const pageContent = document.getElementById('page-content');
    let isTransitioning = false;
    
    // Default transition settings
    const defaults = {
        duration: 300, // ms
        easing: 'ease-in-out',
        fadeOut: true,
        fadeIn: true,
        slideOut: false,
        slideIn: false,
        slideDirection: 'left', // 'left', 'right', 'up', 'down'
    };
    
    // Initialize transitions
    function init() {
        // Skip if already initialized or page content not found
        if (!pageContent || window.pageTransitionsInitialized) return;
        
        // Mark as initialized
        window.pageTransitionsInitialized = true;
        
        // Set up link interception for internal navigation
        setupLinkInterception();
        
        // Set up form submission interception
        setupFormInterception();
        
        // Handle initial page load (when returning from another page)
        handleInitialLoad();
        
        console.log('Page transitions initialized');
    }
    
    // Handle the initial page load
    function handleInitialLoad() {
        // Add a small delay for the entry animation
        setTimeout(() => {
            if (pageContent) {
                pageContent.classList.add('page-transition-enter-active');
                pageContent.classList.remove('page-transition-enter');
            }
        }, 50);
    }
    
    // Intercept link clicks for internal navigation
    function setupLinkInterception() {
        document.addEventListener('click', (e) => {
            // Find the closest anchor tag
            const link = e.target.closest('a');
            
            // Skip if not a link or has specific attributes
            if (!link || 
                isTransitioning || 
                link.getAttribute('target') === '_blank' || 
                link.getAttribute('download') || 
                link.getAttribute('data-no-transition') === 'true' ||
                link.getAttribute('href').startsWith('#') ||
                link.getAttribute('href').startsWith('mailto:') ||
                link.getAttribute('href').startsWith('tel:')) {
                return;
            }
            
            // Get the URL for navigation
            const url = link.getAttribute('href');
            
            // Only handle internal links
            if (url && url.startsWith('/') && !url.startsWith('//')) {
                e.preventDefault();
                navigateTo(url);
            }
        });
        
        // Handle browser back/forward buttons
        window.addEventListener('popstate', (e) => {
            // Perform transition for back/forward navigation
            handlePageTransition(window.location.href, { push: false });
        });
    }
    
    // Intercept form submissions
    function setupFormInterception() {
        document.addEventListener('submit', (e) => {
            const form = e.target;
            
            // Skip if the form has data-no-transition attribute
            if (form.getAttribute('data-no-transition') === 'true' || 
                !form.getAttribute('method') ||
                form.getAttribute('method').toLowerCase() !== 'get') {
                return;
            }
            
            // Prevent default form submission
            e.preventDefault();
            
            // Serialize form data
            const formData = new FormData(form);
            const queryString = new URLSearchParams(formData).toString();
            
            // Create URL with query parameters
            let url = form.getAttribute('action') || window.location.pathname;
            url = url + (url.includes('?') ? '&' : '?') + queryString;
            
            // Navigate with transition
            navigateTo(url);
        });
    }
    
    // Core navigation function
    function navigateTo(url, options = {}) {
        const transitionOptions = { ...defaults, ...options };
        
        // Prevent rapid navigation attempts
        if (isTransitioning) return;
        
        // Start transition
        handlePageTransition(url, { push: true, ...transitionOptions });
    }
    
    // Handle the page transition animation and content loading
    function handlePageTransition(url, options) {
        isTransitioning = true;
        
        // Start exit animation
        if (pageContent) {
            pageContent.classList.add('page-transition-exit');
        }
        
        // Wait for exit animation to complete
        setTimeout(() => {
            // Fetch new page content
            fetch(url, { credentials: 'same-origin' })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    return response.text();
                })
                .then(html => {
                    // Parse the HTML response
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    
                    // Extract the main content
                    const newContent = doc.getElementById('page-content');
                    
                    if (newContent && pageContent) {
                        // Update page title
                        document.title = doc.title;
                        
                        // Update the browser history if needed
                        if (options.push) {
                            window.history.pushState({}, doc.title, url);
                        }
                        
                        // Replace the page content
                        pageContent.innerHTML = newContent.innerHTML;
                        
                        // Reinitialize any needed scripts
                        reinitializeScripts();
                        
                        // Set up entry animation
                        pageContent.classList.remove('page-transition-exit');
                        pageContent.classList.add('page-transition-enter');
                        
                        // Trigger the entry animation after a small delay
                        setTimeout(() => {
                            pageContent.classList.add('page-transition-enter-active');
                            
                            // Reset after animation completes
                            setTimeout(() => {
                                pageContent.classList.remove('page-transition-enter', 'page-transition-enter-active');
                                isTransitioning = false;
                            }, options.duration);
                        }, 50);
                    } else {
                        // If content isn't found, do a full page load
                        window.location.href = url;
                    }
                })
                .catch(error => {
                    console.error('Error during page transition:', error);
                    // Fallback to regular navigation on error
                    window.location.href = url;
                });
        }, options.duration);
    }
    
    // Reinitialize scripts after content is loaded
    function reinitializeScripts() {
        // Reinitialize Feather icons if available
        if (window.feather) {
            feather.replace();
        }
        
        // Reinitialize dropdowns
        initializeDropdowns();
        
        // Trigger a custom event that other scripts can listen for
        const event = new CustomEvent('page:loaded');
        document.dispatchEvent(event);
    }
    
    // Initialize dropdown toggles
    function initializeDropdowns() {
        const dropdownToggles = document.querySelectorAll('.dropdown');
        
        dropdownToggles.forEach(dropdown => {
            const button = dropdown.querySelector('button');
            const content = dropdown.querySelector('.dropdown-content');
            const arrow = dropdown.querySelector('#user-menu-arrow');
            
            if (button && content) {
                button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    content.classList.toggle('hidden');
                    
                    // Add animation classes for smooth transition
                    if (content.classList.contains('hidden')) {
                        content.classList.remove('opacity-100', 'scale-100');
                        content.classList.add('opacity-0', 'scale-95');
                        if (arrow) arrow.classList.remove('rotate-180');
                    } else {
                        content.classList.remove('opacity-0', 'scale-95');
                        content.classList.add('opacity-100', 'scale-100');
                        if (arrow) arrow.classList.add('rotate-180');
                    }
                });
            }
        });
    }
    
    // Define public API
    return {
        init,
        navigateTo
    };
})();

// Initialize page transitions when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize transitions
    if (window.PageTransitionSystem) {
        window.PageTransitionSystem.init();
    }
    
    // Initialize dropdowns
    initializeDropdowns();
    
    // Add page transition styles
    addPageTransitionStyles();
});

// Initialize dropdown toggles
function initializeDropdowns() {
    const dropdownToggles = document.querySelectorAll('.dropdown');
    
    dropdownToggles.forEach(dropdown => {
        const button = dropdown.querySelector('button');
        const content = dropdown.querySelector('.dropdown-content');
        const arrow = dropdown.querySelector('#user-menu-arrow');
        
        if (button && content) {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                content.classList.toggle('hidden');
                
                // Add animation classes for smooth transition
                if (content.classList.contains('hidden')) {
                    content.classList.remove('opacity-100', 'scale-100');
                    content.classList.add('opacity-0', 'scale-95');
                    if (arrow) arrow.classList.remove('rotate-180');
                } else {
                    content.classList.remove('opacity-0', 'scale-95');
                    content.classList.add('opacity-100', 'scale-100');
                    if (arrow) arrow.classList.add('rotate-180');
                }
            });
        }
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        const dropdowns = document.querySelectorAll('.dropdown-content');
        const arrows = document.querySelectorAll('#user-menu-arrow');
        
        dropdowns.forEach((dropdown, index) => {
            if (!dropdown.classList.contains('hidden') && !e.target.closest('.dropdown')) {
                dropdown.classList.add('hidden', 'opacity-0', 'scale-95');
                dropdown.classList.remove('opacity-100', 'scale-100');
                
                const arrow = arrows[index];
                if (arrow) arrow.classList.remove('rotate-180');
            }
        });
    });
}

// Add page transition styles
function addPageTransitionStyles() {
    // Check if styles already exist
    if (!document.getElementById('page-transition-styles')) {
        // Create style element
        const style = document.createElement('style');
        style.id = 'page-transition-styles';
        
        // Add transition styles
        style.textContent = `
            .page-transition {
                transition: opacity 0.3s ease, transform 0.3s ease;
            }
            
            .page-transition-enter {
                opacity: 0;
                transform: translateY(10px);
            }
            
            .page-transition-enter-active {
                opacity: 1;
                transform: translateY(0);
            }
            
            .page-transition-exit {
                opacity: 0;
                transform: translateY(-10px);
                transition: opacity 0.3s ease, transform 0.3s ease;
            }
        `;
        
        // Add to document head
        document.head.appendChild(style);
    }
}