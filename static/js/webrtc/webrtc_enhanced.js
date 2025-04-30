/**
 * Enhanced WebRTC connection handling for PeerLearn
 * Provides robust error handling, connection state monitoring,
 * and fallback mechanisms for real-time video sessions.
 */

// Configuration constants
const RETRY_DELAY = 3000;  // 3 seconds between retry attempts
const MAX_RECONNECT_ATTEMPTS = 5;  // Maximum number of reconnection attempts
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
];

// Add TURN servers if configured in environment
if (window.TURN_SERVER_URL) {
    ICE_SERVERS.push({
        urls: window.TURN_SERVER_URL,
        username: window.TURN_SERVER_USERNAME || '',
        credential: window.TURN_SERVER_CREDENTIAL || ''
    });
}

class EnhancedWebRTCHandler {
    constructor(options) {
        // Basic configuration
        this.userId = options.userId;
        this.userName = options.userName;
        this.isMentor = options.isMentor || false;
        this.sessionId = options.sessionId;
        this.websocketUrl = options.websocketUrl;
        
        // WebRTC configuration
        this.peerConnections = {};  // Store multiple peer connections
        this.localStream = null;
        this.remoteStreams = {};
        this.dataChannels = {};
        
        // WebSocket connection
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.pingInterval = null;
        this.lastPingTime = null;
        
        // Callbacks
        this.onRemoteStreamAdded = options.onRemoteStreamAdded || ((userId, stream) => console.log(`Remote stream added for user ${userId}`));
        this.onRemoteStreamRemoved = options.onRemoteStreamRemoved || ((userId) => console.log(`Remote stream removed for user ${userId}`));
        this.onChatMessage = options.onChatMessage || ((message) => console.log(`Chat message: ${message}`));
        this.onConnectionStateChange = options.onConnectionStateChange || ((state) => console.log(`Connection state: ${state}`));
        this.onError = options.onError || ((error) => console.error(`WebRTC error: ${error}`));
        
        // State management
        this.isReconnecting = false;
        this.hasInitializedMedia = false;
        this.usersInSession = new Set();
        this.deviceErrorState = null;
        
        // Device constraints - start with default then can be updated
        this.mediaConstraints = {
            audio: true,
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            }
        };
        
        // Audio-only fallback constraints
        this.audioOnlyConstraints = {
            audio: true,
            video: false
        };
        
        // Low-quality fallback constraints
        this.lowQualityConstraints = {
            audio: true,
            video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
                frameRate: { ideal: 15 }
            }
        };
    }
    
    /**
     * Initialize the WebRTC connection including media devices and WebSocket
     */
    async initialize() {
        try {
            console.log('Initializing WebRTC connection...');
            
            // Get user media with appropriate error handling
            await this.setupMediaDevices();
            
            // Connect WebSocket with reconnection capability
            await this.connectWebSocket();
            
            // Start monitoring connection quality
            this.startConnectionMonitoring();
            
            // Signal successful initialization
            this.onConnectionStateChange('initialized');
            return true;
            
        } catch (error) {
            this.onError(`Initialization error: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Set up media devices with fallback mechanisms
     */
    async setupMediaDevices() {
        // First try with ideal quality
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(this.mediaConstraints);
            this.hasInitializedMedia = true;
            console.log('Media devices initialized with ideal quality');
            return;
        } catch (error) {
            console.warn('Failed to get ideal quality media, trying fallbacks:', error);
            
            // Parse the error to provide appropriate user feedback
            this.handleMediaDeviceError(error);
            
            // Try fallback options in sequence
            try {
                // Try with lower quality
                console.log('Attempting lower quality fallback...');
                this.localStream = await navigator.mediaDevices.getUserMedia(this.lowQualityConstraints);
                this.hasInitializedMedia = true;
                console.log('Media devices initialized with lower quality');
                return;
            } catch (error2) {
                console.warn('Failed with lower quality, trying audio only:', error2);
                
                // Try audio only as last resort
                try {
                    console.log('Attempting audio-only fallback...');
                    this.localStream = await navigator.mediaDevices.getUserMedia(this.audioOnlyConstraints);
                    this.hasInitializedMedia = true;
                    console.log('Media devices initialized with audio only');
                    
                    // Notify about video restrictions
                    this.onError({
                        type: 'media-fallback',
                        message: 'Unable to access video. Session will continue with audio only.',
                        details: error.message
                    });
                    return;
                } catch (error3) {
                    // At this point all attempts failed
                    console.error('All media initialization attempts failed:', error3);
                    this.deviceErrorState = 'all-failed';
                    
                    throw new Error('Unable to access audio or video devices. Please check your device permissions.');
                }
            }
        }
    }
    
    /**
     * Parse device errors to provide meaningful user feedback
     */
    handleMediaDeviceError(error) {
        // Map common getUserMedia errors to user-friendly messages
        let errorInfo = {
            type: 'unknown',
            message: 'An unknown error occurred while accessing media devices.',
            details: error.message
        };
        
        // NotFoundError: The device you're trying to access doesn't exist or is unreachable
        if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            this.deviceErrorState = 'not-found';
            errorInfo = {
                type: 'device-not-found',
                message: 'Camera or microphone not found. Please connect a device and try again.',
                details: error.message
            };
        }
        // NotAllowedError: User has denied permission
        else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            this.deviceErrorState = 'permission-denied';
            errorInfo = {
                type: 'permission-denied',
                message: 'Camera or microphone access denied. Please allow access in your browser settings.',
                details: error.message
            };
        }
        // NotReadableError: Hardware or OS level error
        else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            this.deviceErrorState = 'in-use';
            errorInfo = {
                type: 'device-in-use',
                message: 'Camera or microphone is already in use by another application.',
                details: error.message
            };
        }
        // OverconstrainedError: Constraints can't be met
        else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
            this.deviceErrorState = 'overconstrained';
            errorInfo = {
                type: 'device-capabilities',
                message: 'Your camera doesn\'t support the required quality settings.',
                details: error.message
            };
        }
        // AbortError: Some issue has occurred which prevented device access
        else if (error.name === 'AbortError') {
            this.deviceErrorState = 'aborted';
            errorInfo = {
                type: 'device-error',
                message: 'Hardware error occurred when accessing your camera or microphone.',
                details: error.message
            };
        }
        // SecurityError: Insecure context or permissions policy issue
        else if (error.name === 'SecurityError') {
            this.deviceErrorState = 'security';
            errorInfo = {
                type: 'security-error',
                message: 'Security error accessing media devices. Please use HTTPS.',
                details: error.message
            };
        }
        
        // Notify about the error
        this.onError(errorInfo);
        return errorInfo;
    }
    
    /**
     * Connect to the WebSocket server with reconnection logic
     */
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                // Close existing socket if any
                if (this.socket) {
                    this.socket.close();
                    this.socket = null;
                }
                
                console.log(`Connecting to WebSocket server: ${this.websocketUrl}`);
                
                this.socket = new WebSocket(this.websocketUrl);
                
                this.socket.onopen = () => {
                    console.log('WebSocket connection established');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    
                    // Send join message to identify client
                    this.sendJoinMessage();
                    
                    // Setup ping interval for connection monitoring
                    this.setupPingInterval();
                    
                    resolve();
                };
                
                this.socket.onclose = (event) => {
                    console.log(`WebSocket connection closed: ${event.code} - ${event.reason}`);
                    this.isConnected = false;
                    
                    // Clear ping interval
                    if (this.pingInterval) {
                        clearInterval(this.pingInterval);
                        this.pingInterval = null;
                    }
                    
                    // Try to reconnect unless specifically closed by the application
                    if (!this.isReconnecting && event.code !== 1000) {
                        this.attemptReconnection();
                    }
                };
                
                this.socket.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    if (!this.isConnected) {
                        reject(new Error('Failed to connect to WebSocket server'));
                    } else {
                        this.onError({
                            type: 'websocket-error',
                            message: 'Connection error with the server. Attempting to reconnect...',
                            details: 'WebSocket connection issue'
                        });
                    }
                };
                
                // Handle incoming WebSocket messages
                this.socket.onmessage = (event) => {
                    this.handleWebSocketMessage(event);
                };
                
            } catch (error) {
                console.error('Error connecting to WebSocket:', error);
                reject(error);
            }
        });
    }
    
    /**
     * Send a join message to the WebSocket server
     */
    sendJoinMessage() {
        if (!this.isConnected) return;
        
        const joinMessage = {
            type: 'join',
            user_id: this.userId, 
            user_name: this.userName,
            client_info: {
                browser: navigator.userAgent,
                time: new Date().toISOString(),
                is_rejoining: this.isReconnecting,
                device_type: this.getDeviceType(),
                screen_width: window.innerWidth,
                screen_height: window.innerHeight
            }
        };
        
        this.sendWebSocketMessage(joinMessage);
    }
    
    /**
     * Get device type information
     */
    getDeviceType() {
        const ua = navigator.userAgent;
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
            return 'tablet';
        }
        if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
            return 'mobile';
        }
        return 'desktop';
    }
    
    /**
     * Set up periodic ping to keep WebSocket connection alive
     */
    setupPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        
        // Send ping every 30 seconds
        this.pingInterval = setInterval(() => {
            if (this.isConnected) {
                this.lastPingTime = Date.now();
                
                const heartbeat = {
                    type: 'heartbeat',
                    timestamp: this.lastPingTime
                };
                
                this.sendWebSocketMessage(heartbeat);
            }
        }, 30000);
    }
    
    /**
     * Handle incoming WebSocket messages
     */
    handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            // console.log('Received WebSocket message:', data);
            
            // Handle different message types
            switch (data.type) {
                case 'user_join':
                    this.handleUserJoin(data);
                    break;
                    
                case 'user_leave':
                    this.handleUserLeave(data);
                    break;
                    
                case 'user_rejoin':
                    this.handleUserRejoin(data);
                    break;
                
                case 'user_disconnected':
                    this.handleUserTemporaryDisconnect(data);
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
                    
                case 'chat_message':
                    this.handleChatMessage(data);
                    break;
                    
                case 'error':
                    this.handleErrorMessage(data);
                    break;
                    
                case 'pong':
                    this.handlePong(data);
                    break;
                    
                case 'connection_error':
                    this.handleConnectionError(data);
                    break;
                    
                case 'join_ack':
                    console.log('Join acknowledged by server');
                    // Optionally request current room state
                    this.requestRoomState();
                    break;
                    
                case 'room_state':
                    this.handleRoomState(data);
                    break;
                    
                default:
                    console.log('Unhandled message type:', data.type);
            }
            
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    }
    
    /**
     * Request current room state when reconnecting
     */
    requestRoomState() {
        this.sendWebSocketMessage({
            type: 'get_room_state'
        });
    }
    
    /**
     * Send a WebSocket message
     */
    sendWebSocketMessage(message) {
        if (!this.isConnected || !this.socket) {
            console.warn('Cannot send message, WebSocket not connected');
            return false;
        }
        
        try {
            this.socket.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            return false;
        }
    }
    
    /**
     * Attempt to reconnect to the WebSocket server
     */
    attemptReconnection() {
        if (this.isReconnecting || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            return;
        }
        
        this.isReconnecting = true;
        this.reconnectAttempts++;
        
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        
        this.onConnectionStateChange('reconnecting');
        
        // Attempt reconnection after delay
        setTimeout(async () => {
            try {
                await this.connectWebSocket();
                this.isReconnecting = false;
                this.onConnectionStateChange('reconnected');
                
                // Re-establish all peer connections
                this.reestablishPeerConnections();
                
            } catch (error) {
                this.isReconnecting = false;
                console.error('Reconnection attempt failed:', error);
                
                if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    this.attemptReconnection();
                } else {
                    this.onConnectionStateChange('failed');
                    this.onError({
                        type: 'reconnection-failed',
                        message: 'Unable to reconnect to the session after multiple attempts.',
                        details: error.message
                    });
                }
            }
        }, RETRY_DELAY);
    }
    
    /**
     * Re-establish peer connections after a reconnection
     */
    reestablishPeerConnections() {
        console.log('Re-establishing peer connections...');
        
        // Close all existing peer connections
        for (const userId in this.peerConnections) {
            this.closePeerConnection(userId);
        }
        
        // Clear peer connections
        this.peerConnections = {};
        
        // Request room state which will trigger the creation of new peer connections
        this.requestRoomState();
    }
    
    /**
     * Handle a new user joining the session
     */
    handleUserJoin(data) {
        console.log(`User joined: ${data.user_name} (${data.user_id})`);
        
        // Add to users in session
        this.usersInSession.add(data.user_id);
        
        // If we're the mentor, initiate the connection to the new user
        if (this.isMentor && data.user_id !== this.userId) {
            setTimeout(() => {
                this.createPeerConnection(data.user_id, data.user_name, true);
            }, 1000);  // Small delay to ensure both sides are ready
        }
    }
    
    /**
     * Handle a user leaving the session
     */
    handleUserLeave(data) {
        console.log(`User left: ${data.user_name} (${data.user_id})`);
        
        // Remove from users in session
        this.usersInSession.delete(data.user_id);
        
        // Close the peer connection
        this.closePeerConnection(data.user_id);
        
        // Notify about remote stream removal
        this.onRemoteStreamRemoved(data.user_id);
    }
    
    /**
     * Handle a user temporarily disconnecting
     */
    handleUserTemporaryDisconnect(data) {
        console.log(`User temporarily disconnected: ${data.user_name} (${data.user_id})`);
        
        // For now, we keep the connection open and wait for potential reconnection
        // If the user doesn't reconnect within a time frame, 'user_leave' will be triggered
    }
    
    /**
     * Handle a user rejoining after a temporary disconnection
     */
    handleUserRejoin(data) {
        console.log(`User rejoined: ${data.user_name} (${data.user_id})`);
        
        // If the peer connection is dead, recreate it
        const pc = this.peerConnections[data.user_id];
        if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
            // If we're the mentor, initiate a new connection
            if (this.isMentor) {
                setTimeout(() => {
                    this.createPeerConnection(data.user_id, data.user_name, true);
                }, 1000);
            }
        }
    }
    
    /**
     * Create a new peer connection for a user
     */
    createPeerConnection(userId, userName, createOffer = false) {
        // If connection already exists, close it first
        if (this.peerConnections[userId]) {
            this.closePeerConnection(userId);
        }
        
        console.log(`Creating peer connection to ${userName} (${userId})`);
        
        // Create a new RTCPeerConnection
        const pc = new RTCPeerConnection({
            iceServers: ICE_SERVERS,
            iceCandidatePoolSize: 10
        });
        
        this.peerConnections[userId] = pc;
        
        // Set up event handlers
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendCandidate(userId, event.candidate);
            }
        };
        
        pc.oniceconnectionstatechange = () => {
            console.log(`ICE connection state change for ${userId}: ${pc.iceConnectionState}`);
            
            if (pc.iceConnectionState === 'failed') {
                // Try to restart ICE
                pc.restartIce();
                
                // Notify about ICE failure
                this.onError({
                    type: 'ice-connection-failed',
                    message: 'Network connection issues detected. Attempting to recover connection...',
                    details: `ICE connection failed for user ${userId}`
                });
            }
        };
        
        pc.onconnectionstatechange = () => {
            console.log(`Connection state change for ${userId}: ${pc.connectionState}`);
            
            if (pc.connectionState === 'failed') {
                // Connection completely failed, try to recreate
                this.handleConnectionFailure(userId, userName);
            }
        };
        
        pc.ontrack = (event) => {
            console.log(`Remote track added from ${userId}`);
            
            // Store remote stream
            this.remoteStreams[userId] = event.streams[0];
            
            // Notify about new remote stream
            this.onRemoteStreamAdded(userId, event.streams[0]);
        };
        
        // Add local tracks to the connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        } else {
            console.warn('No local stream available when creating peer connection');
        }
        
        // Create data channel
        try {
            const dataChannel = pc.createDataChannel('chat');
            
            dataChannel.onopen = () => {
                console.log(`Data channel opened with ${userId}`);
            };
            
            dataChannel.onclose = () => {
                console.log(`Data channel closed with ${userId}`);
            };
            
            dataChannel.onmessage = (event) => {
                console.log(`Data channel message from ${userId}:`, event.data);
                this.handleDataChannelMessage(userId, event.data);
            };
            
            this.dataChannels[userId] = dataChannel;
        } catch (error) {
            console.error('Error creating data channel:', error);
        }
        
        // If this side should create the offer, do so
        if (createOffer) {
            this.createOffer(userId);
        }
        
        return pc;
    }
    
    /**
     * Close a peer connection
     */
    closePeerConnection(userId) {
        const pc = this.peerConnections[userId];
        if (!pc) return;
        
        console.log(`Closing peer connection to ${userId}`);
        
        // Close data channel if it exists
        if (this.dataChannels[userId]) {
            this.dataChannels[userId].close();
            delete this.dataChannels[userId];
        }
        
        // Close peer connection
        pc.close();
        delete this.peerConnections[userId];
        
        // Clean up remote stream
        delete this.remoteStreams[userId];
    }
    
    /**
     * Create and send an offer
     */
    async createOffer(userId) {
        const pc = this.peerConnections[userId];
        if (!pc) return;
        
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            console.log(`Created and set local offer for ${userId}`);
            
            // Send the offer
            this.sendOffer(userId, pc.localDescription);
            
        } catch (error) {
            console.error('Error creating offer:', error);
            this.onError({
                type: 'create-offer-failed',
                message: 'Failed to initiate connection with the other participant.',
                details: error.message
            });
        }
    }
    
    /**
     * Send an offer
     */
    sendOffer(userId, offer) {
        const message = {
            type: 'offer',
            offer: offer,
            to_user_id: userId
        };
        
        this.sendWebSocketMessage(message);
    }
    
    /**
     * Handle an incoming offer
     */
    async handleOffer(data) {
        const fromUserId = data.from_user_id;
        console.log(`Received offer from ${fromUserId}`);
        
        if (fromUserId === this.userId) return;  // Ignore offers from ourselves
        
        try {
            // Create peer connection if it doesn't exist
            if (!this.peerConnections[fromUserId]) {
                this.createPeerConnection(fromUserId, 'Remote User');
            }
            
            const pc = this.peerConnections[fromUserId];
            
            // Set remote description
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            // Create answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            console.log(`Created and set local answer for ${fromUserId}`);
            
            // Send the answer
            this.sendAnswer(fromUserId, pc.localDescription);
            
        } catch (error) {
            console.error('Error handling offer:', error);
            this.onError({
                type: 'handle-offer-failed',
                message: 'Failed to process connection request from the other participant.',
                details: error.message
            });
        }
    }
    
    /**
     * Send an answer
     */
    sendAnswer(userId, answer) {
        const message = {
            type: 'answer',
            answer: answer,
            to_user_id: userId
        };
        
        this.sendWebSocketMessage(message);
    }
    
    /**
     * Handle an incoming answer
     */
    async handleAnswer(data) {
        const fromUserId = data.from_user_id;
        console.log(`Received answer from ${fromUserId}`);
        
        if (fromUserId === this.userId) return;  // Ignore answers from ourselves
        
        try {
            const pc = this.peerConnections[fromUserId];
            if (!pc) {
                console.warn(`No peer connection for ${fromUserId}`);
                return;
            }
            
            // Set remote description
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            console.log(`Set remote answer for ${fromUserId}`);
            
        } catch (error) {
            console.error('Error handling answer:', error);
            this.onError({
                type: 'handle-answer-failed',
                message: 'Failed to establish connection with the other participant.',
                details: error.message
            });
        }
    }
    
    /**
     * Send an ICE candidate
     */
    sendCandidate(userId, candidate) {
        const message = {
            type: 'candidate',
            candidate: candidate,
            to_user_id: userId
        };
        
        this.sendWebSocketMessage(message);
    }
    
    /**
     * Handle an incoming ICE candidate
     */
    async handleCandidate(data) {
        const fromUserId = data.from_user_id;
        
        if (fromUserId === this.userId) return;  // Ignore candidates from ourselves
        
        try {
            const pc = this.peerConnections[fromUserId];
            if (!pc) {
                console.warn(`No peer connection for ${fromUserId}`);
                return;
            }
            
            // Add ICE candidate
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            // console.log(`Added ICE candidate from ${fromUserId}`);
            
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }
    
    /**
     * Handle an incoming chat message
     */
    handleChatMessage(data) {
        console.log(`Chat message from ${data.from_user_name}: ${data.message}`);
        
        // Notify about new chat message
        this.onChatMessage({
            userId: data.from_user_id,
            userName: data.from_user_name,
            message: data.message,
            timestamp: data.timestamp
        });
    }
    
    /**
     * Handle a data channel message
     */
    handleDataChannelMessage(userId, data) {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'chat') {
                this.onChatMessage({
                    userId: userId,
                    userName: 'Remote User',  // We don't know the name from data channel
                    message: message.message,
                    timestamp: message.timestamp || new Date().toISOString()
                });
            }
            
        } catch (error) {
            console.error('Error parsing data channel message:', error);
        }
    }
    
    /**
     * Handle an error message from the server
     */
    handleErrorMessage(data) {
        console.error('Error message from server:', data.message);
        
        this.onError({
            type: 'server-error',
            message: data.message,
            details: data.details || 'No details provided'
        });
    }
    
    /**
     * Handle pong response from server
     */
    handlePong(data) {
        if (!this.lastPingTime) return;
        
        const latency = Date.now() - this.lastPingTime;
        
        if (latency > 1000) {
            console.warn(`High server latency detected: ${latency}ms`);
        }
    }
    
    /**
     * Handle connection error message
     */
    handleConnectionError(data) {
        console.error(`Connection error reported by ${data.user_name}:`, data.error);
        
        // If this error is for us, handle it
        if (data.to_user_id === this.userId) {
            this.onError({
                type: 'peer-connection-error',
                message: `${data.user_name} is having trouble connecting to you. They reported: ${data.error}`,
                details: data.error
            });
            
            // Try to recreate the connection
            setTimeout(() => {
                this.createPeerConnection(data.user_id, data.user_name, this.isMentor);
            }, 2000);
        }
    }
    
    /**
     * Handle room state
     */
    handleRoomState(data) {
        console.log('Received room state:', data);
        
        // Process current participants
        if (data.participants) {
            data.participants.forEach(participant => {
                if (participant.user_id !== this.userId) {
                    this.usersInSession.add(participant.user_id);
                    
                    // Create peer connection if needed (mentor initiates)
                    if (this.isMentor && !this.peerConnections[participant.user_id]) {
                        setTimeout(() => {
                            this.createPeerConnection(participant.user_id, participant.user_name, true);
                        }, 1000);
                    }
                }
            });
        }
    }
    
    /**
     * Handle connection failure
     */
    handleConnectionFailure(userId, userName) {
        console.log(`Connection failed with ${userName} (${userId}), attempting recovery...`);
        
        // Notify about failure
        this.onError({
            type: 'connection-failed',
            message: `Connection with ${userName || 'another participant'} has failed. Attempting to reconnect...`,
            details: `WebRTC connection failed for user ${userId}`
        });
        
        // Report error to the server so the other side knows about it
        this.sendWebSocketMessage({
            type: 'connection_error',
            error: 'WebRTC connection failed, attempting to recreate',
            to_user_id: userId
        });
        
        // Close and recreate the connection
        this.closePeerConnection(userId);
        
        // Wait a moment before recreating
        setTimeout(() => {
            this.createPeerConnection(userId, userName, this.isMentor);
        }, 2000);
    }
    
    /**
     * Start monitoring connection quality
     */
    startConnectionMonitoring() {
        // Monitor every 10 seconds
        setInterval(() => {
            // Check peer connections health
            for (const userId in this.peerConnections) {
                const pc = this.peerConnections[userId];
                
                // Get connection stats to monitor quality
                pc.getStats().then(stats => {
                    stats.forEach(report => {
                        if (report.type === 'transport') {
                            const bytesReceived = report.bytesReceived;
                            const bytesSent = report.bytesSent;
                            
                            // Log if there's a significant issue (disabled in production)
                            // console.log(`Connection with ${userId}: Bytes received=${bytesReceived}, Bytes sent=${bytesSent}`);
                        }
                        
                        // Monitor for packet loss and other issues
                        if (report.type === 'inbound-rtp' && report.kind === 'video') {
                            if (report.packetsLost > 100 && report.packetsReceived > 0) {
                                const lossRate = report.packetsLost / (report.packetsLost + report.packetsReceived);
                                
                                if (lossRate > 0.1) {  // More than 10% packet loss
                                    console.warn(`High packet loss detected in connection with ${userId}: ${(lossRate * 100).toFixed(2)}%`);
                                    
                                    // Only notify if significant and persistent
                                    if (lossRate > 0.3) {  // More than 30% packet loss
                                        this.onError({
                                            type: 'high-packet-loss',
                                            message: 'Network quality issues detected. Video may be unstable.',
                                            details: `Packet loss rate: ${(lossRate * 100).toFixed(2)}%`
                                        });
                                    }
                                }
                            }
                        }
                    });
                }).catch(error => {
                    console.error('Error getting stats:', error);
                });
            }
        }, 10000);
    }
    
    /**
     * Send a chat message
     */
    sendChatMessage(message) {
        if (!message || message.trim() === '') return false;
        
        // Send via WebSocket for server logging and guaranteed delivery
        const chatMessage = {
            type: 'chat',
            message: message.trim()
        };
        
        return this.sendWebSocketMessage(chatMessage);
    }
    
    /**
     * Toggle microphone
     */
    toggleMicrophone(enabled) {
        if (!this.localStream) return false;
        
        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length === 0) return false;
        
        for (const track of audioTracks) {
            track.enabled = enabled;
        }
        
        return true;
    }
    
    /**
     * Toggle camera
     */
    toggleCamera(enabled) {
        if (!this.localStream) return false;
        
        const videoTracks = this.localStream.getVideoTracks();
        if (videoTracks.length === 0) return false;
        
        for (const track of videoTracks) {
            track.enabled = enabled;
        }
        
        return true;
    }
    
    /**
     * Switch audio device
     */
    async switchAudioDevice(deviceId) {
        if (!this.localStream) return false;
        
        try {
            // Get current constraints
            const constraints = {
                audio: { deviceId: { exact: deviceId } },
                video: this.localStream.getVideoTracks().length > 0
            };
            
            // If we have video, keep it
            if (constraints.video) {
                const videoTrack = this.localStream.getVideoTracks()[0];
                const videoConstraints = videoTrack.getConstraints();
                constraints.video = {
                    ...videoConstraints,
                    deviceId: undefined  // Keep current video device
                };
            }
            
            // Get new media stream
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Replace audio track in all peer connections
            const audioTrack = newStream.getAudioTracks()[0];
            
            for (const userId in this.peerConnections) {
                const pc = this.peerConnections[userId];
                
                const senders = pc.getSenders();
                const audioSender = senders.find(sender => sender.track && sender.track.kind === 'audio');
                
                if (audioSender) {
                    await audioSender.replaceTrack(audioTrack);
                }
            }
            
            // Replace audio track in local stream
            const oldAudioTrack = this.localStream.getAudioTracks()[0];
            if (oldAudioTrack) {
                oldAudioTrack.stop();
                this.localStream.removeTrack(oldAudioTrack);
            }
            
            this.localStream.addTrack(audioTrack);
            
            return true;
            
        } catch (error) {
            console.error('Error switching audio device:', error);
            this.onError({
                type: 'device-switch-failed',
                message: 'Failed to switch audio device. Please try again.',
                details: error.message
            });
            return false;
        }
    }
    
    /**
     * Switch video device
     */
    async switchVideoDevice(deviceId) {
        if (!this.localStream) return false;
        
        try {
            // Get current constraints
            const constraints = {
                audio: this.localStream.getAudioTracks().length > 0,
                video: { deviceId: { exact: deviceId } }
            };
            
            // If we have audio, keep it
            if (constraints.audio) {
                const audioTrack = this.localStream.getAudioTracks()[0];
                const audioConstraints = audioTrack.getConstraints();
                constraints.audio = {
                    ...audioConstraints,
                    deviceId: undefined  // Keep current audio device
                };
            }
            
            // Get new media stream
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Replace video track in all peer connections
            const videoTrack = newStream.getVideoTracks()[0];
            
            for (const userId in this.peerConnections) {
                const pc = this.peerConnections[userId];
                
                const senders = pc.getSenders();
                const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
                
                if (videoSender) {
                    await videoSender.replaceTrack(videoTrack);
                }
            }
            
            // Replace video track in local stream
            const oldVideoTrack = this.localStream.getVideoTracks()[0];
            if (oldVideoTrack) {
                oldVideoTrack.stop();
                this.localStream.removeTrack(oldVideoTrack);
            }
            
            this.localStream.addTrack(videoTrack);
            
            return true;
            
        } catch (error) {
            console.error('Error switching video device:', error);
            this.onError({
                type: 'device-switch-failed',
                message: 'Failed to switch video device. Please try again.',
                details: error.message
            });
            return false;
        }
    }
    
    /**
     * Clean up and close all connections
     */
    cleanup() {
        console.log('Cleaning up WebRTC connections');
        
        // Clear ping interval
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        // Close all peer connections
        for (const userId in this.peerConnections) {
            this.closePeerConnection(userId);
        }
        
        // Close WebSocket
        if (this.socket) {
            this.socket.close(1000, 'User left session');
            this.socket = null;
        }
        
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
            });
            this.localStream = null;
        }
        
        this.isConnected = false;
    }
    
    /**
     * Handle page unload to clean up properly
     */
    registerPageUnloadHandler() {
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
}

// Export for usage
window.EnhancedWebRTCHandler = EnhancedWebRTCHandler;