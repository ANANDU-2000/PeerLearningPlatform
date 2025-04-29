/**
 * PeerLearn Page Transitions
 * Handles smooth transitions between pages using AJAX
 * Version 1.0.0
 */

class PageTransitions {
    constructor() {
        this.isTransitioning = false;
        this.cachePages = true;
        this.cache = {};
        this.currentUrl = window.location.href;
        this.container = document.getElementById('page-content') || document.getElementById('main-content');
        this.loadingIndicator = null;
        
        // Configuration
        this.defaultDuration = 350; // Default transition duration in ms
        this.scrollToTop = true;
        
        // Bind methods
        this.init = this.init.bind(this);
        this.loadPage = this.loadPage.bind(this);
        this.handleLinkClick = this.handleLinkClick.bind(this);
        this.showLoading = this.showLoading.bind(this);
        this.hideLoading = this.hideLoading.bind(this);
        this.updateHistory = this.updateHistory.bind(this);
        this.extractPageContent = this.extractPageContent.bind(this);
        this.handlePopState = this.handlePopState.bind(this);
        
        // Initialize
        if (this.container) {
            this.init();
        } else {
            console.warn('Page transitions: No container element found with id "page-content" or "main-content"');
        }
    }
    
    /**
     * Initialize page transitions
     */
    init() {
        // Create loading indicator
        this.createLoadingIndicator();
        
        // Add event listeners for all internal links
        document.addEventListener('click', (e) => {
            // Find closest anchor tag
            const link = e.target.closest('a');
            if (link) {
                this.handleLinkClick(e, link);
            }
        });
        
        // Handle browser back/forward buttons
        window.addEventListener('popstate', this.handlePopState);
        
        console.log('Page transitions initialized');
    }
    
    /**
     * Create the loading indicator element
     */
    createLoadingIndicator() {
        this.loadingIndicator = document.createElement('div');
        this.loadingIndicator.classList.add('loading-overlay');
        this.loadingIndicator.innerHTML = `
            <div class="loading-spinner"></div>
        `;
        this.loadingIndicator.style.opacity = '0';
        this.loadingIndicator.style.transition = `opacity ${this.defaultDuration / 2}ms ease`;
        document.body.appendChild(this.loadingIndicator);
    }
    
    /**
     * Handle link click events
     */
    handleLinkClick(e, link) {
        // Skip if transitioning or no href
        if (this.isTransitioning || !link.href) return;
        
        // Skip links with special attributes
        if (link.getAttribute('target') === '_blank' || 
            link.getAttribute('data-no-transition') ||
            link.getAttribute('download')) {
            return;
        }
        
        // Skip external links, anchor links, or links that open in new tabs
        const url = new URL(link.href);
        const currentUrl = new URL(window.location.href);
        
        if (url.host !== currentUrl.host || // External link
            url.pathname === currentUrl.pathname && url.hash !== '') { // Anchor link
            return;
        }
        
        // Skip links to files (not HTML pages)
        const fileExtension = url.pathname.split('.').pop();
        if (['pdf', 'jpg', 'jpeg', 'png', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar'].includes(fileExtension)) {
            return;
        }
        
        // Skip form submission links
        if (link.closest('form')) {
            return;
        }
        
        // Prevent default link behavior
        e.preventDefault();
        
        // Load the new page
        this.loadPage(link.href);
    }
    
    /**
     * Handle popstate events (browser back/forward buttons)
     */
    handlePopState(e) {
        if (e.state && e.state.url) {
            this.loadPage(e.state.url, false);
        }
    }
    
    /**
     * Load page content via AJAX
     */
    async loadPage(url, updateHistory = true) {
        if (this.isTransitioning) return;
        this.isTransitioning = true;
        
        // Store current URL for history
        const previousUrl = this.currentUrl;
        this.currentUrl = url;
        
        try {
            // Show loading indicator
            this.showLoading();
            
            // Exit animation for current content
            this.container.classList.add('page-exit');
            setTimeout(() => {
                this.container.classList.add('page-exit-active');
            }, 20);
            
            // Fetch new page content (check cache first)
            let html;
            if (this.cachePages && this.cache[url]) {
                html = this.cache[url];
                console.log('Loading page from cache:', url);
            } else {
                const response = await fetch(url, {
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to load page: ${response.status} ${response.statusText}`);
                }
                
                html = await response.text();
                
                // Store in cache if enabled
                if (this.cachePages) {
                    this.cache[url] = html;
                }
            }
            
            // Wait for exit animation to complete
            await new Promise(resolve => setTimeout(resolve, this.defaultDuration));
            
            // Extract content from the loaded HTML
            const newContent = this.extractPageContent(html);
            
            // Update the page content
            this.container.innerHTML = newContent;
            
            // Update the page title
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                document.title = titleMatch[1];
            }
            
            // Update browser history if needed
            if (updateHistory) {
                this.updateHistory(url, document.title);
            }
            
            // Scroll to top if enabled
            if (this.scrollToTop) {
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
            
            // Enter animation for new content
            this.container.classList.remove('page-exit', 'page-exit-active');
            this.container.classList.add('page-enter');
            
            // Wait for browser to process the new elements
            setTimeout(() => {
                this.container.classList.add('page-enter-active');
                
                // Re-initialize scripts and components
                this.initializeScripts();
                
                // Hide loading indicator
                this.hideLoading();
                
                // Remove transition classes after animation completes
                setTimeout(() => {
                    this.container.classList.remove('page-enter', 'page-enter-active');
                    this.isTransitioning = false;
                }, this.defaultDuration);
                
            }, 20);
        } catch (error) {
            console.error('Error loading page:', error);
            this.hideLoading();
            this.isTransitioning = false;
            
            // On error, redirect the old-fashioned way
            window.location.href = url;
        }
    }
    
    /**
     * Extract main content from full HTML
     */
    extractPageContent(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Find the main content container in the loaded HTML
        const newContentContainer = doc.getElementById('page-content') || doc.getElementById('main-content');
        
        if (newContentContainer) {
            return newContentContainer.innerHTML;
        } else {
            console.warn('Could not find content container in loaded page');
            return html;
        }
    }
    
    /**
     * Update browser history
     */
    updateHistory(url, title) {
        window.history.pushState({ url }, title, url);
    }
    
    /**
     * Show loading indicator
     */
    showLoading() {
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = 'flex';
            // Force reflow
            this.loadingIndicator.offsetHeight;
            this.loadingIndicator.style.opacity = '1';
        }
    }
    
    /**
     * Hide loading indicator
     */
    hideLoading() {
        if (this.loadingIndicator) {
            this.loadingIndicator.style.opacity = '0';
            setTimeout(() => {
                this.loadingIndicator.style.display = 'none';
            }, this.defaultDuration / 2);
        }
    }
    
    /**
     * Re-initialize scripts and components after page load
     */
    initializeScripts() {
        // Re-initialize Feather icons
        if (window.feather) {
            window.feather.replace();
        }
        
        // Dispatch custom event for other scripts to listen for
        const pageLoadEvent = new CustomEvent('pageTransitionComplete', {
            detail: {
                url: this.currentUrl
            }
        });
        document.dispatchEvent(pageLoadEvent);
        
        // Re-initialize any inline scripts
        const scripts = this.container.querySelectorAll('script');
        scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });
            newScript.textContent = oldScript.textContent;
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });
    }
}

// Initialize page transitions when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize on pages with the main content container
    if (document.getElementById('page-content') || document.getElementById('main-content')) {
        window.pageTransitions = new PageTransitions();
    }
});