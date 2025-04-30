/**
 * Session room UI management for PeerLearn WebRTC sessions
 * This handles the user interface elements during live video sessions
 * including video containers, controls, chat, and notifications.
 */
class SessionRoomUI {
    /**
     * Create a new SessionRoomUI instance
     * 
     * @param {Object} options - Configuration options with element IDs and user data
     */
    constructor(options) {
        // Store references to UI elements
        this.elements = {};
        
        // Map option IDs to element references
        const elementIds = [
            'localVideoContainer', 'mainVideoContainer', 'localVideo', 
            'connectionStatus', 'connectionStatusBadge', 'chatMessages', 
            'chatInput', 'sendMessageBtn', 'toggleMicBtn', 'toggleCameraBtn', 
            'toggleScreenShareBtn', 'endCallBtn', 'settingsBtn', 
            'settingsModal', 'audioInput', 'videoInput', 'audioOutput',
            'applySettingsBtn', 'enableStatsSwitch', 'connectionStats',
            'statsContent', 'errorModal', 'errorMessage', 'retryConnectionBtn'
        ];
        
        elementIds.forEach(id => {
            if (options[id]) {
                this.elements[id] = 
                    typeof options[id] === 'string' 
                        ? document.getElementById(options[id]) 
                        : options[id];
            }
        });
        
        // User information
        this.userId = options.userId;
        this.userName = options.userName;
        this.isMentor = options.isMentor;
        
        // State
        this.micMuted = false;
        this.cameraOff = false;
        this.screenSharing = false;
        this.statsEnabled = false;
        this.statsInterval = null;
        this.activeRemoteUser = null; // For main display
        this.connectionState = 'disconnected';
        
        // Initialize UI
        this.initializeUI();
    }
    
    /**
     * Initialize UI elements and event listeners
     */
    initializeUI() {
        // Apply role-specific styling
        this.applyRoleStyling();
        
        // Set up responsive layout
        this.setupResponsiveLayout();
        
        // Set up UI elements if they exist
        if (this.elements.settingsBtn) {
            this.elements.settingsBtn.addEventListener('click', () => {
                this.toggleSettings();
            });
        }
        
        if (this.elements.enableStatsSwitch) {
            this.elements.enableStatsSwitch.addEventListener('change', () => {
                this.toggleConnectionStats();
            });
        }
        
        // Setup control button event listeners
        this.setupControlsUI();
        
        // Setup chat UI
        this.setupChatUI();
    }
    
    /**
     * Create and attach the local video element
     */
    createLocalVideoElement() {
        if (!this.elements.localVideoContainer) return;
        
        const videoElement = document.createElement('video');
        videoElement.id = 'localVideo';
        videoElement.autoplay = true;
        videoElement.muted = true; // Always mute local video to prevent echo
        videoElement.playsInline = true;
        
        this.elements.localVideoContainer.appendChild(videoElement);
        this.elements.localVideo = videoElement;
        
        // Add overlay with user name
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        overlay.innerHTML = `
            <p class="font-medium">
                ${this.translations?.you || 'You'} (${this.userName})
                <span class="text-xs ml-2" id="localVideoStatus">
                    <i class="fas fa-microphone-slash text-red-500"></i>
                </span>
            </p>
        `;
        
        this.elements.localVideoContainer.appendChild(overlay);
    }
    
    /**
     * Create and attach a remote video element for a user
     * 
     * @param {string} userId - The user ID
     * @param {string} userName - The user's display name
     * @param {boolean} isRemoteMentor - Whether this user is a mentor
     */
    createRemoteVideoElement(userId, userName, isRemoteMentor = false) {
        if (!this.elements.mainVideoContainer) return;
        
        // Create container for the remote video
        const videoContainer = document.createElement('div');
        videoContainer.id = `remote-container-${userId}`;
        videoContainer.className = 'video-container h-full';
        
        // Create the video element
        const videoElement = document.createElement('video');
        videoElement.id = `remote-video-${userId}`;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        
        // Create overlay with user name
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        overlay.innerHTML = `
            <p class="font-medium">
                ${isRemoteMentor ? 'Mentor' : 'Learner'}: ${userName}
                <span class="text-xs ml-2" id="remoteVideoStatus-${userId}">
                    <i class="fas fa-microphone text-green-500"></i>
                </span>
            </p>
        `;
        
        // Set up the thumbnails in the bottom row
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.id = `thumbnail-${userId}`;
        thumbnailContainer.className = 'video-container';
        thumbnailContainer.style.flex = '0 0 25%';
        
        // Create thumbnail video element (which will be a clone of the stream)
        const thumbnailVideo = document.createElement('video');
        thumbnailVideo.id = `thumbnail-video-${userId}`;
        thumbnailVideo.autoplay = true;
        thumbnailVideo.muted = true;
        thumbnailVideo.playsInline = true;
        
        // Create thumbnail overlay
        const thumbnailOverlay = document.createElement('div');
        thumbnailOverlay.className = 'video-overlay';
        thumbnailOverlay.innerHTML = `
            <p class="font-medium text-sm">
                ${isRemoteMentor ? 'Mentor' : 'Learner'}: ${userName}
            </p>
        `;
        
        // Append elements
        videoContainer.appendChild(videoElement);
        videoContainer.appendChild(overlay);
        
        thumbnailContainer.appendChild(thumbnailVideo);
        thumbnailContainer.appendChild(thumbnailOverlay);
        
        // Add to the main container
        this.elements.mainVideoContainer.innerHTML = '';
        this.elements.mainVideoContainer.appendChild(videoContainer);
        
        // Add thumbnail to the thumbnails row
        if (this.elements.videoThumbnails) {
            this.elements.videoThumbnails.appendChild(thumbnailContainer);
        }
        
        // Set active remote user
        this.activeRemoteUser = userId;
        
        // Add click event to the thumbnail to focus that user
        thumbnailContainer.addEventListener('click', () => {
            this.setActiveParticipant(userId);
        });
        
        return { 
            mainVideo: videoElement, 
            thumbnailVideo: thumbnailVideo
        };
    }
    
    /**
     * Set up the chat UI elements and event handlers
     */
    setupChatUI() {
        if (!this.elements.chatMessages || !this.elements.chatInput || !this.elements.sendMessageBtn) {
            return;
        }
        
        // Handle pressing Enter in the chat input
        this.elements.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
        
        // Handle clicking the send button
        this.elements.sendMessageBtn.addEventListener('click', () => {
            this.sendChatMessage();
        });
    }
    
    /**
     * Send chat message and clear input
     */
    sendChatMessage() {
        if (!this.elements.chatInput) return;
        
        const message = this.elements.chatInput.value.trim();
        if (message) {
            // The actual sending is handled by the WebRTC class
            // This method will be called by the WebRTC class's sendChatMessage
            this.elements.chatInput.value = '';
        }
    }
    
    /**
     * Add a chat message to the UI
     * 
     * @param {Object} messageData - Message data
     * @param {string} messageData.userId - Sender's user ID
     * @param {string} messageData.userName - Sender's display name
     * @param {string} messageData.message - Message content
     * @param {string} messageData.timestamp - ISO timestamp
     * @param {boolean} messageData.isSystem - Whether it's a system message
     * @param {boolean} messageData.isLocal - Whether it's from the local user
     */
    addChatMessage(messageData) {
        if (!this.elements.chatMessages) return;
        
        const { userId, userName, message, timestamp, isSystem, isLocal } = messageData;
        
        // Create message bubble
        const bubble = document.createElement('div');
        
        if (isSystem) {
            bubble.className = 'message-bubble message-system';
            bubble.innerHTML = this.escapeHtml(message);
        } else if (isLocal || userId === this.userId) {
            bubble.className = 'message-bubble message-self';
            bubble.innerHTML = `
                <div class="font-medium text-sm">${this.escapeHtml(userName)}</div>
                <div>${this.escapeHtml(message)}</div>
                <div class="text-xs text-gray-500 text-right mt-1">
                    ${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
            `;
        } else {
            bubble.className = 'message-bubble message-other';
            bubble.innerHTML = `
                <div class="font-medium text-sm">${this.escapeHtml(userName)}</div>
                <div>${this.escapeHtml(message)}</div>
                <div class="text-xs text-gray-500 text-right mt-1">
                    ${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
            `;
        }
        
        // Add the message to the chat area
        this.elements.chatMessages.appendChild(bubble);
        
        // Scroll to bottom
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }
    
    /**
     * Escape HTML to prevent XSS in chat messages
     * 
     * @param {string} text - Text to escape
     * @returns {string} - Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Set up the controls UI elements and event handlers
     */
    setupControlsUI() {
        // Set initial state for control buttons
        if (this.elements.toggleMicBtn) {
            this.elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            this.elements.toggleMicBtn.title = 'Mute microphone';
            this.elements.toggleMicBtn.classList.remove('control-btn-muted');
        }
        
        if (this.elements.toggleCameraBtn) {
            this.elements.toggleCameraBtn.innerHTML = '<i class="fas fa-video"></i>';
            this.elements.toggleCameraBtn.title = 'Turn off camera';
            this.elements.toggleCameraBtn.classList.remove('control-btn-muted');
        }
        
        if (this.elements.toggleScreenShareBtn) {
            this.elements.toggleScreenShareBtn.innerHTML = '<i class="fas fa-desktop"></i>';
            this.elements.toggleScreenShareBtn.title = 'Share your screen';
            this.elements.toggleScreenShareBtn.classList.remove('control-btn-muted');
        }
    }
    
    /**
     * Toggle microphone mute state
     */
    toggleMicrophone() {
        if (!this.elements.toggleMicBtn) return;
        
        this.micMuted = !this.micMuted;
        
        if (this.micMuted) {
            this.elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            this.elements.toggleMicBtn.title = 'Unmute microphone';
            this.elements.toggleMicBtn.classList.add('control-btn-muted');
        } else {
            this.elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            this.elements.toggleMicBtn.title = 'Mute microphone';
            this.elements.toggleMicBtn.classList.remove('control-btn-muted');
        }
        
        // Update local video status
        const localVideoStatus = document.getElementById('localVideoStatus');
        if (localVideoStatus) {
            localVideoStatus.innerHTML = this.micMuted 
                ? '<i class="fas fa-microphone-slash text-red-500"></i>' 
                : '<i class="fas fa-microphone text-green-500"></i>';
        }
    }
    
    /**
     * Toggle camera on/off state
     */
    toggleCamera() {
        if (!this.elements.toggleCameraBtn) return;
        
        this.cameraOff = !this.cameraOff;
        
        if (this.cameraOff) {
            this.elements.toggleCameraBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
            this.elements.toggleCameraBtn.title = 'Turn on camera';
            this.elements.toggleCameraBtn.classList.add('control-btn-muted');
        } else {
            this.elements.toggleCameraBtn.innerHTML = '<i class="fas fa-video"></i>';
            this.elements.toggleCameraBtn.title = 'Turn off camera';
            this.elements.toggleCameraBtn.classList.remove('control-btn-muted');
        }
    }
    
    /**
     * Toggle screen sharing state
     */
    toggleScreenShare() {
        if (!this.elements.toggleScreenShareBtn) return;
        
        this.screenSharing = !this.screenSharing;
        
        if (this.screenSharing) {
            this.elements.toggleScreenShareBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
            this.elements.toggleScreenShareBtn.title = 'Stop sharing';
            this.elements.toggleScreenShareBtn.classList.add('bg-blue-500');
            this.elements.toggleScreenShareBtn.classList.add('text-white');
        } else {
            this.elements.toggleScreenShareBtn.innerHTML = '<i class="fas fa-desktop"></i>';
            this.elements.toggleScreenShareBtn.title = 'Share your screen';
            this.elements.toggleScreenShareBtn.classList.remove('bg-blue-500');
            this.elements.toggleScreenShareBtn.classList.remove('text-white');
        }
    }
    
    /**
     * Raise hand to get attention
     */
    raiseHand() {
        // Implementation could include:
        // 1. Visual indicator in the UI
        // 2. Sending a notification to other participants
        // 3. Playing a sound
        
        console.log('Hand raised feature not fully implemented');
    }
    
    /**
     * Show hand raised notification for remote user
     * 
     * @param {string} userId - User ID of the person raising hand
     * @param {string} userName - Display name of the person raising hand
     */
    showHandRaised(userId, userName) {
        // Implementation could include:
        // 1. Visual indicator on the user's video thumbnail
        // 2. Notification message in chat
        // 3. Alert sound
        
        // Add a system message in chat for now
        this.addChatMessage({
            userId: 'system',
            userName: 'System',
            message: `${userName} has raised their hand.`,
            timestamp: new Date().toISOString(),
            isSystem: true
        });
    }
    
    /**
     * Toggle settings panel
     */
    toggleSettings() {
        if (!this.elements.settingsModal) return;
        
        const modal = bootstrap.Modal.getOrCreateInstance(this.elements.settingsModal);
        modal.toggle();
    }
    
    /**
     * Populate device selection dropdown menus
     */
    populateDeviceSelectors() {
        if (!this.elements.audioInput || !this.elements.videoInput) return;
        
        // Clear existing options first
        this.elements.audioInput.innerHTML = '';
        this.elements.videoInput.innerHTML = '';
        
        if (this.elements.audioOutput) {
            this.elements.audioOutput.innerHTML = '';
        }
        
        // Get device list
        navigator.mediaDevices.enumerateDevices()
            .then(devices => {
                // Group devices by type
                const audioInputs = devices.filter(device => device.kind === 'audioinput');
                const videoInputs = devices.filter(device => device.kind === 'videoinput');
                const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
                
                // Populate audio input devices
                audioInputs.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.text = device.label || `Microphone ${this.elements.audioInput.options.length + 1}`;
                    this.elements.audioInput.appendChild(option);
                });
                
                // Populate video input devices
                videoInputs.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.text = device.label || `Camera ${this.elements.videoInput.options.length + 1}`;
                    this.elements.videoInput.appendChild(option);
                });
                
                // Populate audio output devices if supported
                if (this.elements.audioOutput && typeof HTMLMediaElement.prototype.setSinkId === 'function') {
                    audioOutputs.forEach(device => {
                        const option = document.createElement('option');
                        option.value = device.deviceId;
                        option.text = device.label || `Speaker ${this.elements.audioOutput.options.length + 1}`;
                        this.elements.audioOutput.appendChild(option);
                    });
                } else if (this.elements.audioOutput) {
                    // If setSinkId is not supported
                    const option = document.createElement('option');
                    option.value = 'default';
                    option.text = 'Default speaker (selection not supported in this browser)';
                    this.elements.audioOutput.appendChild(option);
                    this.elements.audioOutput.disabled = true;
                }
            })
            .catch(err => {
                console.error('Error enumerating devices', err);
                
                // Add placeholder options
                const audioInputOption = document.createElement('option');
                audioInputOption.value = 'default';
                audioInputOption.text = 'Default microphone';
                this.elements.audioInput.appendChild(audioInputOption);
                
                const videoInputOption = document.createElement('option');
                videoInputOption.value = 'default';
                videoInputOption.text = 'Default camera';
                this.elements.videoInput.appendChild(videoInputOption);
                
                if (this.elements.audioOutput) {
                    const audioOutputOption = document.createElement('option');
                    audioOutputOption.value = 'default';
                    audioOutputOption.text = 'Default speaker';
                    this.elements.audioOutput.appendChild(audioOutputOption);
                }
            });
    }
    
    /**
     * Set up device selection change handlers
     */
    setupDeviceSelection() {
        // This function is mostly implemented in the WebRTC client
        // See the webrtc_enhanced.js file for implementation details
        console.log('Device selection is handled by WebRTC client');
    }
    
    /**
     * Change audio output (speaker) device
     * 
     * @param {string} deviceId - The ID of the audio output device
     * @returns {boolean} - Whether the change was successful
     */
    changeAudioOutput(deviceId) {
        if (!deviceId || typeof HTMLMediaElement.prototype.setSinkId !== 'function') {
            return false;
        }
        
        // Get all video and audio elements to update their output device
        const mediaElements = document.querySelectorAll('video, audio');
        
        mediaElements.forEach(element => {
            if (element.setSinkId) {
                element.setSinkId(deviceId)
                    .then(() => console.log(`Changed audio output to ${deviceId}`))
                    .catch(err => console.error('Error changing audio output', err));
            }
        });
        
        return true;
    }
    
    /**
     * Toggle display of connection stats
     */
    toggleConnectionStats() {
        if (!this.elements.enableStatsSwitch || !this.elements.connectionStats) return;
        
        this.statsEnabled = this.elements.enableStatsSwitch.checked;
        
        if (this.statsEnabled) {
            this.elements.connectionStats.classList.remove('hidden');
            this.startStatsUpdate();
        } else {
            this.elements.connectionStats.classList.add('hidden');
            this.stopStatsUpdate();
        }
    }
    
    /**
     * Start periodically updating connection stats
     */
    startStatsUpdate() {
        // This requires interaction with the WebRTC client
        // which will be implemented separately
        if (this.elements.statsContent) {
            this.elements.statsContent.textContent = 'Stats collection starting...';
        }
    }
    
    /**
     * Stop updating connection stats
     */
    stopStatsUpdate() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }
    
    /**
     * Confirm and handle ending the call
     */
    confirmEndCall() {
        // Show confirmation dialog
        if (confirm('Are you sure you want to leave this session?')) {
            // Redirect to dashboard
            const dashboardUrl = document.querySelector('meta[name="dashboard-url"]')?.content;
            if (dashboardUrl) {
                window.location.href = dashboardUrl;
            } else {
                window.location.href = this.isMentor ? '/dashboard/mentor/' : '/dashboard/learner/';
            }
        }
    }
    
    /**
     * Update connection state indicators
     * 
     * @param {string} state - The connection state
     */
    updateConnectionState(state) {
        if (!this.elements.connectionStatusBadge || !this.elements.connectionStatus) return;
        
        this.connectionState = state;
        
        // Update status message
        let statusMessage = 'Connecting...';
        let statusClass = 'status-connecting';
        let statusIcon = '<i class="fas fa-sync-alt fa-spin"></i>';
        
        switch (state) {
            case 'connected':
            case 'completed':
                statusMessage = 'Connected';
                statusClass = 'status-connected';
                statusIcon = '<i class="fas fa-check-circle"></i>';
                break;
                
            case 'disconnected':
            case 'failed':
            case 'closed':
                statusMessage = 'Disconnected';
                statusClass = 'status-disconnected';
                statusIcon = '<i class="fas fa-times-circle"></i>';
                break;
                
            case 'checking':
                statusMessage = 'Checking connection...';
                statusClass = 'status-connecting';
                statusIcon = '<i class="fas fa-sync-alt fa-spin"></i>';
                break;
                
            case 'reconnecting':
                statusMessage = 'Reconnecting...';
                statusClass = 'status-connecting';
                statusIcon = '<i class="fas fa-sync-alt fa-spin"></i>';
                break;
                
            default:
                statusMessage = 'Connecting...';
                statusClass = 'status-connecting';
                statusIcon = '<i class="fas fa-sync-alt fa-spin"></i>';
        }
        
        // Update badge
        this.elements.connectionStatusBadge.className = 'connection-status ' + statusClass;
        this.elements.connectionStatusBadge.innerHTML = `${statusIcon} <span>${statusMessage}</span>`;
        
        // Update status text
        this.elements.connectionStatus.textContent = statusMessage;
        
        // Update main container based on connection state
        if (state === 'connected' || state === 'completed') {
            const loadingIndicator = this.elements.mainVideoContainer.querySelector('.loading-spinner')?.parentNode;
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
        }
    }
    
    /**
     * Show a notification in the UI
     * 
     * @param {string} message - The notification message
     * @param {string} type - The notification type (info, warning, error, success)
     * @param {number} duration - The notification duration in ms
     */
    showNotification(message, type = 'info', duration = 3000) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${type === 'info' ? 'fa-info-circle' : 
                              type === 'warning' ? 'fa-exclamation-triangle' : 
                              type === 'error' ? 'fa-exclamation-circle' : 
                              'fa-check-circle'}"></i>
                <span>${message}</span>
            </div>
        `;
        
        // Add to the document
        document.body.appendChild(notification);
        
        // Trigger animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Remove after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300); // Transition duration
        }, duration);
    }
    
    /**
     * Update session information in the UI
     */
    updateSessionInfo() {
        // This method would update any session-related information displayed in the UI
        // such as elapsed time, remaining time, etc.
        // Implementation depends on specific requirements
    }
    
    /**
     * Apply role-specific styling
     */
    applyRoleStyling() {
        const bodyElement = document.body;
        
        if (this.isMentor) {
            bodyElement.classList.add('mentor-theme');
            bodyElement.classList.remove('learner-theme');
        } else {
            bodyElement.classList.add('learner-theme');
            bodyElement.classList.remove('mentor-theme');
        }
    }
    
    /**
     * Set up responsive layout
     */
    setupResponsiveLayout() {
        // Initially adjust layout
        this.adjustLayoutForScreenSize();
        
        // Listen for window resize
        window.addEventListener('resize', () => {
            this.adjustLayoutForScreenSize();
        });
    }
    
    /**
     * Adjust layout based on screen size
     */
    adjustLayoutForScreenSize() {
        const isMobile = window.innerWidth < 768;
        
        // Example adjustments for mobile devices
        if (isMobile) {
            // Change layout for smaller screens
            if (this.elements.mainVideoContainer) {
                this.elements.mainVideoContainer.classList.add('mobile-view');
            }
        } else {
            // Restore desktop layout
            if (this.elements.mainVideoContainer) {
                this.elements.mainVideoContainer.classList.remove('mobile-view');
            }
        }
    }
    
    /**
     * Set active participant (main view)
     * 
     * @param {string} userId - User ID to set as active
     */
    setActiveParticipant(userId) {
        // Implementation depends on the UI structure
        // This would typically move a specific participant's video to the main view
        console.log(`Setting ${userId} as active participant`);
        
        // This would be implemented based on the specific UI requirements
    }
    
    /**
     * Apply light or dark theme based on user preference
     */
    applyTheme() {
        // Detect preferred color scheme
        const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // Apply theme
        if (prefersDarkMode) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }
    
    /**
     * Handle remote user media state changes
     * 
     * @param {string} userId - The remote user ID
     * @param {Object} mediaState - The media state
     * @param {boolean} mediaState.audio - Whether audio is enabled
     * @param {boolean} mediaState.video - Whether video is enabled
     */
    updateRemoteMediaState(userId, mediaState) {
        const statusElement = document.getElementById(`remoteVideoStatus-${userId}`);
        if (statusElement) {
            statusElement.innerHTML = mediaState.audio 
                ? '<i class="fas fa-microphone text-green-500"></i>' 
                : '<i class="fas fa-microphone-slash text-red-500"></i>';
        }
    }
    
    /**
     * Set local video stream
     * 
     * @param {MediaStream} stream - The local media stream
     */
    setLocalStream(stream) {
        if (!this.elements.localVideo) {
            // Create video element if it doesn't exist
            this.createLocalVideoElement();
        }
        
        if (this.elements.localVideo) {
            this.elements.localVideo.srcObject = stream;
        }
    }
    
    /**
     * Set remote video stream
     * 
     * @param {string} userId - The remote user ID
     * @param {string} userName - The remote user's display name
     * @param {MediaStream} stream - The remote media stream
     * @param {boolean} isRemoteMentor - Whether the remote user is a mentor
     */
    setRemoteStream(userId, userName, stream, isRemoteMentor = false) {
        // Check if we already have a video element for this user
        let videoElements = {
            mainVideo: document.getElementById(`remote-video-${userId}`),
            thumbnailVideo: document.getElementById(`thumbnail-video-${userId}`)
        };
        
        // If not, create new elements
        if (!videoElements.mainVideo) {
            videoElements = this.createRemoteVideoElement(userId, userName, isRemoteMentor);
        }
        
        // Set the stream
        if (videoElements.mainVideo) {
            videoElements.mainVideo.srcObject = stream;
        }
        
        if (videoElements.thumbnailVideo) {
            videoElements.thumbnailVideo.srcObject = stream;
        }
        
        // Update connection state to show we're successfully connected
        this.updateConnectionState('connected');
    }
    
    /**
     * Remove a remote video element
     * 
     * @param {string} userId - The remote user ID
     */
    removeRemoteStream(userId) {
        // Remove main video container
        const remoteContainer = document.getElementById(`remote-container-${userId}`);
        if (remoteContainer) {
            remoteContainer.remove();
        }
        
        // Remove thumbnail
        const thumbnailContainer = document.getElementById(`thumbnail-${userId}`);
        if (thumbnailContainer) {
            thumbnailContainer.remove();
        }
        
        // If this was the active user, show a message
        if (this.activeRemoteUser === userId) {
            this.activeRemoteUser = null;
            
            // Show disconnected message in main container
            if (this.elements.mainVideoContainer) {
                this.elements.mainVideoContainer.innerHTML = `
                    <div class="flex items-center justify-center h-full bg-gray-800 text-white">
                        <div class="text-center">
                            <i class="fas fa-user-slash text-4xl mb-4"></i>
                            <p class="text-lg">The other participant has left the session.</p>
                        </div>
                    </div>
                `;
            }
        }
    }
    
    /**
     * Update remote stream quality/status indicators
     * 
     * @param {string} userId - The remote user ID
     * @param {string} quality - The quality indicator (good, fair, poor)
     */
    updateRemoteStreamQuality(userId, quality) {
        // Implementation depends on UI requirements
        // This could update a visual indicator of connection quality
        console.log(`Remote stream quality for ${userId}: ${quality}`);
    }
}