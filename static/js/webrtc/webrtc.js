/**
 * WebRTC Client for PeerLearn sessions
 * Handles peer-to-peer video connections between mentor and learners
 */

class PeerLearnRTC {
    constructor(config) {
        // Configuration
        this.userId = config.userId;
        this.userName = config.userName;
        this.sessionId = config.sessionId;
        this.isMentor = config.isMentor;
        this.stunServers = config.stunServers || ['stun:stun.l.google.com:19302'];
        this.turnServers = config.turnServers || [];
        this.turnUsername = config.turnUsername || '';
        this.turnCredential = config.turnCredential || '';

        // WebSocket connection for signaling
        this.socket = null;

        // WebRTC connections
        this.localStream = null;
        this.localVideo = document.getElementById(config.localVideoId);
        this.remoteVideos = {};
        this.peerConnections = {};

        // UI elements and controls
        this.videoEnabled = true;
        this.audioEnabled = true;
        
        // Event callbacks
        this.onUserJoined = config.onUserJoined || (() => {});
        this.onUserLeft = config.onUserLeft || (() => {});
        this.onChatMessage = config.onChatMessage || (() => {});
        this.onError = config.onError || ((error) => { console.error('WebRTC Error:', error); });
    }

    /**
     * Initialize WebRTC connection
     */
    async init() {
        try {
            console.log("Initializing WebRTC connection...");
            
            // Check if getUserMedia is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Your browser doesn't support camera and microphone access. Please use a modern browser like Chrome, Firefox, or Safari.");
            }
            
            try {
                // Get user media (camera and microphone) with retry for common constraints
                let mediaConstraints = {
                    video: true,
                    audio: true
                };
                
                console.log("Requesting camera and microphone access with constraints:", mediaConstraints);
                this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
                console.log("Successfully got camera and microphone access");
            } catch (mediaError) {
                console.error("Error accessing media devices:", mediaError);
                
                // If the error was a permission denial, show a clear message
                if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
                    this.onError("Permission to use camera and microphone was denied. Please allow access to participate in the session.");
                    return;
                }
                
                // For other errors, try fallback constraints (common compatibility issues)
                try {
                    console.log("Trying fallback: video only");
                    this.localStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });
                    this.onError("Microphone access failed. You are in view-only mode and cannot speak.");
                } catch (videoOnlyError) {
                    console.error("Video only fallback failed:", videoOnlyError);
                    
                    try {
                        console.log("Trying fallback: audio only");
                        this.localStream = await navigator.mediaDevices.getUserMedia({
                            video: false,
                            audio: true
                        });
                        this.onError("Camera access failed. You are in audio-only mode.");
                    } catch (audioOnlyError) {
                        console.error("Audio only fallback failed:", audioOnlyError);
                        throw new Error("Could not access any media devices. Please check your camera and microphone settings.");
                    }
                }
            }

            // Display local video stream
            if (this.localVideo && this.localStream) {
                this.localVideo.srcObject = this.localStream;
                this.localVideo.onloadedmetadata = () => {
                    console.log("Local video stream loaded");
                    this.localVideo.play().catch(e => console.error("Error playing local video:", e));
                };
            }
            
            // Setup WebSocket for signaling
            this.setupWebSocket();
        } catch (error) {
            console.error("WebRTC initialization failed:", error);
            this.onError("Failed to access camera and microphone: " + error.message);
        }
    }

    /**
     * Setup WebSocket for signaling
     */
    setupWebSocket() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        // Fix WebSocket URL path to match Django Channels' routing
        const wsUrl = `${protocol}//${window.location.host}/ws/session/${this.sessionId}/`;
        
        console.log("Connecting to WebSocket:", wsUrl);
        
        try {
            this.socket = new WebSocket(wsUrl);
            
            this.socket.onopen = () => {
                console.log("WebSocket connection established successfully");
            };
            
            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log("WebSocket message received:", data.type);
                    this.handleSignalingMessage(data);
                } catch (err) {
                    console.error("Error parsing WebSocket message:", err);
                    this.onError("Failed to process signaling message: " + err.message);
                }
            };
            
            this.socket.onclose = (event) => {
                console.log("WebSocket connection closed:", event.code, event.reason);
                // Attempt to reconnect if connection was closed unexpectedly
                if (event.code !== 1000) { // 1000 is normal closure
                    console.log("Attempting to reconnect WebSocket in 3 seconds...");
                    setTimeout(() => {
                        this.setupWebSocket();
                    }, 3000);
                }
            };
            
            this.socket.onerror = (error) => {
                console.error("WebSocket error:", error);
                this.onError("WebSocket connection error. Please check your network connection.");
            };
        } catch (err) {
            console.error("Failed to create WebSocket:", err);
            this.onError("Failed to create WebSocket connection: " + err.message);
        }
    }

    /**
     * Handle signaling messages from WebSocket
     */
    handleSignalingMessage(data) {
        switch (data.type) {
            case 'user_join':
                this.handleUserJoin(data);
                break;
            case 'user_leave':
                this.handleUserLeave(data);
                break;
            case 'offer':
                this.handleOffer(data);
                break;
            case 'answer':
                this.handleAnswer(data);
                break;
            case 'candidate':
                this.handleCandidate(data);
                break;
            case 'chat':
                this.onChatMessage(data);
                break;
            default:
                console.log("Unknown message type:", data.type);
        }
    }

    /**
     * Handle new user joining the session
     */
    handleUserJoin(data) {
        console.log("User joined:", data.user_name);
        
        // Notify application
        this.onUserJoined(data);
        
        // As mentor, initiate connections to all learners
        // As learner, we wait for the mentor to initiate the connection
        if (this.isMentor && data.user_id !== this.userId) {
            this.createPeerConnection(data.user_id, data.user_name);
            this.createOffer(data.user_id);
        }
    }

    /**
     * Handle user leaving the session
     */
    handleUserLeave(data) {
        console.log("User left:", data.user_name);
        
        // Clean up connection
        if (this.peerConnections[data.user_id]) {
            this.peerConnections[data.user_id].close();
            delete this.peerConnections[data.user_id];
        }
        
        // Remove video element
        const remoteVideo = document.getElementById(`video-${data.user_id}`);
        if (remoteVideo) {
            remoteVideo.parentNode.removeChild(remoteVideo);
        }
        
        // Notify application
        this.onUserLeft(data);
    }

    /**
     * Create RTCPeerConnection for a remote user
     */
    createPeerConnection(userId, userName) {
        if (this.peerConnections[userId]) {
            console.log("Connection to this user already exists");
            return;
        }
        
        // Configure ICE servers (STUN/TURN)
        const iceServers = [];
        
        // Ensure we have at least the default Google STUN server if none provided
        if (!this.stunServers || this.stunServers.length === 0 || this.stunServers[0] === '') {
            console.log("No STUN servers configured, using Google STUN server as fallback");
            iceServers.push({ urls: 'stun:stun.l.google.com:19302' });
            iceServers.push({ urls: 'stun:stun1.l.google.com:19302' });
            iceServers.push({ urls: 'stun:stun2.l.google.com:19302' });
            iceServers.push({ urls: 'stun:stun3.l.google.com:19302' });
            iceServers.push({ urls: 'stun:stun4.l.google.com:19302' });
        } else {
            // Add configured STUN servers
            this.stunServers.forEach(server => {
                if (server && server.trim() !== '') {
                    iceServers.push({ urls: server });
                }
            });
        }
        
        // Add TURN servers if available
        if (this.turnServers && this.turnServers.length > 0) {
            this.turnServers.forEach(server => {
                if (server && server.trim() !== '') {
                    iceServers.push({
                        urls: server,
                        username: this.turnUsername || '',
                        credential: this.turnCredential || ''
                    });
                }
            });
        }
        
        console.log("Using ICE servers:", iceServers);
        
        // Create peer connection with ICE server configuration
        try {
            const pc = new RTCPeerConnection({ 
                iceServers,
                iceCandidatePoolSize: 10,
                iceTransportPolicy: 'all',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
                sdpSemantics: 'unified-plan'
            });
            
            this.peerConnections[userId] = pc;
            
            // Add local tracks to the connection
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            }
            
            // Handle ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignalingMessage({
                        type: 'candidate',
                        candidate: event.candidate,
                        to_user_id: userId
                    });
                }
            };
            
            // Handle ICE connection state changes
            pc.oniceconnectionstatechange = () => {
                console.log(`ICE connection state for user ${userId}: ${pc.iceConnectionState}`);
                
                if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                    console.log(`Connection to user ${userId} failed or disconnected, attempting to restart ICE`);
                    // Try to restart ICE connection
                    if (this.isMentor) {
                        this.createOffer(userId);
                    }
                }
            };
            
            // Handle remote tracks
            pc.ontrack = (event) => {
                console.log(`Received track from user ${userId}:`, event);
                this.handleRemoteTrack(event, userId, userName);
            };
            
            return pc;
        } catch (error) {
            console.error("Error creating peer connection:", error);
            this.onError(`Failed to create peer connection: ${error.message}`);
            return null;
        }
    }

    /**
     * Handle remote media track from peer
     */
    handleRemoteTrack(event, userId, userName) {
        // Create or get existing video element for this user
        let videoElement = document.getElementById(`video-${userId}`);
        
        if (!videoElement) {
            // Create container div
            const videoContainer = document.createElement('div');
            videoContainer.className = 'video-container';
            videoContainer.id = `container-${userId}`;
            
            // Create video element
            videoElement = document.createElement('video');
            videoElement.id = `video-${userId}`;
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            
            // Add label
            const label = document.createElement('div');
            label.className = 'label';
            label.textContent = userName;
            
            // Add everything to the DOM
            videoContainer.appendChild(videoElement);
            videoContainer.appendChild(label);
            
            // Find the video grid and append this container
            const videoGrid = document.getElementById('video-grid');
            if (videoGrid) {
                videoGrid.appendChild(videoContainer);
            }
        }
        
        // Set the stream to the video element if it's not already set
        if (videoElement.srcObject !== event.streams[0]) {
            videoElement.srcObject = event.streams[0];
        }
    }

    /**
     * Create and send WebRTC offer to remote peer
     */
    async createOffer(userId) {
        const pc = this.peerConnections[userId];
        if (!pc) {
            console.error("Cannot create offer - no peer connection exists for", userId);
            return;
        }
        
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            this.sendSignalingMessage({
                type: 'offer',
                offer: pc.localDescription,
                to_user_id: userId
            });
        } catch (error) {
            this.onError("Error creating offer: " + error.message);
        }
    }

    /**
     * Handle WebRTC offer from remote peer
     */
    async handleOffer(data) {
        // Only process offers meant for us
        if (data.to_user_id !== this.userId) return;
        
        const userId = data.from_user_id;
        console.log("Received offer from:", userId);
        
        // Create peer connection if it doesn't exist
        if (!this.peerConnections[userId]) {
            // We also need the user's name, but we don't have it at this point
            // In a real app, you'd either cache this or pass it along with the offer
            this.createPeerConnection(userId, "Remote User");
        }
        
        const pc = this.peerConnections[userId];
        
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            this.sendSignalingMessage({
                type: 'answer',
                answer: pc.localDescription,
                to_user_id: userId
            });
        } catch (error) {
            this.onError("Error handling offer: " + error.message);
        }
    }

    /**
     * Handle WebRTC answer from remote peer
     */
    async handleAnswer(data) {
        // Only process answers meant for us
        if (data.to_user_id !== this.userId) return;
        
        const userId = data.from_user_id;
        console.log("Received answer from:", userId);
        
        const pc = this.peerConnections[userId];
        if (!pc) {
            console.error("Cannot handle answer - no peer connection exists for", userId);
            return;
        }
        
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (error) {
            this.onError("Error handling answer: " + error.message);
        }
    }

    /**
     * Handle ICE candidate from remote peer
     */
    async handleCandidate(data) {
        // Only process candidates meant for us
        if (data.to_user_id !== this.userId) return;
        
        const userId = data.from_user_id;
        const pc = this.peerConnections[userId];
        if (!pc) {
            console.error("Cannot handle ICE candidate - no peer connection exists for", userId);
            return;
        }
        
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
            this.onError("Error handling ICE candidate: " + error.message);
        }
    }

    /**
     * Send WebSocket signaling message
     */
    sendSignalingMessage(message) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.error("WebSocket is not connected");
            return;
        }
        
        this.socket.send(JSON.stringify(message));
    }

    /**
     * Send chat message
     */
    sendChatMessage(message) {
        this.sendSignalingMessage({
            type: 'chat',
            message: message
        });
    }

    /**
     * Toggle local video (mute/unmute camera)
     */
    toggleVideo() {
        this.videoEnabled = !this.videoEnabled;
        this.localStream.getVideoTracks().forEach(track => {
            track.enabled = this.videoEnabled;
        });
        return this.videoEnabled;
    }

    /**
     * Toggle local audio (mute/unmute microphone)
     */
    toggleAudio() {
        this.audioEnabled = !this.audioEnabled;
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = this.audioEnabled;
        });
        return this.audioEnabled;
    }

    /**
     * Close all connections and cleanup
     */
    close() {
        // Close all peer connections
        Object.keys(this.peerConnections).forEach(userId => {
            this.peerConnections[userId].close();
        });
        this.peerConnections = {};
        
        // Stop all local media tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        // Close WebSocket
        if (this.socket) {
            this.socket.close();
        }
    }
}