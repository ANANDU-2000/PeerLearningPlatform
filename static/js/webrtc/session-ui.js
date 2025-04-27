/**
 * UI Controller for WebRTC Session Room
 * Manages UI interactions for video sessions
 */

class SessionUIController {
    constructor() {
        // UI elements
        this.videoGrid = document.getElementById('video-grid');
        this.chatMessages = document.getElementById('chat-messages');
        this.chatForm = document.getElementById('chat-form');
        this.chatInput = document.getElementById('chat-input');
        this.leaveButton = document.getElementById('leave-session');
        this.videoToggle = document.getElementById('video-toggle');
        this.audioToggle = document.getElementById('audio-toggle');
        this.whiteboardToggle = document.getElementById('whiteboard-toggle');
        this.videosTab = document.getElementById('videos-tab');
        this.chatTab = document.getElementById('chat-tab');
        this.whiteboardTab = document.getElementById('whiteboard-tab');
        this.videosContent = document.getElementById('videos-content');
        this.chatContent = document.getElementById('chat-content');
        this.whiteboardContent = document.getElementById('whiteboard-content');
        
        // WebRTC client
        this.rtc = null;
        
        // Whiteboard controller
        this.whiteboard = null;
        
        // Initialize event listeners
        this.initEventListeners();
    }

    /**
     * Initialize WebRTC client
     */
    initRTC(config) {
        this.rtc = new PeerLearnRTC({
            ...config,
            onUserJoined: this.handleUserJoined.bind(this),
            onUserLeft: this.handleUserLeft.bind(this),
            onChatMessage: this.handleChatMessage.bind(this),
            onError: this.handleError.bind(this)
        });
        
        this.rtc.init();
    }

    /**
     * Initialize UI event listeners
     */
    initEventListeners() {
        // Leave session button
        if (this.leaveButton) {
            this.leaveButton.addEventListener('click', () => {
                this.leaveSession();
            });
        }
        
        // Video toggle button
        if (this.videoToggle) {
            this.videoToggle.addEventListener('click', () => {
                this.toggleVideo();
            });
        }
        
        // Audio toggle button
        if (this.audioToggle) {
            this.audioToggle.addEventListener('click', () => {
                this.toggleAudio();
            });
        }
        
        // Chat form submission
        if (this.chatForm) {
            this.chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendChatMessage();
            });
        }
        
        // Tab switching
        if (this.videosTab) {
            this.videosTab.addEventListener('click', () => {
                this.switchTab('videos');
            });
        }
        
        if (this.chatTab) {
            this.chatTab.addEventListener('click', () => {
                this.switchTab('chat');
            });
        }
        
        if (this.whiteboardTab) {
            this.whiteboardTab.addEventListener('click', () => {
                this.switchTab('whiteboard');
            });
        }
        
        // Whiteboard toggle
        if (this.whiteboardToggle) {
            this.whiteboardToggle.addEventListener('click', () => {
                this.toggleWhiteboard();
            });
        }
        
        // Window beforeunload event
        window.addEventListener('beforeunload', (e) => {
            // Close connections gracefully
            if (this.rtc) {
                this.rtc.close();
            }
        });
    }

    /**
     * Handle new user joining the session
     */
    handleUserJoined(data) {
        // Display a system message in chat
        this.addSystemMessage(`${data.user_name} has joined the session.`);
        
        // Add a notification on mobile
        this.showNotification(`${data.user_name} has joined`);
    }

    /**
     * Handle user leaving the session
     */
    handleUserLeft(data) {
        // Display a system message in chat
        this.addSystemMessage(`${data.user_name} has left the session.`);
    }

    /**
     * Handle chat message
     */
    handleChatMessage(data) {
        const isSelf = data.from_user_id === this.rtc.userId;
        this.addChatMessage(data.message, data.from_user_name, data.timestamp, isSelf);
        
        // Show notification for new messages if chat tab is not active
        if (!isSelf && !this.chatContent.classList.contains('active')) {
            this.showNotification(`New message from ${data.from_user_name}`);
            
            // Add a badge to the chat tab
            const badge = document.createElement('span');
            badge.className = 'badge';
            this.chatTab.appendChild(badge);
        }
    }

    /**
     * Handle WebRTC errors
     */
    handleError(message) {
        console.error(message);
        this.showErrorMessage(message);
    }

    /**
     * Add chat message to the UI
     */
    addChatMessage(message, userName, timestamp, isSelf) {
        if (!this.chatMessages) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = isSelf ? 'chat-message self' : 'chat-message';
        
        const time = new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        messageElement.innerHTML = `
            <div class="chat-bubble ${isSelf ? 'bg-blue-100' : 'bg-gray-100'}">
                ${!isSelf ? `<span class="font-medium">${userName}</span>: ` : ''}
                <span class="message-text">${message}</span>
                <span class="message-time text-xs text-gray-500">${time}</span>
            </div>
        `;
        
        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    /**
     * Add system message to chat
     */
    addSystemMessage(message) {
        if (!this.chatMessages) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message system';
        
        messageElement.innerHTML = `
            <div class="chat-bubble system bg-gray-200 text-center text-sm py-1">
                ${message}
            </div>
        `;
        
        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    /**
     * Send chat message
     */
    sendChatMessage() {
        if (!this.chatInput || !this.rtc) return;
        
        const message = this.chatInput.value.trim();
        if (message) {
            this.rtc.sendChatMessage(message);
            this.chatInput.value = '';
        }
    }

    /**
     * Toggle local video
     */
    toggleVideo() {
        if (!this.rtc || !this.videoToggle) return;
        
        const enabled = this.rtc.toggleVideo();
        
        // Update button UI
        this.videoToggle.innerHTML = enabled
            ? '<i data-feather="video" class="h-5 w-5"></i>'
            : '<i data-feather="video-off" class="h-5 w-5"></i>';
        
        // Re-initialize feather icons
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }

    /**
     * Toggle local audio
     */
    toggleAudio() {
        if (!this.rtc || !this.audioToggle) return;
        
        const enabled = this.rtc.toggleAudio();
        
        // Update button UI
        this.audioToggle.innerHTML = enabled
            ? '<i data-feather="mic" class="h-5 w-5"></i>'
            : '<i data-feather="mic-off" class="h-5 w-5"></i>';
        
        // Re-initialize feather icons
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }

    /**
     * Switch between tabs (videos, chat, whiteboard)
     */
    switchTab(tabName) {
        // Hide all tab contents
        if (this.videosContent) this.videosContent.classList.add('hidden');
        if (this.chatContent) this.chatContent.classList.add('hidden');
        if (this.whiteboardContent) this.whiteboardContent.classList.add('hidden');
        
        // Remove active class from all tabs
        if (this.videosTab) this.videosTab.classList.remove('active', 'border-blue-500', 'text-blue-600');
        if (this.chatTab) this.chatTab.classList.remove('active', 'border-blue-500', 'text-blue-600');
        if (this.whiteboardTab) this.whiteboardTab.classList.remove('active', 'border-blue-500', 'text-blue-600');
        
        // Show the selected tab content
        if (tabName === 'videos' && this.videosContent) {
            this.videosContent.classList.remove('hidden');
            this.videosTab.classList.add('active', 'border-blue-500', 'text-blue-600');
        } else if (tabName === 'chat' && this.chatContent) {
            this.chatContent.classList.remove('hidden');
            this.chatTab.classList.add('active', 'border-blue-500', 'text-blue-600');
            
            // Remove notification badge when switching to chat
            const badge = this.chatTab.querySelector('.badge');
            if (badge) {
                badge.remove();
            }
        } else if (tabName === 'whiteboard' && this.whiteboardContent) {
            this.whiteboardContent.classList.remove('hidden');
            this.whiteboardTab.classList.add('active', 'border-blue-500', 'text-blue-600');
        }
    }

    /**
     * Toggle whiteboard (unused in this version)
     */
    toggleWhiteboard() {
        // This would implement whiteboard functionality in the future
        console.log("Whiteboard functionality not implemented yet");
    }

    /**
     * Show mobile notification
     */
    showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 left-0 right-0 mx-auto w-64 bg-gray-800 text-white py-2 px-4 rounded-md shadow-lg z-50 text-center';
        notification.style.maxWidth = '80%';
        notification.textContent = message;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    /**
     * Show error message
     */
    showErrorMessage(message) {
        // Create error element
        const error = document.createElement('div');
        error.className = 'fixed top-4 left-0 right-0 mx-auto w-80 bg-red-600 text-white py-2 px-4 rounded-md shadow-lg z-50 text-center';
        error.style.maxWidth = '80%';
        error.textContent = message;
        
        // Add to page
        document.body.appendChild(error);
        
        // Remove after 5 seconds
        setTimeout(() => {
            error.classList.add('fade-out');
            setTimeout(() => {
                document.body.removeChild(error);
            }, 300);
        }, 5000);
    }

    /**
     * Leave the session
     */
    leaveSession() {
        if (this.rtc) {
            this.rtc.close();
        }
        
        // Redirect back to dashboard
        const dashboardUrl = document.querySelector('meta[name="dashboard-url"]').getAttribute('content');
        window.location.href = dashboardUrl;
    }
}