/**
 * Enhanced WebRTC Client for PeerLearn
 * 
 * Features:
 * - Improved error handling with detailed user feedback
 * - Multi-level fallback for devices and connection issues
 * - Persistent reconnection attempts with exponential backoff
 * - Comprehensive device handling
 * - Role-based permissions
 * - Development mode support
 */

class EnhancedWebRTC {
    /**
     * Create a new instance of the EnhancedWebRTC client
     * 
     * @param {Object} config - Configuration options
     * @param {number} config.sessionId - The session ID
     * @param {number} config.userId - The current user's ID
     * @param {string} config.userName - The current user's display name
     * @param {boolean} config.isMentor - Whether the current user is a mentor
     * @param {boolean} config.devMode - Whether development mode is enabled
     * @param {Function} config.onLocalStream - Callback for when local stream is ready
     * @param {Function} config.onRemoteStream - Callback for when a remote stream is received
     * @param {Function} config.onConnectionStateChange - Callback for connection state changes
     * @param {Function} config.onChatMessage - Callback for chat messages
     * @param {Function} config.onError - Callback for errors
     */
    constructor(config) {
        // Store configuration
        this.sessionId = config.sessionId;
        this.userId = config.userId;
        this.userName = config.userName;
        this.isMentor = config.isMentor;
        this.devMode = config.devMode || false;
        
        // Callbacks
        this.onLocalStream = config.onLocalStream || (() => {});
        this.onRemoteStream = config.onRemoteStream || (() => {});
        this.onConnectionStateChange = config.onConnectionStateChange || (() => {});
        this.onChatMessage = config.onChatMessage || (() => {});
        this.onError = config.onError || ((error) => console.error('WebRTC Error:', error));
        
        // WebSocket connection
        this.socket = null;
        
        // WebRTC connection
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStreams = new Map(); // userId -> stream
        this.dataChannel = null;
        this.isScreenSharing = false;
        this.originalVideoTrack = null;
        
        // Connection state
        this.isInitialized = false;
        this.isConnecting = false;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000; // Start with 2 seconds
        
        // ICE server configuration
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ];
        
        // Check for custom TURN servers from environment
        if (window.TURN_SERVERS) {
            try {
                const customServers = JSON.parse(window.TURN_SERVERS);
                if (Array.isArray(customServers) && customServers.length > 0) {
                    this.iceServers = [...this.iceServers, ...customServers];
                    console.log('Added custom TURN servers:', customServers);
                }
            } catch (e) {
                console.error('Error parsing custom TURN servers:', e);
            }
        }
        
        // Media constraints
        this.mediaConstraints = {
            audio: true,
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        };
        
        // Set log level based on devMode
        this.logLevel = this.devMode ? 'debug' : 'info';
        
        // Bind methods to maintain 'this' context
        this.log = this.log.bind(this);
        this.initialize = this.initialize.bind(this);
        this.setupWebSocket = this.setupWebSocket.bind(this);
        this.setupPeerConnection = this.setupPeerConnection.bind(this);
        this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);
        this.setupMediaDevices = this.setupMediaDevices.bind(this);
        this.handleIceCandidate = this.handleIceCandidate.bind(this);
        this.handleRemoteTrack = this.handleRemoteTrack.bind(this);
        this.createOffer = this.createOffer.bind(this);
        this.handleOffer = this.handleOffer.bind(this);
        this.createAnswer = this.createAnswer.bind(this);
        this.handleAnswer = this.handleAnswer.bind(this);
        this.handleICECandidate = this.handleICECandidate.bind(this);
        this.sendChatMessage = this.sendChatMessage.bind(this);
        this.reconnect = this.reconnect.bind(this);
        this.cleanupResources = this.cleanupResources.bind(this);
    }
    
    /**
     * Logging with level control 
     */
    log(level, ...args) {
        const levels = {
            'error': 0,
            'warn': 1,
            'info': 2,
            'debug': 3
        };
        
        if (levels[level] <= levels[this.logLevel]) {
            const prefix = `[WebRTC-${this.userId}] `;
            console[level](prefix, ...args);
        }
    }
    
    /**
     * Initialize the WebRTC client
     */
    async initialize() {
        if (this.isInitialized) {
            this.log('warn', 'WebRTC client already initialized');
            return;
        }
        
        this.log('info', 'Initializing WebRTC client', {
            sessionId: this.sessionId,
            userId: this.userId,
            isMentor: this.isMentor,
            devMode: this.devMode
        });
        
        this.isInitialized = true;
        
        try {
            // Set up media devices first
            await this.setupMediaDevices();
            
            // Then set up WebSocket connection
            await this.setupWebSocket();
            
            // Finally set up peer connection
            await this.setupPeerConnection();
            
            this.reconnectAttempts = 0;
            this.log('info', 'WebRTC client initialized successfully');
            
        } catch (error) {
            this.isInitialized = false;
            this.log('error', 'Failed to initialize WebRTC client', error);
            
            // Different error handling based on the error
            let userFriendlyError = {
                title: 'Connection Error',
                message: 'An error occurred while setting up the connection.'
            };
            
            if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                userFriendlyError = {
                    title: 'Camera or Microphone Not Found',
                    message: 'We couldn\'t find a camera or microphone on your device. Please connect a device and try again.'
                };
            } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                userFriendlyError = {
                    title: 'Permission Denied',
                    message: 'You need to allow access to your camera and microphone to join the session. Please check your browser permissions and try again.'
                };
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                userFriendlyError = {
                    title: 'Device In Use',
                    message: 'Your camera or microphone is being used by another application. Please close other applications and try again.'
                };
            } else if (error.name === 'WebSocketError') {
                userFriendlyError = {
                    title: 'Connection Failed',
                    message: 'Could not connect to the session server. Please check your internet connection and try again.'
                };
            }
            
            this.onError(userFriendlyError);
            
            // Try to reconnect if it was a WebSocket error
            if (error.name === 'WebSocketError' && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect();
            }
        }
    }
    
    /**
     * Schedule a reconnection attempt with exponential backoff
     */
    scheduleReconnect() {
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
        this.log('info', `Scheduling reconnect attempt ${this.reconnectAttempts + 1} in ${delay}ms`);
        
        setTimeout(() => {
            this.reconnect();
        }, delay);
    }
    
    /**
     * Attempt to reconnect
     */
    async reconnect() {
        if (this.isConnecting) return;
        
        this.isConnecting = true;
        this.reconnectAttempts++;
        
        this.log('info', `Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        this.onConnectionStateChange('reconnecting');
        
        // Clean up existing resources
        this.cleanupResources();
        
        try {
            // Reinitialize everything
            this.isInitialized = false;
            await this.initialize();
            
            this.isConnecting = false;
            this.log('info', 'Reconnection successful');
            this.onConnectionStateChange('connected');
            
        } catch (error) {
            this.isConnecting = false;
            this.log('error', 'Reconnection failed', error);
            
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect();
            } else {
                this.log('error', 'Maximum reconnection attempts reached');
                this.onConnectionStateChange('failed');
                this.onError({
                    title: 'Connection Lost',
                    message: 'We couldn\'t reconnect to the session after multiple attempts. Please try refreshing the page.'
                });
            }
        }
    }
    
    /**
     * Clean up resources for reconnection or shutdown
     */
    cleanupResources() {
        this.log('info', 'Cleaning up resources');
        
        // Close data channel
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Close WebSocket
        if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
            this.socket.close();
            this.socket = null;
        }
        
        // Clear remote streams
        this.remoteStreams.clear();
        
        // Don't stop local stream here to avoid having to request permissions again
    }
    
    /**
     * Set up media devices (camera and microphone)
     */
    async setupMediaDevices() {
        this.log('info', 'Setting up media devices with constraints:', this.mediaConstraints);
        this.onConnectionStateChange('getting_user_media');
        
        try {
            // First try with both audio and video
            this.localStream = await navigator.mediaDevices.getUserMedia(this.mediaConstraints);
            this.log('info', 'Successfully acquired camera and microphone access');
            
        } catch (error) {
            this.log('warn', 'Failed to get access to both camera and microphone', error);
            
            // Try with audio only as fallback
            try {
                this.log('info', 'Attempting to get audio only as fallback');
                this.localStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: true, 
                    video: false 
                });
                this.log('info', 'Successfully acquired microphone access (camera failed)');
                
                // Let the user know we're in audio-only mode
                this.onError({
                    title: 'Video Unavailable',
                    message: 'We couldn\'t access your camera, but you can still join with audio only. You might want to check your camera settings.',
                    severity: 'warning'
                });
                
            } catch (audioError) {
                this.log('error', 'Failed to get access to microphone as fallback', audioError);
                // Let the original error bubble up since we couldn't even get audio
                throw error;
            }
        }
        
        // Provide the local stream to the UI
        this.onLocalStream(this.localStream);
        this.onConnectionStateChange('got_user_media');
        return this.localStream;
    }
    
    /**
     * Set up WebSocket connection
     */
    async setupWebSocket() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/session/${this.sessionId}/`;
            
            this.log('info', 'Connecting to WebSocket:', wsUrl);
            this.onConnectionStateChange('connecting');
            
            try {
                this.socket = new WebSocket(wsUrl);
            } catch (error) {
                this.log('error', 'Failed to create WebSocket', error);
                const wsError = new Error('Failed to create WebSocket connection');
                wsError.name = 'WebSocketError';
                reject(wsError);
                return;
            }
            
            this.socket.onopen = () => {
                this.log('info', 'WebSocket connection established');
                this.onConnectionStateChange('websocket_connected');
                
                // Send join message
                const joinMessage = {
                    type: 'join',
                    sessionId: this.sessionId,
                    userId: this.userId,
                    userName: this.userName,
                    isMentor: this.isMentor
                };
                
                this.socket.send(JSON.stringify(joinMessage));
                resolve();
            };
            
            this.socket.onclose = (event) => {
                if (this.isConnected) {
                    this.log('warn', 'WebSocket connection closed', event);
                    this.isConnected = false;
                    this.onConnectionStateChange('disconnected');
                    
                    // Try to reconnect if not deliberately closed
                    if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.scheduleReconnect();
                    }
                } else {
                    this.log('info', 'WebSocket connection closed before fully connected', event);
                }
            };
            
            this.socket.onerror = (error) => {
                this.log('error', 'WebSocket error', error);
                
                // Reject the promise if we're still setting up
                if (!this.isConnected) {
                    const wsError = new Error('WebSocket connection error');
                    wsError.name = 'WebSocketError';
                    reject(wsError);
                } else {
                    // Otherwise try to reconnect
                    this.isConnected = false;
                    this.onConnectionStateChange('error');
                    
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.scheduleReconnect();
                    } else {
                        this.onError({
                            title: 'Connection Error',
                            message: 'The connection to the session server was lost and could not be restored.'
                        });
                    }
                }
            };
            
            this.socket.onmessage = (event) => {
                this.handleWebSocketMessage(event);
            };
            
            // Set a timeout in case the connection hangs
            setTimeout(() => {
                if (!this.isConnected && this.socket && this.socket.readyState !== WebSocket.OPEN) {
                    this.log('warn', 'WebSocket connection timed out');
                    const wsError = new Error('WebSocket connection timed out');
                    wsError.name = 'WebSocketError';
                    reject(wsError);
                }
            }, 10000); // 10 second timeout
        });
    }
    
    /**
     * Process WebSocket messages
     * 
     * @param {MessageEvent} event - The WebSocket message event
     */
    handleWebSocketMessage(event) {
        try {
            const message = JSON.parse(event.data);
            this.log('debug', 'Received WebSocket message:', message);
            
            switch (message.type) {
                case 'join_ack':
                    this.log('info', 'Join acknowledged by server');
                    this.isConnected = true;
                    this.onConnectionStateChange('joined');
                    break;
                    
                case 'user_joined':
                    this.log('info', 'New user joined the session', message);
                    // If we're the mentor or if they're the mentor, start the connection
                    if (this.isMentor || message.isMentor) {
                        this.createOffer();
                    }
                    
                    // Display system message in chat
                    this.onChatMessage({
                        userId: 'system',
                        userName: 'System',
                        message: `${message.userName} has joined the session.`,
                        timestamp: new Date().toISOString(),
                        isSystem: true
                    });
                    break;
                    
                case 'user_left':
                    this.log('info', 'User left the session', message);
                    
                    // Remove their stream if we have it
                    if (this.remoteStreams.has(message.userId)) {
                        this.remoteStreams.delete(message.userId);
                    }
                    
                    // Display system message in chat
                    this.onChatMessage({
                        userId: 'system',
                        userName: 'System',
                        message: `${message.userName} has left the session.`,
                        timestamp: new Date().toISOString(),
                        isSystem: true
                    });
                    break;
                    
                case 'offer':
                    this.log('info', 'Received offer from remote peer');
                    this.handleOffer(message);
                    break;
                    
                case 'answer':
                    this.log('info', 'Received answer from remote peer');
                    this.handleAnswer(message);
                    break;
                    
                case 'ice_candidate':
                    this.log('debug', 'Received ICE candidate from remote peer');
                    this.handleICECandidate(message);
                    break;
                    
                case 'chat_message':
                    this.log('debug', 'Received chat message');
                    this.onChatMessage({
                        userId: message.userId,
                        userName: message.userName,
                        message: message.message,
                        timestamp: message.timestamp || new Date().toISOString(),
                        isSystem: false
                    });
                    break;
                    
                case 'error':
                    this.log('error', 'Received error from server', message);
                    this.onError({
                        title: 'Server Error',
                        message: message.message || 'An error occurred on the server.'
                    });
                    break;
                    
                default:
                    this.log('warn', 'Unknown message type:', message.type);
            }
            
        } catch (error) {
            this.log('error', 'Error handling WebSocket message', error, event.data);
        }
    }
    
    /**
     * Set up the WebRTC peer connection
     */
    async setupPeerConnection() {
        this.log('info', 'Setting up peer connection with ICE servers:', this.iceServers);
        
        const configuration = {
            iceServers: this.iceServers,
            iceCandidatePoolSize: 10
        };
        
        this.peerConnection = new RTCPeerConnection(configuration);
        
        // Set up data channel for chat
        this.setupDataChannel();
        
        // Add local tracks to the connection
        this.localStream.getTracks().forEach(track => {
            this.log('debug', 'Adding local track to peer connection:', track.kind);
            this.peerConnection.addTrack(track, this.localStream);
        });
        
        // Listen for ICE candidates
        this.peerConnection.onicecandidate = this.handleIceCandidate;
        
        // Listen for ICE connection state changes
        this.peerConnection.oniceconnectionstatechange = () => {
            this.log('info', 'ICE connection state changed:', this.peerConnection.iceConnectionState);
            this.onConnectionStateChange(this.peerConnection.iceConnectionState);
            
            // Handle disconnection
            if (this.peerConnection.iceConnectionState === 'disconnected' || 
                this.peerConnection.iceConnectionState === 'failed') {
                this.log('warn', 'ICE connection failed or disconnected');
                
                // Try to reconnect if we've not reached the maximum attempts
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.scheduleReconnect();
                } else {
                    this.onError({
                        title: 'Connection Lost',
                        message: 'The connection to the other participant was lost. Please try refreshing the page.'
                    });
                }
            }
        };
        
        // Listen for signaling state changes
        this.peerConnection.onsignalingstatechange = () => {
            this.log('info', 'Signaling state changed:', this.peerConnection.signalingState);
        };
        
        // Listen for new remote tracks
        this.peerConnection.ontrack = this.handleRemoteTrack;
    }
    
    /**
     * Set up the data channel for chat
     */
    setupDataChannel() {
        if (this.isMentor) {
            // Mentor creates the data channel
            this.log('info', 'Creating data channel for chat');
            this.dataChannel = this.peerConnection.createDataChannel('chat', {
                ordered: true
            });
            this.setupDataChannelEvents();
        } else {
            // Learner waits for the data channel
            this.peerConnection.ondatachannel = (event) => {
                this.log('info', 'Received data channel from mentor');
                this.dataChannel = event.channel;
                this.setupDataChannelEvents();
            };
        }
    }
    
    /**
     * Set up event listeners for the data channel
     */
    setupDataChannelEvents() {
        this.dataChannel.onopen = () => {
            this.log('info', 'Data channel opened');
        };
        
        this.dataChannel.onclose = () => {
            this.log('info', 'Data channel closed');
        };
        
        this.dataChannel.onerror = (error) => {
            this.log('error', 'Data channel error', error);
        };
        
        this.dataChannel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.log('debug', 'Received data channel message:', message);
                
                if (message.type === 'chat') {
                    this.onChatMessage({
                        userId: message.userId,
                        userName: message.userName,
                        message: message.message,
                        timestamp: message.timestamp || new Date().toISOString(),
                        isSystem: false
                    });
                }
            } catch (error) {
                this.log('error', 'Error handling data channel message', error);
            }
        };
    }
    
    /**
     * Handle ICE candidates
     * 
     * @param {RTCPeerConnectionIceEvent} event - The ICE candidate event
     */
    handleIceCandidate(event) {
        if (event.candidate) {
            this.log('debug', 'Generated ICE candidate for remote peer');
            
            // Send the candidate to the remote peer
            const message = {
                type: 'ice_candidate',
                candidate: event.candidate,
                sessionId: this.sessionId,
                userId: this.userId
            };
            
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify(message));
            } else {
                this.log('warn', 'Cannot send ICE candidate: WebSocket not open');
            }
        } else {
            this.log('info', 'All ICE candidates gathered');
        }
    }
    
    /**
     * Handle remote media tracks
     * 
     * @param {RTCTrackEvent} event - The track event
     */
    handleRemoteTrack(event) {
        this.log('info', 'Received remote track', event.track.kind);
        
        // Get the remote stream
        const remoteStream = event.streams[0];
        
        // Find the user ID associated with this stream
        // This is a simplification - in a real implementation you'd need
        // to identify the sender based on signaling metadata
        const remoteUserId = this.isMentor ? 'learner' : 'mentor'; // Simplified
        const remoteUserName = this.isMentor ? 'Learner' : 'Mentor'; // Simplified
        
        // Store the stream
        this.remoteStreams.set(remoteUserId, remoteStream);
        
        // Notify the UI
        this.onRemoteStream(remoteUserId, remoteUserName, remoteStream, !this.isMentor);
    }
    
    /**
     * Create and send an offer
     */
    async createOffer() {
        if (!this.peerConnection) {
            this.log('error', 'Cannot create offer: no peer connection');
            return;
        }
        
        this.log('info', 'Creating offer');
        
        try {
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            this.log('debug', 'Created offer', offer);
            
            await this.peerConnection.setLocalDescription(offer);
            
            this.log('info', 'Set local description (offer)');
            
            // Send the offer to the remote peer
            const message = {
                type: 'offer',
                offer: offer,
                sessionId: this.sessionId,
                userId: this.userId,
                isMentor: this.isMentor
            };
            
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify(message));
                this.log('info', 'Sent offer to remote peer');
            } else {
                this.log('error', 'Cannot send offer: WebSocket not open');
                throw new Error('WebSocket connection not open');
            }
            
        } catch (error) {
            this.log('error', 'Error creating or sending offer', error);
            this.onError({
                title: 'Connection Error',
                message: 'An error occurred while setting up the connection. Please try refreshing the page.'
            });
        }
    }
    
    /**
     * Handle an incoming offer
     * 
     * @param {Object} message - The offer message
     */
    async handleOffer(message) {
        if (!this.peerConnection) {
            this.log('error', 'Cannot handle offer: no peer connection');
            return;
        }
        
        this.log('info', 'Handling offer from remote peer');
        
        try {
            const remoteOffer = message.offer;
            
            // Set the remote description
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteOffer));
            
            this.log('info', 'Set remote description (offer)');
            
            // Create and send an answer
            await this.createAnswer();
            
        } catch (error) {
            this.log('error', 'Error handling offer', error);
            this.onError({
                title: 'Connection Error',
                message: 'An error occurred while processing the connection. Please try refreshing the page.'
            });
        }
    }
    
    /**
     * Create and send an answer
     */
    async createAnswer() {
        if (!this.peerConnection) {
            this.log('error', 'Cannot create answer: no peer connection');
            return;
        }
        
        this.log('info', 'Creating answer');
        
        try {
            const answer = await this.peerConnection.createAnswer();
            
            this.log('debug', 'Created answer', answer);
            
            await this.peerConnection.setLocalDescription(answer);
            
            this.log('info', 'Set local description (answer)');
            
            // Send the answer to the remote peer
            const message = {
                type: 'answer',
                answer: answer,
                sessionId: this.sessionId,
                userId: this.userId,
                isMentor: this.isMentor
            };
            
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify(message));
                this.log('info', 'Sent answer to remote peer');
            } else {
                this.log('error', 'Cannot send answer: WebSocket not open');
                throw new Error('WebSocket connection not open');
            }
            
        } catch (error) {
            this.log('error', 'Error creating or sending answer', error);
            this.onError({
                title: 'Connection Error',
                message: 'An error occurred while connecting. Please try refreshing the page.'
            });
        }
    }
    
    /**
     * Handle an incoming answer
     * 
     * @param {Object} message - The answer message
     */
    async handleAnswer(message) {
        if (!this.peerConnection) {
            this.log('error', 'Cannot handle answer: no peer connection');
            return;
        }
        
        this.log('info', 'Handling answer from remote peer');
        
        try {
            const remoteAnswer = message.answer;
            
            // Set the remote description
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteAnswer));
            
            this.log('info', 'Set remote description (answer)');
            
        } catch (error) {
            this.log('error', 'Error handling answer', error);
            this.onError({
                title: 'Connection Error',
                message: 'An error occurred while finalizing the connection. Please try refreshing the page.'
            });
        }
    }
    
    /**
     * Handle an incoming ICE candidate
     * 
     * @param {Object} message - The ICE candidate message
     */
    async handleICECandidate(message) {
        if (!this.peerConnection) {
            this.log('error', 'Cannot handle ICE candidate: no peer connection');
            return;
        }
        
        this.log('debug', 'Handling ICE candidate from remote peer');
        
        try {
            const candidate = message.candidate;
            
            // Add the ICE candidate to the peer connection
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            
            this.log('debug', 'Added ICE candidate');
            
        } catch (error) {
            this.log('error', 'Error handling ICE candidate', error);
        }
    }
    
    /**
     * Send a chat message
     * 
     * @param {string} message - The message to send
     */
    sendChatMessage(message) {
        if (!message || message.trim() === '') {
            return;
        }
        
        this.log('debug', 'Sending chat message:', message);
        
        const chatMessage = {
            type: 'chat',
            userId: this.userId,
            userName: this.userName,
            message: message,
            timestamp: new Date().toISOString()
        };
        
        // First try to send via data channel
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(chatMessage));
            
            // Also show the message locally
            this.onChatMessage({
                userId: this.userId,
                userName: this.userName,
                message: message,
                timestamp: chatMessage.timestamp,
                isSystem: false,
                isLocal: true
            });
            
        } else {
            // Fall back to WebSocket
            this.log('debug', 'Data channel not available, sending chat via WebSocket');
            
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                const wsMessage = {
                    type: 'chat_message',
                    message: message,
                    sessionId: this.sessionId,
                    userId: this.userId,
                    userName: this.userName
                };
                
                this.socket.send(JSON.stringify(wsMessage));
                
                // Also show the message locally
                this.onChatMessage({
                    userId: this.userId,
                    userName: this.userName,
                    message: message,
                    timestamp: chatMessage.timestamp,
                    isSystem: false,
                    isLocal: true
                });
                
            } else {
                this.log('error', 'Cannot send chat message: no open connection');
                this.onError({
                    title: 'Message Not Sent',
                    message: 'Your message could not be sent because you are not connected to the session.',
                    severity: 'warning'
                });
            }
        }
    }
    
    /**
     * Toggle microphone mute state
     */
    toggleMicrophone() {
        if (!this.localStream) return;
        
        const audioTracks = this.localStream.getAudioTracks();
        for (const track of audioTracks) {
            track.enabled = !track.enabled;
            this.log('info', `Microphone ${track.enabled ? 'unmuted' : 'muted'}`);
        }
        
        return audioTracks.length > 0 ? audioTracks[0].enabled : false;
    }
    
    /**
     * Toggle camera on/off state
     */
    toggleCamera() {
        if (!this.localStream) return;
        
        const videoTracks = this.localStream.getVideoTracks();
        for (const track of videoTracks) {
            track.enabled = !track.enabled;
            this.log('info', `Camera ${track.enabled ? 'enabled' : 'disabled'}`);
        }
        
        return videoTracks.length > 0 ? videoTracks[0].enabled : false;
    }
    
    /**
     * Toggle screen sharing
     */
    async toggleScreenShare() {
        if (!this.peerConnection) return;
        
        if (!this.isScreenSharing) {
            // Start screen sharing
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                    video: true,
                    audio: false  // Screen sharing audio often causes echo
                });
                
                // Save the original video track to restore later
                const videoTracks = this.localStream.getVideoTracks();
                if (videoTracks.length > 0) {
                    this.originalVideoTrack = videoTracks[0];
                }
                
                // Replace the video track with the screen sharing track
                const screenTrack = screenStream.getVideoTracks()[0];
                
                if (screenTrack) {
                    // Get the sender for the video track
                    const senders = this.peerConnection.getSenders();
                    const videoSender = senders.find(sender => 
                        sender.track && sender.track.kind === 'video'
                    );
                    
                    if (videoSender) {
                        await videoSender.replaceTrack(screenTrack);
                        
                        // Also replace the track in the local stream for the UI
                        if (this.originalVideoTrack) {
                            this.localStream.removeTrack(this.originalVideoTrack);
                        }
                        this.localStream.addTrack(screenTrack);
                        
                        this.isScreenSharing = true;
                        this.log('info', 'Screen sharing started');
                        
                        // Handle the screen sharing being stopped by the browser UI
                        screenTrack.onended = () => {
                            this.stopScreenSharing();
                        };
                        
                        return true;
                    }
                }
            } catch (error) {
                this.log('error', 'Error starting screen sharing', error);
                this.onError({
                    title: 'Screen Sharing Failed',
                    message: 'Could not start screen sharing. Please check your permissions and try again.',
                    severity: 'warning'
                });
            }
        } else {
            // Stop screen sharing
            return this.stopScreenSharing();
        }
        
        return false;
    }
    
    /**
     * Stop screen sharing and restore camera
     */
    async stopScreenSharing() {
        if (!this.isScreenSharing || !this.peerConnection || !this.originalVideoTrack) {
            return false;
        }
        
        try {
            // Get the sender for the current video track (screen sharing)
            const senders = this.peerConnection.getSenders();
            const videoSender = senders.find(sender => 
                sender.track && sender.track.kind === 'video'
            );
            
            if (videoSender) {
                // Replace the screen sharing track with the original camera track
                await videoSender.replaceTrack(this.originalVideoTrack);
                
                // Also replace the track in the local stream for the UI
                const screenTracks = this.localStream.getVideoTracks();
                for (const track of screenTracks) {
                    this.localStream.removeTrack(track);
                    track.stop(); // Stop the screen sharing track
                }
                this.localStream.addTrack(this.originalVideoTrack);
                
                this.isScreenSharing = false;
                this.log('info', 'Screen sharing stopped');
                
                return true;
            }
        } catch (error) {
            this.log('error', 'Error stopping screen sharing', error);
        }
        
        return false;
    }
    
    /**
     * Change audio input device
     * 
     * @param {string} deviceId - The ID of the audio input device
     */
    async changeAudioInput(deviceId) {
        if (!deviceId) return false;
        
        try {
            // Get a stream with the new audio device
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: deviceId } },
                video: false
            });
            
            // Get the new audio track
            const newAudioTrack = newStream.getAudioTracks()[0];
            
            if (newAudioTrack) {
                // Get the sender for the audio track
                const senders = this.peerConnection.getSenders();
                const audioSender = senders.find(sender => 
                    sender.track && sender.track.kind === 'audio'
                );
                
                if (audioSender) {
                    // Replace the audio track
                    await audioSender.replaceTrack(newAudioTrack);
                    
                    // Also replace the track in the local stream
                    const audioTracks = this.localStream.getAudioTracks();
                    for (const track of audioTracks) {
                        this.localStream.removeTrack(track);
                        track.stop();
                    }
                    this.localStream.addTrack(newAudioTrack);
                    
                    this.log('info', 'Audio input device changed');
                    return true;
                }
            }
        } catch (error) {
            this.log('error', 'Error changing audio input device', error);
            this.onError({
                title: 'Device Change Failed',
                message: 'Could not switch to the selected microphone. Please try another device.',
                severity: 'warning'
            });
        }
        
        return false;
    }
    
    /**
     * Change video input device
     * 
     * @param {string} deviceId - The ID of the video input device
     */
    async changeVideoInput(deviceId) {
        if (!deviceId || this.isScreenSharing) return false;
        
        try {
            // Get a stream with the new video device
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { deviceId: { exact: deviceId } }
            });
            
            // Get the new video track
            const newVideoTrack = newStream.getVideoTracks()[0];
            
            if (newVideoTrack) {
                // Save this as the original video track (for screen sharing)
                this.originalVideoTrack = newVideoTrack;
                
                // Get the sender for the video track
                const senders = this.peerConnection.getSenders();
                const videoSender = senders.find(sender => 
                    sender.track && sender.track.kind === 'video'
                );
                
                if (videoSender) {
                    // Replace the video track
                    await videoSender.replaceTrack(newVideoTrack);
                    
                    // Also replace the track in the local stream
                    const videoTracks = this.localStream.getVideoTracks();
                    for (const track of videoTracks) {
                        this.localStream.removeTrack(track);
                        track.stop();
                    }
                    this.localStream.addTrack(newVideoTrack);
                    
                    this.log('info', 'Video input device changed');
                    return true;
                }
            }
        } catch (error) {
            this.log('error', 'Error changing video input device', error);
            this.onError({
                title: 'Device Change Failed',
                message: 'Could not switch to the selected camera. Please try another device.',
                severity: 'warning'
            });
        }
        
        return false;
    }
    
    /**
     * End the call and clean up resources
     */
    endCall() {
        this.log('info', 'Ending call and cleaning up resources');
        
        // Send a message that we're leaving
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const message = {
                type: 'leave',
                sessionId: this.sessionId,
                userId: this.userId,
                userName: this.userName
            };
            
            this.socket.send(JSON.stringify(message));
        }
        
        // Stop all tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        // Clean up resources
        this.cleanupResources();
        
        this.log('info', 'Call ended and resources cleaned up');
        this.onConnectionStateChange('closed');
    }
}