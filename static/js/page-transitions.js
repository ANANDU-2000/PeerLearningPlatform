/**
 * PeerLearn Page Transitions
 * Smooth transitions between pages using AJAX and CSS animations
 * Version 1.0.0
 */

class PageTransitions {
    constructor() {
        this.isAnimating = false;
        this.container = document.getElementById('page-content');
        this.loadingIndicator = null;
        this.loadingTimeout = null;
        
        this.init();
    }
    
    /**
     * Initialize page transitions
     */
    init() {
        if (!this.container) return;
        
        // Create loading indicator
        this.createLoadingIndicator();
        
        // Listen for internal link clicks
        document.body.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;
            
            // Skip if it's an external link, has target, is a download, or has no href
            if (
                link.getAttribute('target') === '_blank' ||
                link.getAttribute('download') !== null ||
                link.getAttribute('href') === '#' ||
                link.getAttribute('href') === '' ||
                link.getAttribute('href') === null ||
                link.getAttribute('href').startsWith('http') ||
                link.getAttribute('href').startsWith('mailto:') ||
                link.getAttribute('href').startsWith('tel:') ||
                link.classList.contains('no-transition') ||
                e.ctrlKey || e.metaKey || e.shiftKey
            ) {
                return;
            }
            
            this.handleLinkClick(e, link);
        });
        
        // Handle browser back/forward buttons
        window.addEventListener('popstate', this.handlePopState.bind(this));
    }
    
    /**
     * Create the loading indicator element
     */
    createLoadingIndicator() {
        this.loadingIndicator = document.createElement('div');
        this.loadingIndicator.classList.add('page-loading');
        this.loadingIndicator.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <span>Loading...</span>
            </div>
        `;
        document.body.appendChild(this.loadingIndicator);
    }
    
    /**
     * Handle link click events
     */
    handleLinkClick(e, link) {
        e.preventDefault();
        
        if (this.isAnimating) return;
        
        const url = link.getAttribute('href');
        this.loadPage(url);
    }
    
    /**
     * Handle popstate events (browser back/forward buttons)
     */
    handlePopState(e) {
        if (this.isAnimating) return;
        if (e.state) {
            this.loadPage(window.location.pathname, false);
        }
    }
    
    /**
     * Load page content via AJAX
     */
    async loadPage(url, updateHistory = true) {
        this.isAnimating = true;
        
        // Only show loading when network is slow (after 150ms)
        const loadingTimeout = setTimeout(() => {
            this.showLoading();
        }, 150);
        
        try {
            const response = await fetch(url, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'text/html'
                }
            });
            
            // Clear loading timeout if response came back quickly
            clearTimeout(loadingTimeout);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const html = await response.text();
            const content = this.extractPageContent(html);
            
            // Update content immediately for fast response
            this.container.innerHTML = content;
            
            // Update browser history
            if (updateHistory) {
                this.updateHistory(url, document.title);
            }
            
            // Initialize scripts for new content
            this.initializeScripts();
            
            // Finish animation
            this.isAnimating = false;
            this.hideLoading();
        } catch (error) {
            console.error('Error loading page:', error);
            this.isAnimating = false;
            this.hideLoading();
            
            // If error, redirect normally
            window.location.href = url;
        }
    }
    
    /**
     * Extract main content from full HTML
     */
    extractPageContent(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const content = doc.getElementById('page-content');
        
        return content ? content.innerHTML : html;
    }
    
    /**
     * Update browser history
     */
    updateHistory(url, title) {
        window.history.pushState({}, title, url);
    }
    
    /**
     * Show loading indicator
     */
    showLoading() {
        // Clear previous timeout
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
        }
        
        // Show loading after a short delay to avoid flashing for fast loads
        this.loadingTimeout = setTimeout(() => {
            this.loadingIndicator.classList.add('active');
        }, 200);
    }
    
    /**
     * Hide loading indicator
     */
    hideLoading() {
        // Clear timeout
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
        }
        
        // Hide loading indicator
        this.loadingIndicator.classList.remove('active');
    }
    
    /**
     * Re-initialize scripts and components after page load
     */
    initializeScripts() {
        // Re-initialize Feather icons
        if (window.feather) {
            window.feather.replace();
        }
        
        // Re-initialize other components
        const event = new CustomEvent('page:loaded');
        document.dispatchEvent(event);
    }
}

// Initialize page transitions when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pageTransitions = new PageTransitions();
});