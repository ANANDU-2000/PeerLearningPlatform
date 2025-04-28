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
        
        // Video controls
        this.videoToggle = document.getElementById('video-toggle');
        this.videoToggleMini = document.getElementById('video-toggle-mini');
        this.audioToggle = document.getElementById('audio-toggle');
        this.audioToggleMini = document.getElementById('audio-toggle-mini');
        this.screenShareButton = document.getElementById('screen-share');
        this.raiseHandButton = document.getElementById('raise-hand');
        
        // Tab navigation
        this.videosTab = document.getElementById('videos-tab');
        this.chatTab = document.getElementById('chat-tab');
        this.whiteboardTab = document.getElementById('whiteboard-tab');
        this.videosContent = document.getElementById('videos-content');
        this.chatContent = document.getElementById('chat-content');
        this.whiteboardContent = document.getElementById('whiteboard-content');
        
        // Session timer
        this.sessionTimer = document.getElementById('session-timer');
        
        // Whiteboard elements
        this.whiteboardCanvas = document.getElementById('whiteboard-canvas');
        this.whiteboardColorButtons = document.querySelectorAll('[data-color]');
        this.whiteboardLineWidth = document.getElementById('wb-line-width');
        this.whiteboardTools = {
            pen: document.getElementById('wb-pen-tool'),
            rect: document.getElementById('wb-square-tool'),
            circle: document.getElementById('wb-circle-tool'),
            text: document.getElementById('wb-text-tool'),
            eraser: document.getElementById('wb-eraser-tool')
        };
        this.whiteboardActions = {
            undo: document.getElementById('wb-undo'),
            clear: document.getElementById('wb-clear'),
            save: document.getElementById('wb-save')
        };
        this.whiteboardMentorControls = {
            allowAll: document.getElementById('wb-allow-all'),
            disallowAll: document.getElementById('wb-disallow-all')
        };
        
        // WebRTC client
        this.rtc = null;
        
        // Screen share stream
        this.screenStream = null;
        this.isScreenSharing = false;
        
        // Hand raised state
        this.isHandRaised = false;
        
        // Whiteboard controller
        this.whiteboard = null;
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Start session timer if end time is available
        this.startSessionTimer();
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
        
        // Video toggle buttons (main and mini)
        if (this.videoToggle) {
            this.videoToggle.addEventListener('click', () => {
                this.toggleVideo();
            });
        }
        
        if (this.videoToggleMini) {
            this.videoToggleMini.addEventListener('click', () => {
                this.toggleVideo();
            });
        }
        
        // Audio toggle buttons (main and mini)
        if (this.audioToggle) {
            this.audioToggle.addEventListener('click', () => {
                this.toggleAudio();
            });
        }
        
        if (this.audioToggleMini) {
            this.audioToggleMini.addEventListener('click', () => {
                this.toggleAudio();
            });
        }
        
        // Screen sharing
        if (this.screenShareButton) {
            this.screenShareButton.addEventListener('click', () => {
                this.toggleScreenSharing();
            });
        }
        
        // Raise hand (for learners)
        if (this.raiseHandButton) {
            this.raiseHandButton.addEventListener('click', () => {
                this.toggleRaiseHand();
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
                this.initWhiteboard();
            });
        }
        
        // Whiteboard color selection
        if (this.whiteboardColorButtons) {
            this.whiteboardColorButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const color = button.getAttribute('data-color');
                    this.setWhiteboardColor(color);
                    
                    // Update UI
                    this.whiteboardColorButtons.forEach(b => b.classList.remove('ring-2'));
                    button.classList.add('ring-2');
                });
            });
        }
        
        // Whiteboard tool selection
        if (this.whiteboardTools) {
            Object.keys(this.whiteboardTools).forEach(tool => {
                const button = this.whiteboardTools[tool];
                if (button) {
                    button.addEventListener('click', () => {
                        this.setWhiteboardTool(tool);
                        
                        // Update UI
                        Object.values(this.whiteboardTools).forEach(b => {
                            b.classList.remove('bg-gray-200');
                        });
                        button.classList.add('bg-gray-200');
                    });
                }
            });
        }
        
        // Whiteboard actions
        if (this.whiteboardActions.undo) {
            this.whiteboardActions.undo.addEventListener('click', () => {
                this.undoWhiteboard();
            });
        }
        
        if (this.whiteboardActions.clear) {
            this.whiteboardActions.clear.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear the whiteboard?')) {
                    this.clearWhiteboard();
                }
            });
        }
        
        if (this.whiteboardActions.save) {
            this.whiteboardActions.save.addEventListener('click', () => {
                this.saveWhiteboard();
            });
        }
        
        // Whiteboard mentor controls
        if (this.whiteboardMentorControls.allowAll) {
            this.whiteboardMentorControls.allowAll.addEventListener('click', () => {
                this.setWhiteboardPermissions(true);
            });
        }
        
        if (this.whiteboardMentorControls.disallowAll) {
            this.whiteboardMentorControls.disallowAll.addEventListener('click', () => {
                this.setWhiteboardPermissions(false);
            });
        }
        
        // Window beforeunload event
        window.addEventListener('beforeunload', (e) => {
            // Close connections gracefully
            if (this.rtc) {
                this.rtc.close();
            }
            
            // Stop screen sharing if active
            this.stopScreenSharing();
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
     * Show error message with better user feedback
     */
    showErrorMessage(message) {
        console.error("WebRTC error:", message);
        
        // Parse the error message to provide more user-friendly information
        let userMessage = '';
        
        // Customize message based on error type
        if (typeof message === 'string') {
            if (message.includes('camera') || message.includes('microphone') || 
                message.includes('NotAllowedError') || message.includes('PermissionDeniedError')) {
                userMessage = 'Camera or microphone access was denied. Please check your browser permissions and try again.';
            } else if (message.includes('WebSocket') || message.includes('connection')) {
                userMessage = 'Connection to the session server failed. Please check your internet connection and refresh the page.';
            } else if (message.includes('ICE') || message.includes('peer')) {
                userMessage = 'Failed to establish connection with other participants. This may be due to network restrictions or firewall settings.';
            } else {
                userMessage = message;
            }
        } else {
            userMessage = 'An error occurred with the video connection. Please refresh the page to try again.';
        }
        
        // Use the global notification system if available
        if (typeof window.showNotification === 'function') {
            window.showNotification(userMessage, 'error', 8000);
            return;
        }
        
        // Create a more visually appealing error element
        const errorContainer = document.createElement('div');
        errorContainer.className = 'fixed top-4 left-0 right-0 mx-auto w-96 bg-red-600 text-white py-3 px-4 rounded-md shadow-lg z-50';
        errorContainer.style.maxWidth = '90%';
        
        // Create inner content with icon
        errorContainer.innerHTML = `
            <div class="flex items-center">
                <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
                <div>
                    <h3 class="font-bold">Connection Error</h3>
                    <p class="text-sm">${userMessage}</p>
                </div>
            </div>
            <button class="absolute top-2 right-2 text-white hover:text-gray-200" id="close-error">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        `;
        
        // Add to page
        document.body.appendChild(errorContainer);
        
        // Add error class to video container for visual indication
        const localVideoContainer = document.querySelector('.video-container');
        if (localVideoContainer) {
            localVideoContainer.classList.add('connection-error');
        }
        
        // Add event listener to close button
        const closeButton = errorContainer.querySelector('#close-error');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                errorContainer.classList.add('fade-out');
                setTimeout(() => {
                    if (errorContainer.parentNode) {
                        document.body.removeChild(errorContainer);
                    }
                }, 300);
            });
        }
        
        // Auto-remove after 8 seconds
        setTimeout(() => {
            errorContainer.classList.add('fade-out');
            setTimeout(() => {
                if (errorContainer.parentNode) {
                    document.body.removeChild(errorContainer);
                }
            }, 300);
        }, 8000);
        
        // Show a more subtle error message in the video grid as well
        this.showInlineErrorMessage(userMessage);
    }
    
    /**
     * Show inline error message in the video grid
     */
    showInlineErrorMessage(message) {
        // Only proceed if we have a video grid
        if (!this.videoGrid) return;
        
        // Remove any existing inline error messages
        const existingErrors = this.videoGrid.querySelectorAll('.inline-error-message');
        existingErrors.forEach(el => el.remove());
        
        // Create inline error message
        const inlineError = document.createElement('div');
        inlineError.className = 'inline-error-message p-4 m-2 bg-red-50 border border-red-200 text-red-800 rounded-lg';
        inlineError.innerHTML = `
            <div class="flex items-center mb-2">
                <svg class="w-5 h-5 mr-2 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                </svg>
                <span class="font-medium">Connection Issue</span>
            </div>
            <p class="ml-7 text-sm">${message}</p>
            <div class="mt-3 ml-7">
                <button class="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 transition" onclick="location.reload()">
                    Refresh Page
                </button>
            </div>
        `;
        
        // Add to the video grid
        this.videoGrid.insertBefore(inlineError, this.videoGrid.firstChild);
    }

    /**
     * Leave the session
     */
    leaveSession() {
        if (this.rtc) {
            this.rtc.close();
        }
        
        // Stop screen sharing if active
        this.stopScreenSharing();
        
        // Redirect back to dashboard
        const dashboardUrl = document.querySelector('meta[name="dashboard-url"]').getAttribute('content');
        window.location.href = dashboardUrl;
    }

    /**
     * Start the session timer countdown
     */
    startSessionTimer() {
        if (!this.sessionTimer) return;
        
        const endTimeStr = this.sessionTimer.getAttribute('data-end-time');
        if (!endTimeStr) return;
        
        const endTime = new Date(endTimeStr);
        
        // Update timer every second
        this.timerInterval = setInterval(() => {
            const now = new Date();
            const diff = endTime - now;
            
            if (diff <= 0) {
                // Session has ended
                clearInterval(this.timerInterval);
                this.sessionTimer.textContent = "00:00:00";
                this.addSystemMessage("The session time has ended. You can continue using this room, but you won't be able to rejoin if you leave.");
                return;
            }
            
            // Calculate hours, minutes, seconds
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            
            // Format time as HH:MM:SS
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            this.sessionTimer.textContent = timeStr;
            
            // Warning when 5 minutes left
            if (diff <= 5 * 60 * 1000 && diff > 4.9 * 60 * 1000) {
                this.addSystemMessage("⚠️ The session will end in 5 minutes.");
                this.showNotification("Session ending in 5 minutes");
            }
            
            // Warning when 1 minute left
            if (diff <= 60 * 1000 && diff > 59 * 1000) {
                this.addSystemMessage("⚠️ The session will end in 1 minute.");
                this.showNotification("Session ending in 1 minute");
            }
        }, 1000);
    }

    /**
     * Toggle screen sharing
     */
    async toggleScreenSharing() {
        if (this.isScreenSharing) {
            this.stopScreenSharing();
            return;
        }
        
        try {
            // Get screen stream
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always'
                },
                audio: false
            });
            
            // Update button
            if (this.screenShareButton) {
                this.screenShareButton.innerHTML = '<i data-feather="monitor" class="h-5 w-5 text-red-500"></i>';
                if (typeof feather !== 'undefined') {
                    feather.replace();
                }
            }
            
            // Create a new video element for the screen share
            const screenVideoContainer = document.createElement('div');
            screenVideoContainer.className = 'video-container mentor bg-gray-900';
            screenVideoContainer.id = 'screen-share-container';
            
            const screenVideo = document.createElement('video');
            screenVideo.autoplay = true;
            screenVideo.playsInline = true;
            screenVideo.id = 'screen-share-video';
            screenVideo.srcObject = this.screenStream;
            
            const screenLabel = document.createElement('div');
            screenLabel.className = 'label';
            screenLabel.textContent = 'Your Screen';
            
            screenVideoContainer.appendChild(screenVideo);
            screenVideoContainer.appendChild(screenLabel);
            
            // Add to video grid
            if (this.videoGrid) {
                this.videoGrid.appendChild(screenVideoContainer);
                
                // Reorganize layout to accommodate screen share
                this.videoGrid.className = 'grid grid-cols-2 gap-4 h-full';
            }
            
            // Set flag
            this.isScreenSharing = true;
            
            // Handle stream end
            this.screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                this.stopScreenSharing();
            });
            
            // Add a system message
            this.addSystemMessage("You started sharing your screen.");
            
            // Send notification to other participants via signaling
            if (this.rtc) {
                this.rtc.sendSignalingMessage({
                    type: 'screen_share',
                    action: 'start'
                });
            }
        } catch (error) {
            console.error('Error starting screen share:', error);
            this.showErrorMessage('Failed to start screen sharing. ' + error.message);
        }
    }

    /**
     * Stop screen sharing
     */
    stopScreenSharing() {
        if (!this.isScreenSharing || !this.screenStream) return;
        
        // Stop all tracks
        this.screenStream.getTracks().forEach(track => track.stop());
        
        // Update button
        if (this.screenShareButton) {
            this.screenShareButton.innerHTML = '<i data-feather="monitor" class="h-5 w-5"></i>';
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        }
        
        // Remove video element
        const screenContainer = document.getElementById('screen-share-container');
        if (screenContainer && this.videoGrid) {
            this.videoGrid.removeChild(screenContainer);
            
            // Restore original layout
            this.videoGrid.className = 'grid grid-cols-1 gap-4 h-full';
        }
        
        // Reset variables
        this.screenStream = null;
        this.isScreenSharing = false;
        
        // Add a system message
        this.addSystemMessage("You stopped sharing your screen.");
        
        // Send notification to other participants via signaling
        if (this.rtc) {
            this.rtc.sendSignalingMessage({
                type: 'screen_share',
                action: 'stop'
            });
        }
    }

    /**
     * Toggle raise hand feature
     */
    toggleRaiseHand() {
        this.isHandRaised = !this.isHandRaised;
        
        // Update button UI
        if (this.raiseHandButton) {
            this.raiseHandButton.classList.toggle('bg-yellow-500', this.isHandRaised);
            this.raiseHandButton.classList.toggle('text-white', this.isHandRaised);
        }
        
        // Send notification to participants
        if (this.rtc) {
            this.rtc.sendSignalingMessage({
                type: 'raise_hand',
                raised: this.isHandRaised
            });
        }
        
        // Show message in chat
        if (this.isHandRaised) {
            this.addSystemMessage("You raised your hand. The mentor will be notified.");
        } else {
            this.addSystemMessage("You lowered your hand.");
        }
    }

    /**
     * Handle when a participant raises their hand
     */
    handleRaiseHand(data) {
        // Find participant in the list
        const participantItem = document.querySelector(`[data-user-id="${data.from_user_id}"]`);
        
        if (participantItem) {
            // Add/remove hand icon
            const handIcon = participantItem.querySelector('.hand-icon');
            
            if (data.raised) {
                if (!handIcon) {
                    const icon = document.createElement('span');
                    icon.className = 'hand-icon ml-2 text-yellow-500';
                    icon.innerHTML = '✋';
                    participantItem.appendChild(icon);
                }
            } else {
                if (handIcon) {
                    handIcon.remove();
                }
            }
        }
        
        // Show notification for raised hands
        if (data.raised) {
            this.showNotification(`${data.user_name} raised their hand`);
            this.addSystemMessage(`${data.user_name} raised their hand.`);
        } else {
            this.addSystemMessage(`${data.user_name} lowered their hand.`);
        }
    }

    /**
     * Initialize whiteboard
     */
    initWhiteboard() {
        if (this.whiteboard || !this.whiteboardCanvas) return;
        
        // Set canvas dimensions
        const container = this.whiteboardCanvas.parentElement;
        this.whiteboardCanvas.width = container.offsetWidth;
        this.whiteboardCanvas.height = container.offsetHeight;
        
        // Initialize drawing context
        const ctx = this.whiteboardCanvas.getContext('2d');
        
        // Configure defaults
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Drawing state
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.drawingHistory = [];
        this.currentPath = [];
        this.currentTool = 'pen';
        
        // Event listeners
        this.whiteboardCanvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.whiteboardCanvas.addEventListener('mousemove', this.draw.bind(this));
        this.whiteboardCanvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.whiteboardCanvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        
        // Touch support
        this.whiteboardCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.whiteboardCanvas.dispatchEvent(mouseEvent);
        });
        
        this.whiteboardCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.whiteboardCanvas.dispatchEvent(mouseEvent);
        });
        
        this.whiteboardCanvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            this.whiteboardCanvas.dispatchEvent(mouseEvent);
        });
        
        // Set active whiteboard
        this.whiteboard = {
            canvas: this.whiteboardCanvas,
            context: ctx
        };
        
        // Add welcome message
        this.addSystemMessage("Whiteboard is active. You can draw and collaborate in real-time.");
    }

    /**
     * Start drawing on whiteboard
     */
    startDrawing(e) {
        const ctx = this.whiteboard?.context;
        if (!ctx) return;
        
        this.isDrawing = true;
        
        // Get mouse position relative to canvas
        const rect = this.whiteboardCanvas.getBoundingClientRect();
        this.lastX = e.clientX - rect.left;
        this.lastY = e.clientY - rect.top;
        
        // Start a new path
        this.currentPath = [{
            x: this.lastX,
            y: this.lastY,
            color: ctx.strokeStyle,
            width: ctx.lineWidth,
            tool: this.currentTool
        }];
    }

    /**
     * Draw on whiteboard
     */
    draw(e) {
        if (!this.isDrawing || !this.whiteboard?.context) return;
        
        const ctx = this.whiteboard.context;
        
        // Get current mouse position
        const rect = this.whiteboardCanvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        // Draw based on selected tool
        if (this.currentTool === 'pen') {
            ctx.beginPath();
            ctx.moveTo(this.lastX, this.lastY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();
        } else if (this.currentTool === 'eraser') {
            // For eraser, draw in white with larger width
            const originalStyle = ctx.strokeStyle;
            const originalWidth = ctx.lineWidth;
            
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = originalWidth * 3;
            
            ctx.beginPath();
            ctx.moveTo(this.lastX, this.lastY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();
            
            // Restore original style
            ctx.strokeStyle = originalStyle;
            ctx.lineWidth = originalWidth;
        }
        
        // Add point to current path
        this.currentPath.push({
            x: currentX,
            y: currentY,
            color: ctx.strokeStyle,
            width: ctx.lineWidth,
            tool: this.currentTool
        });
        
        // Update position
        this.lastX = currentX;
        this.lastY = currentY;
        
        // Send drawing data to others
        this.sendWhiteboardData();
    }

    /**
     * Stop drawing on whiteboard
     */
    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            
            // Save current path to history for undo
            this.drawingHistory.push(this.currentPath);
            this.currentPath = [];
        }
    }

    /**
     * Send whiteboard data to participants
     */
    sendWhiteboardData() {
        if (!this.rtc || this.currentPath.length < 2) return;
        
        // Send only the last two points to reduce data volume
        const dataToSend = this.currentPath.slice(-2);
        
        this.rtc.sendSignalingMessage({
            type: 'whiteboard_data',
            data: dataToSend
        });
    }

    /**
     * Receive and process whiteboard data from other participants
     */
    handleWhiteboardData(data) {
        if (!this.whiteboard?.context || !data.data || data.data.length < 2) return;
        
        const ctx = this.whiteboard.context;
        const points = data.data;
        
        // Draw received data
        const originalStyle = ctx.strokeStyle;
        const originalWidth = ctx.lineWidth;
        
        ctx.strokeStyle = points[0].color;
        ctx.lineWidth = points[0].width;
        
        if (points[0].tool === 'pen' || points[0].tool === 'eraser') {
            // For eraser, use white color
            if (points[0].tool === 'eraser') {
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = points[0].width * 3;
            }
            
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(points[1].x, points[1].y);
            ctx.stroke();
        }
        
        // Restore original style
        ctx.strokeStyle = originalStyle;
        ctx.lineWidth = originalWidth;
    }

    /**
     * Set whiteboard color
     */
    setWhiteboardColor(color) {
        if (!this.whiteboard?.context) return;
        this.whiteboard.context.strokeStyle = color;
    }

    /**
     * Set whiteboard tool
     */
    setWhiteboardTool(tool) {
        this.currentTool = tool;
    }

    /**
     * Undo last whiteboard action
     */
    undoWhiteboard() {
        if (!this.whiteboard?.context || this.drawingHistory.length === 0) return;
        
        // Remove last path from history
        this.drawingHistory.pop();
        
        // Clear canvas
        this.clearWhiteboard(false);
        
        // Redraw all paths in history
        const ctx = this.whiteboard.context;
        
        this.drawingHistory.forEach(path => {
            if (path.length < 2) return;
            
            for (let i = 1; i < path.length; i++) {
                const p1 = path[i - 1];
                const p2 = path[i];
                
                const originalStyle = ctx.strokeStyle;
                const originalWidth = ctx.lineWidth;
                
                ctx.strokeStyle = p1.color;
                ctx.lineWidth = p1.width;
                
                if (p1.tool === 'pen' || p1.tool === 'eraser') {
                    // For eraser, use white color
                    if (p1.tool === 'eraser') {
                        ctx.strokeStyle = '#FFFFFF';
                        ctx.lineWidth = p1.width * 3;
                    }
                    
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
                
                // Restore original style
                ctx.strokeStyle = originalStyle;
                ctx.lineWidth = originalWidth;
            }
        });
        
        // Notify other participants
        if (this.rtc) {
            this.rtc.sendSignalingMessage({
                type: 'whiteboard_undo'
            });
        }
    }

    /**
     * Clear whiteboard
     */
    clearWhiteboard(notify = true) {
        if (!this.whiteboard?.context) return;
        
        const ctx = this.whiteboard.context;
        ctx.clearRect(0, 0, this.whiteboardCanvas.width, this.whiteboardCanvas.height);
        
        if (notify) {
            // Clear history
            this.drawingHistory = [];
            
            // Notify other participants
            if (this.rtc) {
                this.rtc.sendSignalingMessage({
                    type: 'whiteboard_clear'
                });
            }
        }
    }

    /**
     * Save whiteboard as image
     */
    saveWhiteboard() {
        if (!this.whiteboardCanvas) return;
        
        // Create a temporary link
        const link = document.createElement('a');
        link.download = `peerlearn-whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
        
        // Convert canvas to data URL
        link.href = this.whiteboardCanvas.toDataURL('image/png');
        
        // Simulate click to trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showNotification('Whiteboard saved as PNG image');
    }

    /**
     * Set whiteboard permissions
     */
    setWhiteboardPermissions(allowAll) {
        if (!this.rtc) return;
        
        // Send permission update to all participants
        this.rtc.sendSignalingMessage({
            type: 'whiteboard_permissions',
            allowAll: allowAll
        });
        
        // Add system message
        const message = allowAll ? 
            "All participants can now draw on the whiteboard." : 
            "Drawing on the whiteboard is now disabled for participants.";
        
        this.addSystemMessage(message);
        this.showNotification(message);
    }
}