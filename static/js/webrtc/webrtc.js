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
        
        // STUN servers - Default to multiple Google STUN servers for redundancy
        this.stunServers = config.stunServers || [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
            'stun:stun3.l.google.com:19302',
            'stun:stun4.l.google.com:19302'
        ];
        
        // TURN servers - Optional fallback for restricted networks
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

        // Connection monitoring and reliability
        this.connectionMonitorInterval = null;
        this.connectionRetryAttempts = {}; // Track retry attempts per user
        this.maxRetryAttempts = 3; // Maximum number of retry attempts
        this.connectionHealth = {}; // Track connection health status
        this.lastIceCandidate = {}; // Track last received ICE candidate time
        this.healthCheckInterval = 15000; // Health check every 15 seconds
        
        // UI elements and controls
        this.videoEnabled = true;
        this.audioEnabled = true;
        
        // Event callbacks
        this.onUserJoined = config.onUserJoined || function() {};
        this.onUserLeft = config.onUserLeft || function() {};
        this.onChatMessage = config.onChatMessage || function() {};
        this.onError = config.onError || function(error) { console.error('WebRTC Error:', error); };
        this.onConnectionStateChange = config.onConnectionStateChange || function() {};
        
        // Debug mode for verbose logging
        this.debugMode = config.debugMode || true;
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
                // Detect network speed and adjust video quality accordingly
                let networkQuality = 'high'; // Default to high quality
                
                // Use navigator.connection if available to detect network capabilities
                if (navigator.connection) {
                    const effectiveType = navigator.connection.effectiveType || "unknown";
                    const downlink = navigator.connection.downlink || 0;
                    
                    if (effectiveType === '2g' || downlink < 0.5) {
                        networkQuality = 'low';
                        console.log("Detected slow connection, using low video quality");
                    } else if (effectiveType === '3g' || downlink < 2) {
                        networkQuality = 'medium';
                        console.log("Detected moderate connection, using medium video quality");
                    } else {
                        console.log("Detected good connection, using high video quality");
                    }
                }
                
                // Configure media constraints based on detected network quality
                let mediaConstraints = {
                    audio: true,
                    video: {
                        width: networkQuality === 'low' ? { ideal: 320, max: 640 } : 
                               networkQuality === 'medium' ? { ideal: 640, max: 1280 } :
                               { ideal: 1280, max: 1920 },
                        height: networkQuality === 'low' ? { ideal: 240, max: 480 } : 
                                networkQuality === 'medium' ? { ideal: 480, max: 720 } :
                                { ideal: 720, max: 1080 },
                        frameRate: networkQuality === 'low' ? { ideal: 15, max: 20 } : 
                                  networkQuality === 'medium' ? { ideal: 20, max: 24 } :
                                  { ideal: 24, max: 30 }
                    }
                };
                
                console.log(`Using ${networkQuality} quality video settings:`, mediaConstraints);
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
                var self = this;
                this.localVideo.onloadedmetadata = function() {
                    console.log("Local video stream loaded");
                    self.localVideo.play().then(function() {
                        // Playback started successfully
                    }).catch(function(e) {
                        console.error("Error playing local video:", e);
                    });
                };
            }
            
            // Setup WebSocket for signaling
            this.setupWebSocket();
            
            // Start connection health monitoring
            this.startConnectionMonitoring();
        } catch (error) {
            console.error("WebRTC initialization failed:", error);
            this.onError("Failed to access camera and microphone: " + error.message);
        }
    }
    
    /**
     * Start monitoring WebRTC connections for health and reliability
     */
    startConnectionMonitoring() {
        if (this.connectionMonitorInterval) {
            clearInterval(this.connectionMonitorInterval);
        }
        
        // Start periodic health checks
        var self = this;
        this.connectionMonitorInterval = setInterval(function() {
            self.checkAllConnectionsHealth();
        }, this.healthCheckInterval);
        
        console.log("Connection health monitoring started");
    }
    
    /**
     * Check the health of all active peer connections
     */
    checkAllConnectionsHealth() {
        if (this.debugMode) {
            console.log("Performing connection health check");
        }
        
        var self = this;
        var userIds = Object.keys(this.peerConnections);
        for (var i = 0; i < userIds.length; i++) {
            var userId = userIds[i];
            var pc = this.peerConnections[userId];
            if (!pc) continue;
            
            // Check connection state
            var connectionState = pc.connectionState || pc.iceConnectionState;
            var lastHealth = this.connectionHealth[userId] || 'unknown';
            
            // Update connection health status
            this.connectionHealth[userId] = connectionState;
            
            if (this.debugMode) {
                console.log("Connection health for user " + userId + ": " + connectionState);
            }
            
            // Handle connection state changes
            if (lastHealth !== connectionState) {
                // Notify listeners about connection state change
                this.onConnectionStateChange({
                    userId: userId,
                    state: connectionState,
                    previous: lastHealth
                });
                
                // Handle problematic states
                if (connectionState === 'failed' || connectionState === 'disconnected') {
                    this.handleConnectionFailure(userId);
                }
                
                // Handle successful connection (was problematic, now connected)
                if ((lastHealth === 'failed' || lastHealth === 'disconnected') && 
                    (connectionState === 'connected' || connectionState === 'completed')) {
                    console.log("Connection to user " + userId + " recovered successfully");
                    // Reset retry counter after successful recovery
                    this.connectionRetryAttempts[userId] = 0;
                }
            }
            
            // Check for ICE gathering stalls (no new candidates received in a while)
            var lastIceCandidateTime = this.lastIceCandidate[userId] || 0;
            var now = Date.now();
            
            // If no ICE candidates for 20 seconds during gathering and not connected
            if (pc.iceGatheringState === 'gathering' && 
                lastIceCandidateTime > 0 && 
                now - lastIceCandidateTime > 20000 &&
                (connectionState !== 'connected' && connectionState !== 'completed')) {
                
                console.warn("ICE gathering may be stalled for user " + userId + ", attempting recovery");
                this.handleConnectionFailure(userId);
            }
        }
    }
    
    /**
     * Handle connection failure with automatic recovery attempts
     */
    handleConnectionFailure(userId) {
        // Initialize or increment retry counter
        this.connectionRetryAttempts[userId] = (this.connectionRetryAttempts[userId] || 0) + 1;
        
        console.log(`Connection failure detected for user ${userId}. Retry attempt: ${this.connectionRetryAttempts[userId]}/${this.maxRetryAttempts}`);
        
        // Don't show error on first attempt, just retry quietly
        if (this.connectionRetryAttempts[userId] > 1) {
            this.onError(`Connection issue detected. Attempting to reconnect... (${this.connectionRetryAttempts[userId]}/${this.maxRetryAttempts})`);
        }
        
        // If we've reached max retries, notify the user of persistent issues
        if (this.connectionRetryAttempts[userId] >= this.maxRetryAttempts) {
            console.warn(`Max retry attempts (${this.maxRetryAttempts}) reached for user ${userId}`);
            
            // Send error information to the server for improved diagnostics
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.sendSignalingMessage({
                    type: 'connection_error',
                    error: `Failed to connect after ${this.maxRetryAttempts} attempts`,
                    to_user_id: userId
                });
            }
            
            this.onError(`Unable to establish a stable connection. This may be due to network firewalls or restrictive security settings. Try using a different network or browser.`);
            return;
        }
        
        // Close existing broken connection
        const oldPc = this.peerConnections[userId];
        if (oldPc) {
            // We don't delete the connection yet to avoid race conditions
            oldPc.close();
        }
        
        // Wait a bit before retrying to allow for network recovery
        setTimeout(() => {
            // If this is the mentor, recreate the connection
            if (this.isMentor) {
                console.log(`Mentor attempting to recreate connection to user ${userId}`);
                // Create new connection and send offer
                delete this.peerConnections[userId]; // Now it's safe to delete
                this.createPeerConnection(userId, "Remote User");
                this.createOffer(userId);
            } else {
                // For learners, send a signal to the mentor to trigger a reconnection
                console.log("Learner signaling connection failure to mentor");
                this.sendSignalingMessage({
                    type: 'connection_error',
                    error: 'learner_requesting_reconnect',
                    to_user_id: 'mentor' // Special target for the mentor
                });
            }
        }, 2000); // Wait 2 seconds before retry
    }

    /**
     * Setup WebSocket for signaling with automatic reconnection
     */
    setupWebSocket() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        // WebSocket URL path to match Django Channels' routing
        const wsUrl = `${protocol}//${window.location.host}/ws/session/${this.sessionId}/`;
        
        // WebSocket reconnection settings
        this.wsReconnectAttempts = 0;
        this.wsMaxReconnectAttempts = 7; // Increased for better resilience
        this.wsReconnectInterval = 2000; // Start with 2 seconds
        this.wsReconnecting = false;
        
        // Heartbeat and connection monitoring
        this.heartbeatInterval = null;
        this.heartbeatTimeout = null;
        this.connectionTimeout = null;
        this.reconnectTimeout = null;
        this.lastConnectionTime = null;
        this.cachedPeerConnections = null;
        
        // Setup network status event listeners
        window.addEventListener('offline', () => {
            console.warn("Device went offline");
            this.onError("Network connection lost. Waiting for connection to resume...");
            // We'll reconnect when the online event fires
        });
        
        console.log("Connecting to WebSocket:", wsUrl);
        this.connectWebSocket(wsUrl);
    }
    
    /**
     * Create WebSocket connection with reconnection logic
     */
    connectWebSocket(wsUrl) {
        try {
            // Clear any previous connection attempt timeouts
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }
            
            // Check for network connectivity before attempting connection
            if (!navigator.onLine) {
                console.warn("Device appears to be offline. Will attempt connection when online.");
                this.onError("No internet connection detected. Please check your network.");
                
                // Listen for online event to retry automatically
                window.addEventListener('online', () => {
                    console.log("Device is back online, attempting to reconnect...");
                    this.onError("Internet connection restored. Reconnecting to session...");
                    setTimeout(() => this.connectWebSocket(wsUrl), 1000);
                }, { once: true });
                return;
            }
            
            // Create new WebSocket connection
            this.socket = new WebSocket(wsUrl);
            
            // Track connection timeout to detect slow connections
            this.connectionStartTime = Date.now();
            this.connectionTimeout = setTimeout(() => {
                if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
                    console.warn("WebSocket connection taking too long, initiating reconnect");
                    // Force close and reconnect
                    if (this.socket) {
                        this.socket.close();
                    }
                }
            }, 10000); // 10 second timeout for initial connection
            
            this.socket.onopen = () => {
                console.log("WebSocket connection established successfully");
                
                // Clear connection timeout
                if (this.connectionTimeout) {
                    clearTimeout(this.connectionTimeout);
                    this.connectionTimeout = null;
                }
                
                // Calculate connection time for diagnostics
                const connectionTime = Date.now() - this.connectionStartTime;
                console.log(`Connection established in ${connectionTime}ms`);
                
                // Reset reconnection counters on successful connection
                this.wsReconnectAttempts = 0;
                this.wsReconnectInterval = 2000;
                this.lastConnectionTime = Date.now();
                
                // If we were reconnecting, notify that we're back online
                if (this.wsReconnecting) {
                    this.onError("Connection re-established successfully!");
                    this.wsReconnecting = false;
                    
                    // For each peer connection that was active before disconnection, try to reestablish
                    if (this.cachedPeerConnections) {
                        setTimeout(() => {
                            console.log("Attempting to restore previous connections");
                            Object.keys(this.cachedPeerConnections).forEach(userId => {
                                if (!this.peerConnections[userId]) {
                                    const peerInfo = this.cachedPeerConnections[userId];
                                    console.log(`Attempting to restore connection with ${peerInfo.userName} (${userId})`);
                                    this.createPeerConnection(userId, peerInfo.userName);
                                    if (this.userId < userId || this.isMentor) {
                                        this.createOffer(userId);
                                    }
                                }
                            });
                            // Clear cached connections after restoration attempt
                            this.cachedPeerConnections = null;
                        }, 1000);
                    }
                }
                
                // Send join message to the server
                this.sendSignalingMessage({
                    type: 'join',
                    user_id: this.userId,
                    user_name: this.userName,
                    is_mentor: this.isMentor,
                    client_info: {
                        reconnect_count: this.wsReconnectAttempts,
                        connection_time_ms: connectionTime,
                        user_agent: navigator.userAgent,
                        timestamp: Date.now()
                    }
                });
                
                // Start heartbeat to detect silent connection failures
                this.startHeartbeat();
            };
            
            this.socket.onmessage = (event) => {
                try {
                    // Reset heartbeat timer on any message received
                    this.resetHeartbeatTimer();
                    
                    const data = JSON.parse(event.data);
                    
                    // Handle ping messages for connection health checks
                    if (data.type === 'ping') {
                        this.sendSignalingMessage({ type: 'pong', timestamp: Date.now() });
                        return;
                    }
                    
                    console.log("WebSocket message received:", data.type);
                    this.handleSignalingMessage(data);
                } catch (err) {
                    console.error("Error parsing WebSocket message:", err, event.data);
                    this.onError("Failed to process message: " + err.message);
                }
            };
            
            this.socket.onclose = (event) => {
                console.warn(`WebSocket connection closed: ${event.code} ${event.reason}`);
                
                // Clear heartbeat timer
                this.stopHeartbeat();
                
                // Clear connection timeout if it exists
                if (this.connectionTimeout) {
                    clearTimeout(this.connectionTimeout);
                    this.connectionTimeout = null;
                }
                
                // Cache current active peer connections before attempting reconnect
                this.cachedPeerConnections = {};
                for (const userId in this.peerConnections) {
                    this.cachedPeerConnections[userId] = {
                        userId: userId,
                        userName: document.getElementById(`video-${userId}`)?.getAttribute('data-username') || 'Unknown User',
                        active: true,
                        timestamp: Date.now()
                    };
                }
                
                // Don't attempt to reconnect if this was a normal closure
                if (event.code === 1000 || event.code === 1001) {
                    console.log("WebSocket closed normally, not reconnecting");
                    return;
                }
                
                // Calculate how long the connection was stable before disconnecting
                const connectionDuration = Date.now() - (this.lastConnectionTime || Date.now());
                const wasStableConnection = connectionDuration > 30000; // 30 seconds or more is considered stable
                
                // If connection was stable, we reset the retry count to give more chances
                if (wasStableConnection && this.wsReconnectAttempts > 0) {
                    console.log("Previous connection was stable, reducing retry counter to improve reconnection chances");
                    this.wsReconnectAttempts = Math.max(0, this.wsReconnectAttempts - 1);
                }
                
                // Attempt to reconnect with exponential backoff
                this.wsReconnectAttempts++;
                
                if (this.wsReconnectAttempts <= this.wsMaxReconnectAttempts) {
                    this.wsReconnecting = true;
                    
                    // Use exponential backoff with jitter for reconnection attempts
                    // Adding jitter helps prevent reconnection stampedes from multiple clients
                    const base = this.wsReconnectInterval * Math.pow(1.5, this.wsReconnectAttempts - 1);
                    const jitter = Math.random() * 1000; // Random jitter up to 1 second
                    const reconnectDelay = Math.min(30000, base + jitter);
                    
                    console.log(`Attempting to reconnect in ${reconnectDelay/1000} seconds... (Attempt ${this.wsReconnectAttempts}/${this.wsMaxReconnectAttempts})`);
                    
                    // Show reconnection status to user
                    if (this.wsReconnectAttempts > 1) {
                        // More specific error messages based on navigator.connection if available
                        let connectionQuality = "unknown";
                        let connectionType = "unknown";
                        
                        // Use Network Information API if available
                        if (navigator.connection) {
                            connectionType = navigator.connection.effectiveType || "unknown"; // 4g, 3g, 2g, etc.
                            connectionQuality = navigator.connection.downlink ? 
                                (navigator.connection.downlink > 5 ? "good" : 
                                 navigator.connection.downlink > 1 ? "moderate" : "poor") : "unknown";
                        }
                        
                        let message = `Connection lost. Reconnecting in ${Math.round(reconnectDelay/1000)} seconds... (Attempt ${this.wsReconnectAttempts}/${this.wsMaxReconnectAttempts})`;
                        
                        // Add network quality information if available
                        if (connectionType !== "unknown") {
                            message += `\nDetected network: ${connectionType}`;
                            
                            if (connectionQuality === "poor") {
                                message += "\nSlow connection detected. Consider switching to a better network for improved experience.";
                            }
                        }
                        
                        this.onError(message);
                    } else {
                        // First disconnect, show a more subtle message
                        this.onError(`Connection temporarily interrupted. Reconnecting automatically...`);
                    }
                    
                    // Set reconnect timeout
                    this.reconnectTimeout = setTimeout(() => {
                        console.log(`Reconnecting to WebSocket (Attempt ${this.wsReconnectAttempts})`);
                        this.connectWebSocket(wsUrl);
                    }, reconnectDelay);
                } else {
                    // We've exceeded max reconnection attempts
                    this.onError("Unable to reconnect after multiple attempts. The session may have ended or there may be network issues. Please refresh the page to try again.");
                    
                    // Listen for online events in case user was disconnected due to network
                    window.addEventListener('online', () => {
                        console.log("Device is back online, attempting to reconnect...");
                        this.onError("Internet connection restored. Reconnecting to session...");
                        
                        // Reset reconnect attempts since we have a new network condition
                        this.wsReconnectAttempts = 0;
                        setTimeout(() => this.connectWebSocket(wsUrl), 1000);
                    }, { once: true });
                }
            };
            
            this.socket.onerror = (error) => {
                console.error("WebSocket error:", error);
                // Most WebSocket implementations will call onclose after onerror
                // We log here but take action in onclose
                
                // If we haven't exceeded attempts, we'll try to reconnect in onclose
                // If the error is about network connectivity, we might need to check that
                if (!navigator.onLine) {
                    this.onError("Network connectivity issue detected.");
                }
            };
        } catch (err) {
            console.error("Error setting up WebSocket:", err);
            this.onError("Failed to connect to signaling server: " + err.message);
            
            // Also attempt to reconnect on initial connection error
            if (this.wsReconnectAttempts < this.wsMaxReconnectAttempts) {
                this.reconnectTimeout = setTimeout(() => {
                    this.wsReconnectAttempts++;
                    console.log(`Attempting to reconnect... (Attempt ${this.wsReconnectAttempts}/${this.wsMaxReconnectAttempts})`);
                    this.connectWebSocket(wsUrl);
                }, this.wsReconnectInterval);
            } else {
                // We've exhausted reconnection attempts
                this.onError("Unable to establish a connection. Please check your internet connection and refresh the page.");
            }
        }
    }
    
    /**
     * Start heartbeat to detect silent connection failures
     */
    startHeartbeat() {
        // Clear any existing heartbeat
        this.stopHeartbeat();
        
        // Set heartbeat interval
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                // Send heartbeat message
                this.sendSignalingMessage({ type: 'heartbeat', timestamp: Date.now() });
            }
        }, 30000); // Send heartbeat every 30 seconds
        
        // Set timeout to detect missed heartbeats
        this.resetHeartbeatTimer();
    }
    
    /**
     * Reset heartbeat timeout timer
     */
    resetHeartbeatTimer() {
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
        }
        
        // If no messages received within 60 seconds, consider connection dead
        this.heartbeatTimeout = setTimeout(() => {
            console.warn("No response from server for too long, considering connection dead");
            if (this.socket) {
                // Force close the socket to trigger reconnection
                this.socket.close(4000, "Heartbeat timeout");
            }
        }, 60000);
    }
    
    /**
     * Stop heartbeat timers
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
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
        
        // Public STUN servers for NAT traversal (always needed)
        if (this.stunServers && this.stunServers.length > 0) {
            // Add all configured STUN servers for redundancy
            this.stunServers.forEach(server => {
                if (server && server.trim() !== '') {
                    iceServers.push({ urls: server });
                }
            });
        } else {
            // Fallback to multiple Google STUN servers if none provided
            console.log("No STUN servers configured, using Google STUN servers as fallback");
            iceServers.push({ urls: 'stun:stun.l.google.com:19302' });
            iceServers.push({ urls: 'stun:stun1.l.google.com:19302' });
            iceServers.push({ urls: 'stun:stun2.l.google.com:19302' });
            iceServers.push({ urls: 'stun:stun3.l.google.com:19302' });
            iceServers.push({ urls: 'stun:stun4.l.google.com:19302' });
        }
        
        // Add free public STUN servers from various providers for additional redundancy
        iceServers.push({ urls: 'stun:stun.stunprotocol.org:3478' });
        iceServers.push({ urls: 'stun:stun.voip.blackberry.com:3478' });
        
        // Add TURN servers if available (crucial for restrictive networks)
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
            console.log("TURN servers added for restrictive network traversal");
        } else {
            console.log("No TURN servers configured. Connection may fail in restrictive networks.");
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
                    // Record time of last ICE candidate for connection health monitoring
                    this.lastIceCandidate[userId] = Date.now();
                    
                    if (this.debugMode) {
                        console.log(`ICE candidate gathered for user ${userId}:`, event.candidate.candidate);
                    }
                    
                    this.sendSignalingMessage({
                        type: 'candidate',
                        candidate: event.candidate,
                        to_user_id: userId
                    });
                } else {
                    // ICE gathering is complete
                    console.log(`ICE gathering complete for user ${userId}`);
                }
            };
            
            // Handle ICE gathering state changes
            pc.onicegatheringstatechange = () => {
                console.log(`ICE gathering state for user ${userId}: ${pc.iceGatheringState}`);
                
                // If gathering is complete but no candidates were gathered, it could indicate an issue
                if (pc.iceGatheringState === 'complete' && !this.lastIceCandidate[userId]) {
                    console.warn(`ICE gathering completed for user ${userId} but no candidates were gathered`);
                    
                    // This could be due to network restrictions - notify user
                    if (this.connectionRetryAttempts[userId] > 0) {
                        this.onError("No ICE candidates were gathered. This typically indicates a network issue or firewall restriction.");
                    }
                }
            };
            
            // Handle ICE connection state changes
            pc.oniceconnectionstatechange = () => {
                console.log(`ICE connection state for user ${userId}: ${pc.iceConnectionState}`);
                
                // Connection failed or disconnected - handled by the health check system 
                // to avoid duplicate recovery attempts
                if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                    console.log(`Connection to user ${userId} is in ${pc.iceConnectionState} state`);
                    
                    // The health monitor will handle the recovery, but immediately update status
                    this.connectionHealth[userId] = pc.iceConnectionState;
                }
                
                // Connection successfully established
                if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                    console.log(`Successfully connected to user ${userId}`);
                    this.connectionHealth[userId] = pc.iceConnectionState;
                    this.connectionRetryAttempts[userId] = 0;
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
            // Track that we received a candidate from this peer
            // This is important for connection health monitoring
            if (!this.lastIceCandidate[`remote_${userId}`]) {
                console.log(`First ICE candidate received from user ${userId}`);
            }
            this.lastIceCandidate[`remote_${userId}`] = Date.now();
            
            if (this.debugMode) {
                console.log(`Received ICE candidate from user ${userId}:`, 
                    data.candidate.candidate ? data.candidate.candidate.substring(0, 50) + '...' : 'empty');
            }
            
            // Add the candidate to the peer connection
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            
            // If connection is in checking state for too long without progress
            if (pc.iceConnectionState === 'checking' && 
                this.connectionRetryAttempts[userId] === 0) {
                
                // Start a timeout to detect stalled ICE checking
                setTimeout(() => {
                    // If still in checking state after timeout, may indicate issues with NAT traversal
                    if (pc.iceConnectionState === 'checking') {
                        console.warn(`ICE connection still in 'checking' state after 10 seconds for user ${userId}`);
                        // Don't trigger the health check immediately, but mark it for attention
                        this.connectionHealth[userId] = 'checking-stalled';
                    }
                }, 10000); // 10 seconds is a reasonable time for ICE negotiation
            }
        } catch (error) {
            console.error("Error handling ICE candidate:", error);
            this.onError("Error processing connection information: " + error.message);
            
            // If we're getting ICE candidate errors, mark the connection health accordingly
            this.connectionHealth[userId] = 'candidate-error';
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
     * Close all connections and perform cleanup
     */
    close() {
        console.log("Closing all WebRTC connections and performing cleanup");
        
        // Stop connection health monitoring
        if (this.connectionMonitorInterval) {
            console.log("Stopping connection health monitoring");
            clearInterval(this.connectionMonitorInterval);
            this.connectionMonitorInterval = null;
        }
        
        // Close all peer connections
        Object.keys(this.peerConnections).forEach(userId => {
            console.log(`Closing connection to user ${userId}`);
            try {
                // Remove all tracks and clean up properly
                const pc = this.peerConnections[userId];
                const senders = pc.getSenders();
                if (senders && senders.length) {
                    senders.forEach(sender => {
                        try {
                            pc.removeTrack(sender);
                        } catch (e) {
                            console.warn(`Error removing track from peer connection: ${e.message}`);
                        }
                    });
                }
                
                // Close the connection
                pc.close();
            } catch (e) {
                console.error(`Error closing peer connection to user ${userId}:`, e);
            }
        });
        this.peerConnections = {};
        
        // Stop all local media tracks
        if (this.localStream) {
            console.log("Stopping all local media tracks");
            try {
                this.localStream.getTracks().forEach(track => {
                    track.stop();
                    this.localStream.removeTrack(track);
                });
                this.localStream = null;
            } catch (e) {
                console.error("Error stopping local media tracks:", e);
            }
        }
        
        // Send a notification that we're leaving if the socket is still open
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.log("Sending leave notification before closing WebSocket");
            try {
                this.sendSignalingMessage({
                    type: 'user_leaving',
                    user_id: this.userId,
                    user_name: this.userName
                });
            } catch (e) {
                console.warn("Error sending leave notification:", e);
            }
        }
        
        // Close WebSocket with a small delay to allow the leave message to be sent
        setTimeout(() => {
            if (this.socket) {
                console.log("Closing WebSocket connection");
                this.socket.close(1000, "User left session");
                this.socket = null;
            }
        }, 100);
        
        // Clear all state
        this.connectionHealth = {};
        this.connectionRetryAttempts = {};
        this.lastIceCandidate = {};
        
        console.log("WebRTC cleanup complete");
    }
}