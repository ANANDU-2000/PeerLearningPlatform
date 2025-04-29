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
        
        // Network quality indicator
        this.networkQualityIndicator = document.getElementById('network-quality');
        
        // Video buffering detection
        this.videoBufferingDetection = {
            enabled: true,
            checkInterval: null,
            lastPlayingState: true
        };
        
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
            onError: this.handleError.bind(this),
            onConnectionStateChange: this.handleConnectionStateChange.bind(this),
            onSessionReconnect: this.handleSessionReconnect.bind(this),
            onRejoinSuccess: this.handleRejoinSuccess.bind(this),
            onRejoinFailure: this.handleRejoinFailure.bind(this),
            debugMode: true
        });
        
        this.rtc.init();
        
        // Start video buffering detection
        this.startBufferingDetection();
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
        let errorType = 'error';  // Default error type
        let errorTimeout = 8000;  // Default timeout duration
        let isReconnecting = false;  // Flag for reconnection messages
        let errorClass = 'bg-red-600 text-white';  // Default styling
        let errorTitle = 'Connection Error';  // Default title
        
        // Customize message based on error type
        if (typeof message === 'string') {
            // Media device access issues
            if (message.includes('camera') || message.includes('microphone') || 
                message.includes('NotAllowedError') || message.includes('PermissionDeniedError')) {
                userMessage = 'Camera or microphone access was denied. Please check your browser permissions and try again.';
                errorType = 'media';
                errorTitle = 'Media Access Error';
                
            // Device not available errors
            } else if (message.includes('NotFoundError') || message.includes('NotReadableError') || 
                       message.includes('OverconstrainedError') || message.includes('TrackStartError')) {
                userMessage = 'Could not access your camera or microphone. Please verify your device is connected and not in use by another application.';
                errorType = 'device';
                errorTitle = 'Device Error';
                
            // WebSocket connection issues
            } else if (message.includes('WebSocket') || message.includes('connection')) {
                // Reconnecting messages are informational, not errors
                if (message.includes('reconnecting') || message.includes('Reconnecting') || 
                    message.includes('Attempt') || message.includes('attempt')) {
                    isReconnecting = true;
                    userMessage = message; // Use original message
                    errorType = 'reconnecting';
                    errorTitle = 'Reconnecting';
                    errorClass = 'bg-yellow-500 text-white';
                    errorTimeout = 4000; // Shorter timeout for status updates
                } else if (message.includes('re-established') || message.includes('recovered')) {
                    userMessage = 'Connection restored successfully!';
                    errorType = 'success';
                    errorTitle = 'Connected';
                    errorClass = 'bg-green-600 text-white';
                    errorTimeout = 3000; // Even shorter timeout for success messages
                } else {
                    // Check network conditions if available
                    let networkInfo = '';
                    if (navigator.connection) {
                        const effectiveType = navigator.connection.effectiveType || "unknown";
                        const downlink = navigator.connection.downlink || 0;
                        
                        if (effectiveType === '2g' || downlink < 0.5) {
                            networkInfo = " Your network connection appears to be very slow. If possible, switch to a better network.";
                        } else if (effectiveType === '3g' || downlink < 2) {
                            networkInfo = " Your network connection is moderate. Video quality might be reduced.";
                        }
                    }
                    
                    userMessage = 'Connection to the session server failed. Please check your internet connection and refresh the page.' + networkInfo;
                    userMessage += '\n\nTroubleshooting tips:\n• Try refreshing the page\n• Check if other sites work\n• Try using a wired connection if on Wi-Fi\n• Restart your router if problems persist';
                }
                
            // ICE connection issues (peer-to-peer connectivity)
            } else if (message.includes('ICE') || message.includes('peer') || 
                       message.includes('STUN') || message.includes('TURN')) {
                userMessage = 'Failed to establish direct connection with other participants. This may be due to network firewall restrictions.';
                
                // Add troubleshooting suggestions
                userMessage += '\n\nTry these steps:\n• If you\'re on a corporate/school network, try a different network\n• Disable VPN if you\'re using one\n• Try a different browser\n• If problems persist, the session may need to be rescheduled on a more compatible network';
                errorType = 'ice';
                
            // Client-side errors and fallbacks
            } else if (message.includes('browser') || message.includes('support')) {
                userMessage = 'Your browser may have limited support for video calls. For best experience, use Chrome, Firefox, or Safari.';
                errorType = 'browser';
                errorTitle = 'Browser Support Issue';
            } else {
                // Default case - use the original message
                userMessage = message;
            }
        } else {
            // For non-string messages
            userMessage = 'An error occurred with the video connection. Please refresh the page to try again.';
        }
        
        // Use the global notification system if available
        if (typeof window.showNotification === 'function') {
            window.showNotification(userMessage, errorType === 'success' ? 'success' : 'error', errorTimeout);
            return;
        }
        
        // Create a more visually appealing error element
        const errorContainer = document.createElement('div');
        errorContainer.className = `fixed top-4 left-0 right-0 mx-auto w-96 ${errorClass} py-3 px-4 rounded-md shadow-lg z-50`;
        errorContainer.style.maxWidth = '90%';
        
        // Choose icon based on error type
        let iconPath = '';
        if (errorType === 'success') {
            iconPath = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>';
        } else if (errorType === 'reconnecting') {
            iconPath = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>';
        } else if (errorType === 'media' || errorType === 'device') {
            iconPath = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>';
        } else {
            // Default warning icon
            iconPath = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>';
        }
        
        // Create inner content with icon
        errorContainer.innerHTML = `
            <div class="flex items-center">
                <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    ${iconPath}
                </svg>
                <div>
                    <h3 class="font-bold">${errorTitle}</h3>
                    <p class="text-sm">${userMessage}</p>
                    ${(!isReconnecting) ? '<p class="text-xs mt-1">You can <button id="refresh-page" class="underline">refresh the page</button> to try again</p>' : ''}
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
        
        // Add refresh page functionality if present
        const refreshButton = errorContainer.querySelector('#refresh-page');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                window.location.reload();
            });
        }
        
        // Only add error styling to video for connection errors
        if (['error', 'ice', 'reconnecting'].includes(errorType)) {
            // Add error class to video container for visual indication
            const localVideoContainer = document.querySelector('.video-container');
            if (localVideoContainer) {
                localVideoContainer.classList.add('connection-error');
                
                // Remove the error class after reconnection
                if (errorType === 'success') {
                    localVideoContainer.classList.remove('connection-error');
                }
            }
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
        
        // Auto-remove after timeout (except for critical errors that need attention)
        if (errorType !== 'critical') {
            setTimeout(() => {
                if (errorContainer.parentNode) {
                    errorContainer.classList.add('fade-out');
                    setTimeout(() => {
                        if (errorContainer.parentNode) {
                            document.body.removeChild(errorContainer);
                        }
                    }, 300);
                }
            }, errorTimeout);
        }
        
        // For connection errors, also show a more subtle message in the video grid
        if (['error', 'ice', 'browser'].includes(errorType)) {
            this.showInlineErrorMessage(userMessage);
        }
        
        // For reconnection success, also add a system message in chat
        if (errorType === 'success') {
            this.addSystemMessage('🟢 Connection restored successfully!');
        } else if (errorType === 'reconnecting') {
            this.addSystemMessage('🟠 Attempting to reconnect to session...');
        }
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
    toggleScreenSharing: function() {
        var self = this;
        
        if (this.isScreenSharing) {
            this.stopScreenSharing();
            return;
        }
        
        try {
            // Get screen stream
            navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always'
                },
                audio: false
            }).then(function(stream) {
                self.screenStream = stream;
                
                // Update button
                if (self.screenShareButton) {
                    self.screenShareButton.innerHTML = '<i data-feather="monitor" class="h-5 w-5 text-red-500"></i>';
                    if (typeof feather !== 'undefined') {
                        feather.replace();
                    }
                }
                
                // Create a new video element for the screen share
                var screenVideoContainer = document.createElement('div');
                screenVideoContainer.className = 'video-container mentor bg-gray-900';
                screenVideoContainer.id = 'screen-share-container';
                
                var screenVideo = document.createElement('video');
                screenVideo.autoplay = true;
                screenVideo.playsInline = true;
                screenVideo.id = 'screen-share-video';
                screenVideo.srcObject = self.screenStream;
                
                var screenLabel = document.createElement('div');
                screenLabel.className = 'label';
                screenLabel.textContent = 'Your Screen';
                
                screenVideoContainer.appendChild(screenVideo);
                screenVideoContainer.appendChild(screenLabel);
                
                // Add to video grid
                if (self.videoGrid) {
                    self.videoGrid.appendChild(screenVideoContainer);
                    
                    // Reorganize layout to accommodate screen share
                    self.videoGrid.className = 'grid grid-cols-2 gap-4 h-full';
                }
                
                // Set flag
                self.isScreenSharing = true;
                
                // Handle stream end
                self.screenStream.getVideoTracks()[0].addEventListener('ended', function() {
                    self.stopScreenSharing();
                });
                
                // Add a system message
                self.addSystemMessage("You started sharing your screen.");
                
                // Send notification to other participants via signaling
                if (self.rtc) {
                    self.rtc.sendSignalingMessage({
                        type: 'screen_share',
                        action: 'start'
                    });
                }
            }).catch(function(error) {
                console.error('Error starting screen share:', error);
                self.showErrorMessage('Failed to start screen sharing. ' + error.message);
            });
        } catch (error) {
            console.error('Error starting screen share:', error);
            this.showErrorMessage('Failed to start screen sharing. ' + error.message);
        }
    }

    /**
     * Stop screen sharing
     */
    stopScreenSharing: function() {
        if (!this.isScreenSharing || !this.screenStream) return;
        
        // Stop all tracks
        var tracks = this.screenStream.getTracks();
        for (var i = 0; i < tracks.length; i++) {
            tracks[i].stop();
        }
        
        // Update button
        if (this.screenShareButton) {
            this.screenShareButton.innerHTML = '<i data-feather="monitor" class="h-5 w-5"></i>';
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        }
        
        // Remove video element
        var screenContainer = document.getElementById('screen-share-container');
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
    
    /**
     * Handle connection state changes and update network quality indicator
     */
    handleConnectionStateChange(data) {
        console.log(`Connection state changed for ${data.userId}: ${data.state} (was: ${data.previous})`);
        
        // Update network quality indicator based on connection state
        if (this.networkQualityIndicator) {
            let qualityLevel = 'good';
            let qualityText = 'Good';
            
            // Determine quality based on connection state
            if (data.state === 'disconnected' || data.state === 'failed' || data.state === 'closed') {
                qualityLevel = 'poor';
                qualityText = 'Poor';
            } else if (data.state === 'connecting' || data.state === 'checking') {
                qualityLevel = 'medium';
                qualityText = 'Connecting...';
            } else if (data.state === 'connected' || data.state === 'completed') {
                // Connection is good, but we should check stats for a more accurate assessment
                if (this.rtc && this.rtc.connectionHealth && this.rtc.connectionHealth[data.userId]) {
                    // Further refine based on connection health if available
                }
            }
            
            // Update the indicator
            this.updateNetworkQualityIndicator(qualityLevel, qualityText);
            
            // If connection was restored after being poor, show a message
            if ((data.previous === 'disconnected' || data.previous === 'failed') && 
                (data.state === 'connected' || data.state === 'completed')) {
                this.showNotification('Connection restored!');
            }
        }
    }
    
    /**
     * Update the network quality indicator in the UI
     */
    updateNetworkQualityIndicator(quality, text) {
        if (!this.networkQualityIndicator) return;
        
        // Remove all quality classes
        this.networkQualityIndicator.classList.remove('good', 'medium', 'poor');
        
        // Add the current quality class
        this.networkQualityIndicator.classList.add(quality);
        
        // Update the text
        const textElement = this.networkQualityIndicator.querySelector('span');
        if (textElement) {
            textElement.textContent = text;
        }
    }
    
    /**
     * Start buffering detection for video elements
     */
    startBufferingDetection() {
        if (!this.videoBufferingDetection.enabled) return;
        
        // Clear existing interval if any
        if (this.videoBufferingDetection.checkInterval) {
            clearInterval(this.videoBufferingDetection.checkInterval);
        }
        
        // Check for video buffering every 1 second
        this.videoBufferingDetection.checkInterval = setInterval(() => {
            // Check local video
            this.checkVideoBuffering(document.getElementById('local-video'), document.querySelector('.video-container.mentor'));
            
            // Check remote videos
            document.querySelectorAll('.video-container:not(.mentor) video').forEach(video => {
                this.checkVideoBuffering(video, video.closest('.video-container'));
            });
        }, 1000);
    }
    
    /**
     * Check if a video element is currently buffering
     */
    checkVideoBuffering(videoElement, container) {
        if (!videoElement || !container) return;
        
        // Check if video is actually playing
        const isPlaying = !videoElement.paused && videoElement.currentTime > 0 && 
                         !videoElement.ended && videoElement.readyState > 2;
                         
        // Check if video is stalled (buffering)
        const isStalled = videoElement.readyState < 3 || videoElement.waiting;
        
        // Apply buffering UI if video should be playing but is stalled
        if (!isPlaying && videoElement.srcObject && !videoElement.paused) {
            container.classList.add('buffering');
        } else {
            container.classList.remove('buffering');
        }
        
        // Update network quality if appropriate
        if (!isPlaying && this.videoBufferingDetection.lastPlayingState) {
            this.updateNetworkQualityIndicator('medium', 'Slow Connection');
        } else if (isPlaying && !this.videoBufferingDetection.lastPlayingState) {
            // Connection recovered, update after a short delay to make sure it's stable
            setTimeout(() => {
                this.updateNetworkQualityIndicator('good', 'Good');
            }, 2000);
        }
        
        // Update last playing state
        this.videoBufferingDetection.lastPlayingState = isPlaying;
    }
}