/**
 * Enhanced WebRTC Client for PeerLearn sessions
 * Handles peer-to-peer video connections between mentor and learners
 * With improved mobile support and connection reliability
 */

class PeerLearnRTC {
    constructor(config) {
        // Configuration
        this.userId = config.userId;
        this.userName = config.userName;
        this.sessionId = config.sessionId;
        this.isMentor = config.isMentor;
        
        // WebSocket signaling URL (can be provided directly now)
        this.signalingUrl = config.signalingUrl || null;
        
        // ICE servers configuration (used by RTCPeerConnection)
        this.iceServers = config.iceServers || [
            {
                urls: [
                    'stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302',
                    'stun:stun3.l.google.com:19302',
                    'stun:stun4.l.google.com:19302'
                ]
            }
        ];
        
        // For backward compatibility
        this.stunServers = this.getStunServersFromIceConfig(this.iceServers);
        this.turnServers = this.getTurnServersFromIceConfig(this.iceServers);
        
        // Additional config options
        this.turnUsername = config.turnUsername || '';
        this.turnCredential = config.turnCredential || '';

        // WebSocket connection for signaling
        this.socket = null;
        this.forceClosing = false;

        // WebRTC connections
        this.localStream = null;
        this.localVideo = document.getElementById(config.localVideoId);
        this.remoteVideos = {};
        this.peerConnections = {};
        this.dataChannels = {};
        
        // Device detection
        this.isMobile = this.detectMobileDevice();
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        this.isAndroid = /Android/.test(navigator.userAgent);
        
        // Session state
        this.activeParticipants = {};
        this.sessionActive = false;
        this.isRejoining = false;
        this.hasJoinedBefore = false;

        // Connection monitoring and reliability
        this.connectionMonitorInterval = null;
        this.connectionRetryAttempts = {}; // Track retry attempts per user
        this.maxRetryAttempts = 5; // Increased maximum retry attempts
        this.connectionHealth = {}; // Track connection health status
        this.lastIceCandidate = {}; // Track last received ICE candidate time
        this.healthCheckInterval = 10000; // Health check every 10 seconds
        
        // WebSocket reconnection
        this.wsReconnectAttempts = 0;
        this.wsMaxReconnectAttempts = 10; // Increased for better resilience
        this.wsReconnectInterval = 2000; // Start with 2 seconds
        this.wsReconnecting = false;
        this.reconnectTimeout = null;
        
        // UI elements and controls
        this.videoEnabled = true;
        this.audioEnabled = true;
        
        // Event callbacks
        this.onUserJoined = config.onUserJoined || function() {};
        this.onUserLeft = config.onUserLeft || function() {};
        this.onChatMessage = config.onChatMessage || function() {};
        this.onError = config.onError || function(error) { console.error('WebRTC Error:', error); };
        this.onConnectionStateChange = config.onConnectionStateChange || function() {};
        this.onSessionReconnect = config.onSessionReconnect || function() {};
        this.onRejoinSuccess = config.onRejoinSuccess || function() {};
        this.onRejoinFailure = config.onRejoinFailure || function() {};
        
        // Debug mode for verbose logging
        this.debugMode = config.debugMode || true;
        
        // Bind methods to this context to avoid 'this' issues
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
        this.handleDeviceOrientationChange = this.handleDeviceOrientationChange.bind(this);
        
        // Add page visibility and orientation change handlers
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('beforeunload', this.handleBeforeUnload);
        window.addEventListener('orientationchange', this.handleDeviceOrientationChange);
        
        console.log(`WebRTC client initialized with mobile detection: ${this.isMobile ? 'Mobile' : 'Desktop'} device`);
    }

    /**
     * Detect if user is on a mobile device
     */
    detectMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
              (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
    }
    
    /**
     * Handle page visibility changes (switching tabs, minimizing)
     */
    handleVisibilityChange() {
        if (document.visibilityState === 'visible' && this.hasJoinedBefore && !this.sessionActive) {
            console.log("Page became visible again, checking connection status...");
            this.checkConnectionStatus();
        }
    }
    
    /**
     * Handle device orientation changes for mobile devices
     */
    handleDeviceOrientationChange() {
        if (this.isMobile) {
            console.log("Device orientation changed, adjusting video streams");
            
            // Delay adjustment slightly to ensure new dimensions are available
            setTimeout(() => {
                this.adjustVideoForOrientation();
                
                // Also trigger browser layout recalculation for video containers
                if (this.localVideo) {
                    const container = this.localVideo.closest('.video-container');
                    if (container) {
                        // Force layout recalculation
                        container.style.display = 'none';
                        // Use requestAnimationFrame for smoother transition
                        requestAnimationFrame(() => {
                            container.style.display = '';
                        });
                    }
                }
                
                // Request full screen in landscape mode on mobile for better experience
                if (window.innerWidth > window.innerHeight) {
                    // Only try to request fullscreen if it's not already fullscreen
                    if (document.fullscreenElement === null && 
                        document.webkitFullscreenElement === null && 
                        typeof document.documentElement.requestFullscreen === 'function') {
                        
                        document.documentElement.requestFullscreen()
                            .catch(err => console.log("Fullscreen request rejected:", err));
                    }
                }
            }, 500);
            
            // If connections exist, check their status
            if (Object.keys(this.peerConnections).length > 0) {
                setTimeout(() => {
                    this.checkConnectionStatus();
                }, 1000); // Check after a short delay to allow for UI updates
            }
        }
    }
    
    /**
     * Adjust video constraints for current device orientation
     */
    adjustVideoForOrientation() {
        if (!this.localStream) return;
        
        // Get device orientation (landscape or portrait)
        const isLandscape = window.innerWidth > window.innerHeight;
        
        // Get video tracks
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (!videoTrack) return;
        
        console.log(`Adjusting video for ${isLandscape ? 'landscape' : 'portrait'} orientation on ${this.isMobile ? 'mobile' : 'desktop'} device`);
        
        // Adjust constraints for current orientation if supported
        if (videoTrack.getConstraints && videoTrack.applyConstraints) {
            try {
                const currentConstraints = videoTrack.getConstraints();
                let newConstraints = { ...currentConstraints };
                
                // Special handling for iOS devices
                if (this.isIOS) {
                    // iOS works better with specific simple constraints
                    if (isLandscape) {
                        newConstraints = {
                            width: { ideal: 640, max: 1280 },
                            height: { ideal: 360, max: 720 },
                            frameRate: { ideal: 20, max: 30 }
                        };
                    } else {
                        newConstraints = {
                            width: { ideal: 360, max: 720 },
                            height: { ideal: 640, max: 1280 },
                            frameRate: { ideal: 20, max: 30 }
                        };
                    }
                } 
                // Special handling for Android devices
                else if (this.isAndroid) {
                    // Android often works better with facingMode user constraint
                    newConstraints = {
                        ...newConstraints,
                        facingMode: { ideal: 'user' }
                    };
                    
                    // Swap width and height based on orientation
                    if (isLandscape) {
                        newConstraints = {
                            ...newConstraints,
                            width: { ideal: 640, max: 1280 },
                            height: { ideal: 360, max: 720 }
                        };
                    } else {
                        newConstraints = {
                            ...newConstraints,
                            width: { ideal: 360, max: 720 },
                            height: { ideal: 640, max: 1280 }
                        };
                    }
                }
                // For desktop and other devices
                else {
                    // Swap width and height if needed
                    if (isLandscape && currentConstraints.height && currentConstraints.height.ideal > currentConstraints.width.ideal) {
                        newConstraints = {
                            ...currentConstraints,
                            width: currentConstraints.height,
                            height: currentConstraints.width
                        };
                    }
                }
                
                // Apply the new constraints
                videoTrack.applyConstraints(newConstraints)
                    .then(() => console.log(`Applied ${isLandscape ? 'landscape' : 'portrait'} video constraints successfully`))
                    .catch(err => {
                        console.error("Failed to apply orientation constraints:", err);
                        // Fallback to simpler constraints if failed
                        if (this.isMobile) {
                            const fallbackConstraints = {
                                width: { ideal: 640 },
                                height: { ideal: 480 }
                            };
                            videoTrack.applyConstraints(fallbackConstraints)
                                .then(() => console.log("Applied fallback video constraints"))
                                .catch(err => console.error("Failed to apply fallback constraints:", err));
                        }
                    });
            } catch (e) {
                console.error("Error adjusting video for orientation:", e);
            }
        }
    }

    /**
     * Handle before unload event to clean up connections
     */
    handleBeforeUnload(event) {
        if (this.sessionActive) {
            this.forceClosing = true;
            this.cleanup();
        }
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
            
            // Initialize WebSocket first for better synchronization
            try {
                await this.setupWebSocket();
                console.log("WebSocket connection established successfully");
            } catch (wsError) {
                console.error("Failed to establish WebSocket connection:", wsError);
                this.onError("Failed to connect to the session server. Please check your internet connection and try again.");
                // Continue anyway to at least set up local media
            }
            
            try {
                // Detect network speed and adjust video quality accordingly
                let networkQuality = await this.detectNetworkQuality();
                
                // Configure media constraints based on detected network quality and device type
                let mediaConstraints = this.getOptimalMediaConstraints(networkQuality);
                
                console.log(`Using ${networkQuality} quality video settings for ${this.isMobile ? 'mobile' : 'desktop'}`);
                
                // Try to get audio and video separately to handle permission issues better
                let audioStream = null;
                let videoStream = null;
                
                // Get audio stream first
                try {
                    audioStream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: false
                    });
                    console.log("Audio stream obtained successfully");
                } catch (audioErr) {
                    console.warn("Could not get audio stream:", audioErr);
                    this.onError("Could not access your microphone. Please check your browser permissions.");
                }
                
                // Then get video stream
                try {
                    // On iOS, special handling is needed
                    if (this.isIOS) {
                        // First try video with lower constraints
                        videoStream = await navigator.mediaDevices.getUserMedia({
                            audio: false,
                            video: {
                                width: { ideal: 320, max: 640 },
                                height: { ideal: 240, max: 480 },
                                frameRate: { ideal: 15, max: 24 }
                            }
                        });
                    } else {
                        // For other devices, use the optimized constraints
                        videoStream = await navigator.mediaDevices.getUserMedia({
                            audio: false,
                            video: mediaConstraints.video
                        });
                    }
                    console.log("Video stream obtained successfully");
                } catch (videoErr) {
                    console.warn("Could not get video stream:", videoErr);
                    this.onError("Could not access your camera. Please check your browser permissions.");
                }
                
                // Create a combined stream with both audio and video
                if (audioStream || videoStream) {
                    // Create an array of tracks from both streams
                    const tracks = [];
                    if (audioStream) {
                        audioStream.getAudioTracks().forEach(track => tracks.push(track));
                    }
                    if (videoStream) {
                        videoStream.getVideoTracks().forEach(track => tracks.push(track));
                    }
                    
                    // Create a new MediaStream with all tracks
                    this.localStream = new MediaStream(tracks);
                    
                    // Provide appropriate feedback to the user
                    if (!audioStream && videoStream) {
                        this.onError("Microphone access failed. You can be seen but not heard.");
                    } else if (audioStream && !videoStream) {
                        this.onError("Camera access failed. You can be heard but not seen.");
                    }
                } else {
                    throw new Error("Could not access camera or microphone. Please check your browser permissions.");
                }
                
                console.log("Successfully got camera and microphone access");
            } catch (mediaError) {
                console.error("Error accessing media devices:", mediaError);
                
                // Handle permission denial
                if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
                    this.onError("Permission to use camera and microphone was denied. Please allow access to participate in the session.");
                    return;
                }
                
                // Try fallback constraints (common compatibility issues)
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
                // Special handling for iOS devices
                if (this.isIOS) {
                    this.localVideo.onloadedmetadata = () => {
                        this.localVideo.play()
                            .then(() => console.log("Local video playback started on iOS"))
                            .catch(e => console.error("Error playing local video on iOS:", e));
                    };
                    this.localVideo.srcObject = this.localStream;
                } else {
                    this.localVideo.srcObject = this.localStream;
                    this.localVideo.onloadedmetadata = () => {
                        this.localVideo.play()
                            .then(() => console.log("Local video playback started"))
                            .catch(e => console.error("Error playing local video:", e));
                    };
                }
                
                // Add a click handler to replay the video if it stops on mobile
                if (this.isMobile) {
                    this.localVideo.addEventListener('click', () => {
                        this.localVideo.play()
                            .then(() => console.log("Local video playback resumed after click"))
                            .catch(e => console.error("Error resuming local video playback:", e));
                    });
                }
            }
            
            // Setup WebSocket for signaling
            await this.setupWebSocket();
            
            // Start connection health monitoring
            this.startConnectionMonitoring();
            
            // Set session active
            this.sessionActive = true;
            this.hasJoinedBefore = true;
        } catch (error) {
            console.error("WebRTC initialization failed:", error);
            this.onError("Failed to initialize video session: " + error.message);
        }
    }
    
    /**
     * Detect network quality for optimal video settings
     */
    async detectNetworkQuality() {
        try {
            // Default to 'medium' quality
            let networkQuality = 'medium';
            
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
                    networkQuality = 'high';
                    console.log("Detected good connection, using high video quality");
                }
            } else {
                // If navigator.connection is not available, try to estimate network quality
                try {
                    const startTime = Date.now();
                    const response = await fetch('/static/img/pixel.png?' + Math.random(), { cache: 'no-store' });
                    if (response.ok) {
                        const endTime = Date.now();
                        const loadTime = endTime - startTime;
                        
                        if (loadTime < 100) {
                            networkQuality = 'high';
                        } else if (loadTime < 500) {
                            networkQuality = 'medium';
                        } else {
                            networkQuality = 'low';
                        }
                        
                        console.log(`Estimated network quality: ${networkQuality} (load time: ${loadTime}ms)`);
                    }
                } catch (e) {
                    console.warn("Failed to estimate network quality, defaulting to medium", e);
                }
            }
            
            // For mobile devices, automatically reduce quality one step if not already low
            if (this.isMobile && networkQuality === 'high') {
                networkQuality = 'medium';
                console.log("Reducing quality for mobile device");
            }
            
            return networkQuality;
        } catch (e) {
            console.error("Error detecting network quality:", e);
            return 'medium'; // Default to medium quality
        }
    }
    
    /**
     * Get optimal media constraints based on network quality and device
     */
    getOptimalMediaConstraints(networkQuality) {
        // Base constraints
        let videoConstraints = {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 20, max: 30 }
        };
        
        // Adjust based on network quality
        if (networkQuality === 'low') {
            videoConstraints = {
                width: { ideal: 320, max: 640 },
                height: { ideal: 240, max: 480 },
                frameRate: { ideal: 15, max: 20 }
            };
        } else if (networkQuality === 'high' && !this.isMobile) {
            videoConstraints = {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 24, max: 30 }
            };
        }
        
        // Further adjustments for mobile
        if (this.isMobile) {
            // Reduce frameRate for mobile
            videoConstraints.frameRate = { ideal: 15, max: 24 };
            
            // For Android, set specific facingMode and prevent over-constraining
            if (this.isAndroid) {
                videoConstraints.facingMode = { ideal: 'user' };
            }
            
            // For iOS, use simpler constraints to avoid issues
            if (this.isIOS) {
                videoConstraints = {
                    width: { ideal: 320, max: 640 },
                    height: { ideal: 240, max: 480 },
                    facingMode: 'user',
                    frameRate: { ideal: 15, max: 24 }
                };
            }
        }
        
        // Final media constraints
        return {
            audio: true,
            video: videoConstraints
        };
    }
    
    /**
     * Check connection status and attempt to recover if needed
     */
    checkConnectionStatus() {
        console.log("Checking connection status...");
        
        // Check WebSocket connection first
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.log("WebSocket not connected, attempting to reconnect...");
            this.reconnectWebSocket();
            return;
        }
        
        // Check peer connections
        let hasActiveConnections = false;
        for (const userId in this.peerConnections) {
            const pc = this.peerConnections[userId];
            if (pc && (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected')) {
                hasActiveConnections = true;
                break;
            }
        }
        
        // If no active connections and we should be in a session
        if (!hasActiveConnections && this.hasJoinedBefore) {
            console.log("No active connections found, attempting to rejoin session...");
            this.rejoinSession();
        } else {
            console.log("Connection status check complete, connections are active");
            this.sessionActive = true;
        }
    }
    
    /**
     * Attempt to rejoin the current session
     */
    async rejoinSession() {
        if (this.isRejoining) {
            console.log("Already attempting to rejoin, skipping duplicate request");
            return;
        }
        
        this.isRejoining = true;
        console.log("Attempting to rejoin session...");
        
        try {
            // Notify UI that we're trying to reconnect
            this.onSessionReconnect();
            
            // Reset peer connections
            this.closePeerConnections();
            
            // Ensure WebSocket is connected
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                await this.reconnectWebSocket();
            }
            
            // Request current room state
            this.sendSignalingMessage({
                type: 'get_room_state'
            });
            
            // Send join message to reestablish presence
            this.sendSignalingMessage({
                type: 'join',
                client_info: {
                    browser: navigator.userAgent,
                    time: new Date().toISOString(),
                    is_rejoining: true,
                    device_type: this.isMobile ? 'mobile' : 'desktop',
                    connection_history: this.wsReconnectAttempts
                }
            });
            
            // Set a timeout to clear the rejoining flag and check success
            setTimeout(() => {
                const hasConnections = Object.keys(this.peerConnections).length > 0;
                
                this.isRejoining = false;
                
                if (hasConnections) {
                    console.log("Rejoin successful, connections established");
                    this.sessionActive = true;
                    this.onRejoinSuccess();
                } else {
                    console.warn("Rejoin might have failed, no peer connections after timeout");
                    this.onRejoinFailure();
                }
            }, 5000);
        } catch (e) {
            console.error("Error while attempting to rejoin session:", e);
            this.isRejoining = false;
            this.onRejoinFailure();
        }
    }
    
    /**
     * Close all peer connections
     */
    closePeerConnections() {
        for (const userId in this.peerConnections) {
            const pc = this.peerConnections[userId];
            if (pc) {
                pc.close();
            }
            
            // Clean up data channels
            if (this.dataChannels[userId]) {
                this.dataChannels[userId].close();
            }
        }
        
        this.peerConnections = {};
        this.dataChannels = {};
    }
    
    /**
     * Start monitoring WebRTC connections for health and reliability
     */
    startConnectionMonitoring() {
        if (this.connectionMonitorInterval) {
            clearInterval(this.connectionMonitorInterval);
        }
        
        // Start periodic health checks
        this.connectionMonitorInterval = setInterval(() => {
            this.checkAllConnectionsHealth();
        }, this.healthCheckInterval);
        
        console.log("Connection health monitoring started");
    }
    
    /**
     * Setup WebSocket for signaling with automatic reconnection
     */
    async setupWebSocket() {
        return new Promise((resolve, reject) => {
            // Get protocol based on connection security
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            
            // Try different WebSocket URL paths to ensure connection
            // First try the session-specific route, and if that fails, try the video route or room route
            let wsUrls = [];
            
            // If signalingUrl is provided in config, use it first
            if (this.signalingUrl) {
                wsUrls.push(this.signalingUrl);
            }
            
            // Add fallback URLs
            wsUrls = wsUrls.concat([
                `${protocol}//${window.location.host}/ws/session/${this.sessionId}/`,
                `${protocol}//${window.location.host}/ws/video/${this.sessionId}/`,
                `${protocol}//${window.location.host}/ws/room/${this.sessionId}/`
            ]);
            
            let currentUrlIndex = 0;
            const tryConnect = (urlIndex) => {
                if (urlIndex >= wsUrls.length) {
                    console.error("Tried all WebSocket URLs without success");
                    reject(new Error("Could not connect to any WebSocket endpoint"));
                    return;
                }
                
                const wsUrl = wsUrls[urlIndex];
                console.log(`Attempting to connect to WebSocket (attempt ${urlIndex + 1}/${wsUrls.length}):`, wsUrl);
                
                try {
                    this.socket = new WebSocket(wsUrl);
                    
                    this.socket.onopen = () => {
                        console.log(`WebSocket connection established to ${wsUrl}`);
                        this.wsReconnectAttempts = 0;
                        
                        // Send join message to establish presence
                        this.sendSignalingMessage({
                            type: 'join',
                            user_id: this.userId,
                            user_name: this.userName,
                            client_info: {
                                browser: navigator.userAgent,
                                time: new Date().toISOString(),
                                is_rejoining: false,
                                device_type: this.isMobile ? 'mobile' : 'desktop'
                            }
                        });
                        
                        resolve();
                    };
                    
                    this.socket.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            this.handleSignalingMessage(data);
                        } catch (e) {
                            console.error("Error parsing WebSocket message:", e, event.data);
                        }
                    };
                    
                    this.socket.onclose = (event) => {
                        console.warn(`WebSocket closed (code: ${event.code}, reason: ${event.reason || 'No reason provided'})`);
                        
                        if (!this.forceClosing) {
                            this.sessionActive = false;
                            
                            if (this.wsReconnectAttempts < this.wsMaxReconnectAttempts) {
                                this.wsReconnectAttempts++;
                                
                                // Use exponential backoff
                                const delay = Math.min(30000, 2000 * Math.pow(1.5, this.wsReconnectAttempts));
                                
                                console.log(`Attempting to reconnect in ${delay/1000} seconds... (Attempt ${this.wsReconnectAttempts}/${this.wsMaxReconnectAttempts})`);
                                
                                this.reconnectTimeout = setTimeout(() => {
                                    this.reconnectWebSocket();
                                }, delay);
                            } else {
                            this.onError("Unable to reconnect after multiple attempts. The session may have ended or there may be network issues. Please refresh the page to try again.");
                        }
                    }
                };
                
                this.socket.onerror = (error) => {
                    console.error("WebSocket error:", error);
                    if (this.socket.readyState === WebSocket.CONNECTING) {
                        // Try the next WebSocket URL if available
                        if (urlIndex < wsUrls.length - 1) {
                            console.log("Connection failed, trying next WebSocket URL...");
                            setTimeout(() => {
                                tryConnect(urlIndex + 1);
                            }, 1000);
                        } else {
                            reject(new Error("Failed to connect to signaling server after trying all URLs"));
                        }
                    }
                };
            } catch (e) {
                console.error("Error setting up WebSocket:", e);
                
                // Try the next WebSocket URL if available
                if (urlIndex < wsUrls.length - 1) {
                    console.log("Connection failed, trying next WebSocket URL...");
                    setTimeout(() => {
                        tryConnect(urlIndex + 1);
                    }, 1000);
                } else {
                    reject(e);
                }
            }
        };
        
        // Start the connection sequence with the first URL
        tryConnect(0);
    });
    }
    
    /**
     * Reconnect WebSocket
     */
    async reconnectWebSocket() {
        if (this.socket) {
            if (this.socket.readyState === WebSocket.OPEN) {
                console.log("WebSocket already connected");
                return;
            }
            
            try {
                this.socket.close();
            } catch (e) {
                console.error("Error closing existing WebSocket:", e);
            }
        }
        
        try {
            await this.setupWebSocket();
            console.log("WebSocket reconnected successfully");
            
            // Check if we need to rejoin the session
            if (this.hasJoinedBefore) {
                this.rejoinSession();
            }
        } catch (e) {
            console.error("WebSocket reconnection failed:", e);
            this.onError("Connection to the server lost. Attempting to reconnect...");
        }
    }
    
    /**
     * Handle signaling messages from WebSocket
     */
    handleSignalingMessage(data) {
        // Log all messages for debugging
        console.log("Received WebSocket message:", data);
        
        try {
            switch (data.type) {
                case 'user_join':
                    this.handleUserJoin(data);
                    break;
                case 'user_rejoin':
                    // Handle user rejoining separately - this indicates a user has reconnected
                    console.log("User rejoined:", data.user_name);
                    
                    // If we're the mentor and a learner is rejoining, we need to create a new connection to them
                    if (this.isMentor && data.user_id !== this.userId) {
                        console.log("Mentor received rejoin notification from learner, initiating connection");
                        setTimeout(() => {
                            // Small delay to ensure both sides are ready
                            this.createPeerConnection(data.user_id, data.user_name);
                            this.createOffer(data.user_id);
                        }, 1000);
                    }
                    
                    // Update active participants list
                    this.activeParticipants[data.user_id] = {
                        name: data.user_name,
                        is_mentor: data.is_mentor,
                        joined_at: data.timestamp,
                        rejoined: true,
                        disconnected: false // Clear disconnected flag
                    };
                    
                    // Remove reconnecting overlay if exists
                    if (this.remoteVideos[data.user_id] && this.remoteVideos[data.user_id].element) {
                        const videoElement = this.remoteVideos[data.user_id].element;
                        const overlay = videoElement.parentElement.querySelector('.reconnecting-overlay');
                        if (overlay) {
                            overlay.parentElement.removeChild(overlay);
                        }
                    }
                    break;
                case 'user_leave':
                    this.handleUserLeave(data);
                    break;
                case 'user_disconnected':
                    this.handleUserDisconnected(data);
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
                case 'room_state':
                    this.handleRoomState(data);
                    break;
                case 'connection_error':
                    this.handleConnectionError(data);
                    break;
                case 'join_ack':
                    console.log("Join acknowledged by server");
                    this.sessionActive = true;
                    this.hasJoinedBefore = true;
                    break;
                case 'ping':
                    // Send pong back
                    this.sendSignalingMessage({
                        type: 'pong',
                        timestamp: new Date().toISOString()
                    });
                    break;
                case 'error':
                    console.error("Error message from signaling server:", data.message);
                    this.onError(data.message);
                    break;
                default:
                    console.log("Unknown message type:", data.type);
            }
        } catch (e) {
            console.error("Error handling WebSocket message:", e);
            this.onError("Error handling message from server. Please refresh the page to reconnect.");
        }
    }
    
    /**
     * Handle the room state message (received after requesting room state)
     */
    handleRoomState(data) {
        console.log("Received room state:", data);
        
        // Get participants from room state
        const participants = data.participants || [];
        
        if (participants.length > 0) {
            console.log(`Room has ${participants.length} active participants`);
            
            // If we're the mentor, we need to initialize connections to learners
            if (this.isMentor) {
                participants.forEach(participant => {
                    if (participant.user_id !== this.userId && participant.user_id !== 'mentor') {
                        console.log(`Mentor creating connection to rejoined participant: ${participant.user_id}`);
                        this.createPeerConnection(participant.user_id, participant.user_name || 'Learner');
                        this.createOffer(participant.user_id);
                    }
                });
            }
            // If we're a learner, we don't initiate connections - the mentor will send us an offer
        } else {
            console.log("Room appears to be empty or room state not including participants");
        }
    }
    
    /**
     * Handle connection error messages
     */
    handleConnectionError(data) {
        console.warn("Connection error message received:", data);
        
        // If the message is for us
        if (data.to_user_id === this.userId || data.to_user_id === 'all' || 
            (this.isMentor && data.to_user_id === 'mentor')) {
            
            // Handle mentor-specific reconnection requests
            if (this.isMentor && data.error === 'learner_requesting_reconnect') {
                const learnerId = data.user_id;
                console.log(`Learner ${learnerId} requested reconnection, recreating connection`);
                
                // Close existing connection if any
                if (this.peerConnections[learnerId]) {
                    this.peerConnections[learnerId].close();
                    delete this.peerConnections[learnerId];
                }
                
                // Create new connection to learner
                this.createPeerConnection(learnerId, data.user_name || 'Learner');
                this.createOffer(learnerId);
            }
            
            // For general connection errors, check our connection status
            setTimeout(() => {
                this.checkConnectionStatus();
            }, 1000);
        }
    }

    /**
     * Handle new user joining the session
     */
    handleUserJoin(data) {
        console.log("User joined:", data.user_name);
        
        // Track active participants
        this.activeParticipants[data.user_id] = {
            name: data.user_name,
            is_mentor: data.is_mentor,
            joined_at: data.timestamp
        };
        
        // Update session state
        this.sessionActive = true;
        
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
        
        // Remove from active participants
        if (this.activeParticipants[data.user_id]) {
            delete this.activeParticipants[data.user_id];
        }
        
        // Close peer connection if exists
        if (this.peerConnections[data.user_id]) {
            this.peerConnections[data.user_id].close();
            delete this.peerConnections[data.user_id];
        }
        
        // Clean up data channel
        if (this.dataChannels[data.user_id]) {
            this.dataChannels[data.user_id].close();
            delete this.dataChannels[data.user_id];
        }
        
        // Remove video element
        if (this.remoteVideos[data.user_id]) {
            const container = document.getElementById('remote-videos');
            if (container && this.remoteVideos[data.user_id].element) {
                container.removeChild(this.remoteVideos[data.user_id].element);
            }
            delete this.remoteVideos[data.user_id];
        }
        
        // Notify application
        this.onUserLeft(data);
    }
    
    /**
     * Handle user temporary disconnection - they might reconnect
     */
    handleUserDisconnected(data) {
        console.log("User temporarily disconnected:", data.user_name, "with code:", data.close_code);
        
        if (this.activeParticipants[data.user_id]) {
            // Mark as disconnected but don't remove yet
            this.activeParticipants[data.user_id].disconnected = true;
            this.activeParticipants[data.user_id].disconnectedAt = new Date().getTime();
            
            // Add a visual indication to the user's video that they might reconnect
            if (this.remoteVideos[data.user_id] && this.remoteVideos[data.user_id].element) {
                const videoElement = this.remoteVideos[data.user_id].element;
                
                // Add reconnecting overlay if not already present
                if (!videoElement.querySelector('.reconnecting-overlay')) {
                    const overlay = document.createElement('div');
                    overlay.className = 'reconnecting-overlay';
                    overlay.innerHTML = '<span>Reconnecting...</span>';
                    overlay.style.position = 'absolute';
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.width = '100%';
                    overlay.style.height = '100%';
                    overlay.style.display = 'flex';
                    overlay.style.alignItems = 'center';
                    overlay.style.justifyContent = 'center';
                    overlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
                    overlay.style.color = 'white';
                    overlay.style.zIndex = '10';
                    
                    const container = videoElement.parentElement;
                    if (container) {
                        container.style.position = 'relative';
                        container.appendChild(overlay);
                    }
                }
            }
            
            // Don't close the connection yet - wait for the user_leave event
            // which will be triggered automatically if they don't reconnect
            
            // Notify the application about the temporary disconnection
            if (typeof this.onConnectionStateChange === 'function') {
                this.onConnectionStateChange({
                    userId: data.user_id,
                    state: 'reconnecting',
                    userName: data.user_name
                });
            }
        }
    }

    /**
     * Create RTCPeerConnection for a remote peer
     */
    createPeerConnection(userId, userName) {
        console.log(`Creating peer connection to user ${userId} (${userName})`);
        
        // Close any existing connection
        if (this.peerConnections[userId]) {
            console.log(`Closing existing connection to user ${userId}`);
            this.peerConnections[userId].close();
        }
        
        // Use the pre-configured ICE servers from the constructor
        // This is already properly formatted with both STUN and TURN
        const iceServers = this.iceServers;
        
        // Enhanced RTC configuration
        const rtcConfig = {
            iceServers: iceServers,
            iceTransportPolicy: 'all', // Use 'relay' for forced TURN usage
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            sdpSemantics: 'unified-plan',
            // These are important for faster connectivity
            iceCandidatePoolSize: 10
        };
        
        console.log("Using RTC configuration:", rtcConfig);
        
        try {
            // Create peer connection with config
            const pc = new RTCPeerConnection(rtcConfig);
            this.peerConnections[userId] = pc;
            
            // Set up data channel for faster signaling
            if (this.isMentor) {
                const dataChannel = pc.createDataChannel('signal', {
                    ordered: true,
                    negotiated: false
                });
                
                dataChannel.onopen = () => console.log(`Data channel to ${userId} opened`);
                dataChannel.onclose = () => console.log(`Data channel to ${userId} closed`);
                dataChannel.onerror = (e) => console.error(`Data channel error: ${e}`);
                
                this.dataChannels[userId] = dataChannel;
            } else {
                pc.ondatachannel = (event) => {
                    const dataChannel = event.channel;
                    
                    dataChannel.onopen = () => console.log(`Data channel from mentor opened`);
                    dataChannel.onclose = () => console.log(`Data channel from mentor closed`);
                    dataChannel.onerror = (e) => console.error(`Data channel error: ${e}`);
                    
                    this.dataChannels[userId] = dataChannel;
                };
            }
            
            // Track ICE gathering state
            pc.onicegatheringstatechange = () => {
                console.log(`ICE gathering state for ${userId}: ${pc.iceGatheringState}`);
            };
            
            // Track ICE connection state
            pc.oniceconnectionstatechange = () => {
                console.log(`ICE connection state for ${userId}: ${pc.iceConnectionState}`);
                
                // Update connection health status
                this.connectionHealth[userId] = pc.iceConnectionState;
                
                // Call user-provided connection state change handler
                this.onConnectionStateChange({
                    userId: userId,
                    state: pc.iceConnectionState
                });
                
                // Handle failure states
                if (pc.iceConnectionState === 'disconnected' || 
                    pc.iceConnectionState === 'failed' ||
                    pc.iceConnectionState === 'closed') {
                    
                    console.warn(`ICE connection to ${userId} in state: ${pc.iceConnectionState}`);
                    this.handleConnectionFailure(userId);
                }
            };
            
            // Track connection state
            pc.onconnectionstatechange = () => {
                console.log(`Connection state for ${userId}: ${pc.connectionState}`);
                
                // Mobile browsers sometimes don't report all ICE states correctly,
                // so we also track the connection state as a backup
                if (pc.connectionState === 'disconnected' || 
                    pc.connectionState === 'failed' ||
                    pc.connectionState === 'closed') {
                    
                    console.warn(`Connection to ${userId} in state: ${pc.connectionState}`);
                    this.handleConnectionFailure(userId);
                }
            };
            
            // Track ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    // Update timestamp for last received candidate
                    this.lastIceCandidate[userId] = Date.now();
                    
                    // Send candidate to remote peer
                    this.sendSignalingMessage({
                        type: 'candidate',
                        candidate: event.candidate,
                        to_user_id: userId
                    });
                } else {
                    console.log(`All ICE candidates gathered for user ${userId}`);
                }
            };
            
            // Track remote streams and handle mobile-specific issues
            pc.ontrack = (event) => {
                console.log(`Received remote track from user ${userId}`, event.streams);
                
                if (event.streams && event.streams[0]) {
                    // Create or get video element
                    let videoElement;
                    
                    if (!this.remoteVideos[userId]) {
                        // Create new video element
                        videoElement = document.createElement('video');
                        videoElement.id = `remote-video-${userId}`;
                        videoElement.autoplay = true;
                        videoElement.playsInline = true; // Important for iOS
                        
                        // On iOS, muted videos autoplay more reliably
                        if (this.isIOS) {
                            videoElement.muted = true;
                        }
                        
                        // Create container if not exists
                        const videosContainer = document.getElementById('remote-videos');
                        if (videosContainer) {
                            // Create a wrapper for the video element with user name
                            const videoWrapper = document.createElement('div');
                            videoWrapper.className = 'video-wrapper';
                            
                            // Add a name label
                            const nameLabel = document.createElement('div');
                            nameLabel.className = 'video-name-label';
                            nameLabel.textContent = userName;
                            
                            videoWrapper.appendChild(videoElement);
                            videoWrapper.appendChild(nameLabel);
                            videosContainer.appendChild(videoWrapper);
                        } else {
                            console.warn("Remote videos container not found!");
                        }
                        
                        // Store video element reference
                        this.remoteVideos[userId] = {
                            element: videoElement,
                            stream: event.streams[0]
                        };
                    } else {
                        // Use existing video element
                        videoElement = this.remoteVideos[userId].element;
                        this.remoteVideos[userId].stream = event.streams[0];
                    }
                    
                    // Set the stream as source
                    videoElement.srcObject = event.streams[0];
                    
                    // Add event listeners for special handling on mobile
                    if (this.isMobile) {
                        // Add tap-to-play functionality for mobile
                        videoElement.addEventListener('click', () => {
                            videoElement.play()
                                .then(() => console.log(`Remote video playback resumed for ${userId}`))
                                .catch(e => console.error(`Error resuming remote video for ${userId}:`, e));
                        });
                        
                        // For iOS, we need to handle play/pause events
                        if (this.isIOS) {
                            videoElement.addEventListener('pause', () => {
                                console.log(`Remote video for ${userId} paused, attempting to resume`);
                                setTimeout(() => {
                                    videoElement.play()
                                        .then(() => console.log(`Successfully resumed video for ${userId}`))
                                        .catch(e => console.error(`Failed to resume video for ${userId}:`, e));
                                }, 500);
                            });
                        }
                    }
                    
                    // Ensure playback starts
                    videoElement.onloadedmetadata = () => {
                        videoElement.play()
                            .then(() => console.log(`Remote video playback started for ${userId}`))
                            .catch(e => {
                                console.error(`Error starting remote video for ${userId}:`, e);
                                
                                // For iOS, try muting to allow autoplay
                                if (this.isIOS && !videoElement.muted) {
                                    console.log("Trying to mute video to enable autoplay on iOS");
                                    videoElement.muted = true;
                                    videoElement.play()
                                        .then(() => console.log(`Remote video playback started (muted) for ${userId}`))
                                        .catch(e2 => console.error(`Even muted playback failed for ${userId}:`, e2));
                                }
                            });
                    };
                }
            };
            
            // Add local streams to peer connection
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    console.log(`Adding ${track.kind} track to peer connection for ${userId}`);
                    pc.addTrack(track, this.localStream);
                });
            } else {
                console.warn(`No local stream available when creating connection to ${userId}`);
            }
            
            return pc;
        } catch (e) {
            console.error(`Error creating peer connection to ${userId}:`, e);
            this.onError(`Failed to create connection: ${e.message}`);
            return null;
        }
    }

    /**
     * Create and send an offer to a peer
     */
    async createOffer(userId) {
        try {
            const pc = this.peerConnections[userId];
            if (!pc) {
                console.error(`Cannot create offer - no peer connection for user ${userId}`);
                return;
            }
            
            console.log(`Creating offer for user ${userId}`);
            
            // Enhanced offer options optimized for video calls
            const offerOptions = {
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
                voiceActivityDetection: true,
                iceRestart: true  // Enable ICE restart for better recovery
            };
            
            const offer = await pc.createOffer(offerOptions);
            
            // For mobile optimization: set bitrates and limits
            if (this.isMobile) {
                // Optimize SDP for mobile devices with limited bandwidth
                offer.sdp = this.optimizeSdpForMobile(offer.sdp);
            }
            
            await pc.setLocalDescription(offer);
            
            // Send the offer via signaling channel
            this.sendSignalingMessage({
                type: 'offer',
                offer: {
                    type: offer.type,
                    sdp: offer.sdp
                },
                to_user_id: userId
            });
            
            console.log(`Offer sent to user ${userId}`);
        } catch (e) {
            console.error(`Error creating offer for user ${userId}:`, e);
            this.onError(`Failed to create connection offer: ${e.message}`);
        }
    }

    /**
     * Optimize SDP for mobile devices
     */
    optimizeSdpForMobile(sdp) {
        // Split SDP into lines for manipulation
        let lines = sdp.split('\\r\\n');
        
        // Find video media section
        let videoSection = false;
        let newSdp = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Detect video section
            if (line.indexOf('m=video') === 0) {
                videoSection = true;
            } else if (line.indexOf('m=') === 0 && line.indexOf('m=video') !== 0) {
                videoSection = false;
            }
            
            // Keep line by default
            newSdp.push(line);
            
            // For video section, add bitrate limit
            if (videoSection && line.indexOf('a=rtpmap') === 0) {
                // Add bandwidth limit after a VP8/VP9/H264 codec line
                // This assumes the format is a=rtpmap:<payload> <encoding>/<clock rate>
                // Extracting the payload number for matching in a=fmtp line
                const parts = line.split(' ');
                if (parts.length >= 2) {
                    const payload = parts[0].split(':')[1];
                    
                    // Find or add corresponding fmtp line
                    const fmtpIdx = lines.findIndex(l => l.indexOf(`a=fmtp:${payload}`) === 0);
                    
                    if (fmtpIdx !== -1) {
                        // Append mobile-optimized parameters
                        if (lines[fmtpIdx].indexOf('x-google-') === -1) {
                            lines[fmtpIdx] += ';x-google-max-bitrate=800;x-google-min-bitrate=100;x-google-start-bitrate=300';
                            // Don't add to newSdp here, it will be added when we hit that line
                        }
                    } else {
                        // Add a new fmtp line with bitrate limits
                        newSdp.push(`a=fmtp:${payload} x-google-max-bitrate=800;x-google-min-bitrate=100;x-google-start-bitrate=300`);
                    }
                }
            }
        }
        
        return newSdp.join('\\r\\n');
    }

    /**
     * Handle an incoming offer from a peer
     */
    async handleOffer(data) {
        try {
            const userId = data.from_user_id;
            console.log(`Received offer from user ${userId}`);
            
            // Create peer connection if it doesn't exist
            if (!this.peerConnections[userId]) {
                this.createPeerConnection(userId, "Remote User");
            }
            
            const pc = this.peerConnections[userId];
            
            // Process the offer
            const offer = new RTCSessionDescription(data.offer);
            
            // Set remote description (the offer)
            await pc.setRemoteDescription(offer);
            
            // Create answer
            const answer = await pc.createAnswer();
            
            // For mobile optimization: optimize SDP
            if (this.isMobile) {
                answer.sdp = this.optimizeSdpForMobile(answer.sdp);
            }
            
            await pc.setLocalDescription(answer);
            
            // Send answer to signaling server
            this.sendSignalingMessage({
                type: 'answer',
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },
                to_user_id: userId
            });
            
            console.log(`Answer sent to user ${userId}`);
        } catch (e) {
            console.error("Error handling offer:", e);
            this.onError(`Failed to handle connection offer: ${e.message}`);
        }
    }

    /**
     * Handle an incoming answer from a peer
     */
    async handleAnswer(data) {
        try {
            const userId = data.from_user_id;
            console.log(`Received answer from user ${userId}`);
            
            const pc = this.peerConnections[userId];
            if (!pc) {
                console.error(`No peer connection for user ${userId}`);
                return;
            }
            
            const answer = new RTCSessionDescription(data.answer);
            await pc.setRemoteDescription(answer);
            
            console.log(`Answer from user ${userId} processed`);
        } catch (e) {
            console.error("Error handling answer:", e);
            this.onError(`Failed to process connection answer: ${e.message}`);
        }
    }

    /**
     * Handle an incoming ICE candidate from a peer
     */
    async handleCandidate(data) {
        try {
            const userId = data.from_user_id;
            
            const pc = this.peerConnections[userId];
            if (!pc) {
                console.error(`No peer connection for user ${userId}`);
                return;
            }
            
            const candidate = new RTCIceCandidate(data.candidate);
            
            // Mobile optimization: prioritize host candidates
            if (this.isMobile && candidate.candidate.indexOf('typ relay') > -1) {
                console.log("Deprioritizing relay candidate on mobile");
                // On mobile, we'll still add relay candidates but with lower priority
                // by doing it after a slight delay
                setTimeout(() => {
                    pc.addIceCandidate(candidate)
                        .catch(e => console.error(`Error adding delayed ICE candidate:`, e));
                }, 1000);
                return;
            }
            
            // Update timestamp for ICE candidates received
            this.lastIceCandidate[userId] = Date.now();
            
            // Add the candidate
            await pc.addIceCandidate(candidate);
        } catch (e) {
            console.error("Error handling ICE candidate:", e);
        }
    }

    /**
     * Send a message through the signaling channel
     */
    sendSignalingMessage(message) {
        if (!this.socket) {
            console.error("Cannot send message, WebSocket is not initialized:", message.type);
            return false;
        }
        
        if (this.socket.readyState === WebSocket.OPEN) {
            try {
                console.log("Sending message:", message.type);
                this.socket.send(JSON.stringify(message));
                return true;
            } catch (e) {
                console.error("Error sending message:", e);
                return false;
            }
        } else {
            console.warn(`Cannot send message, WebSocket state is ${this.socket.readyState} (${this.getReadyStateString(this.socket.readyState)})`);
            
            // Queue important messages for later sending
            if (!this.messageQueue) {
                this.messageQueue = [];
            }
            
            // Don't queue real-time media negotiation messages as they'll be stale
            const nonQueueableTypes = ['candidate', 'offer', 'answer'];
            if (!nonQueueableTypes.includes(message.type)) {
                this.messageQueue.push(message);
                console.log(`Message queued (${message.type}). Queue size: ${this.messageQueue.length}`);
            }
            
            // Attempt to reconnect if not connecting or closing
            if (this.socket.readyState !== WebSocket.CONNECTING && 
                this.socket.readyState !== WebSocket.CLOSING) {
                this.reconnectWebSocket();
            }
            
            return false;
        }
    }
    
    /**
     * Get string representation of WebSocket ready state
     */
    getReadyStateString(state) {
        switch (state) {
            case WebSocket.CONNECTING: return 'CONNECTING';
            case WebSocket.OPEN: return 'OPEN';
            case WebSocket.CLOSING: return 'CLOSING';
            case WebSocket.CLOSED: return 'CLOSED';
            default: return 'UNKNOWN';
        }
    }
    
    /**
     * Extract STUN servers from the ICE configuration
     */
    getStunServersFromIceConfig(iceServers) {
        let stunServers = [];
        
        if (!iceServers || !Array.isArray(iceServers)) {
            return ['stun:stun.l.google.com:19302'];
        }
        
        iceServers.forEach(server => {
            if (server.urls) {
                // Handle both string and array formats
                const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
                
                urls.forEach(url => {
                    if (typeof url === 'string' && url.startsWith('stun:')) {
                        stunServers.push(url);
                    }
                });
            }
        });
        
        // If no STUN servers found, use default
        if (stunServers.length === 0) {
            return ['stun:stun.l.google.com:19302'];
        }
        
        return stunServers;
    }
    
    /**
     * Extract TURN servers from the ICE configuration
     */
    getTurnServersFromIceConfig(iceServers) {
        let turnServers = [];
        
        if (!iceServers || !Array.isArray(iceServers)) {
            return [];
        }
        
        iceServers.forEach(server => {
            if (server.urls) {
                // Handle both string and array formats
                const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
                
                urls.forEach(url => {
                    if (typeof url === 'string' && url.startsWith('turn:')) {
                        turnServers.push(url);
                    }
                });
            }
        });
        
        return turnServers;
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
            
            this.onError(`Connection issues persist. This may be due to network firewalls or restrictive security settings. Try refreshing the page or using a different device.`);
            
            // Reset retry counter so we can try again later if needed
            this.connectionRetryAttempts[userId] = 0;
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
     * Check the health of all active peer connections
     */
    checkAllConnectionsHealth() {
        if (this.debugMode) {
            console.log("Performing connection health check");
        }
        
        let allConnectionsHealthy = true;
        
        const userIds = Object.keys(this.peerConnections);
        for (const userId of userIds) {
            const pc = this.peerConnections[userId];
            if (!pc) continue;
            
            // Check connection state
            const connectionState = pc.connectionState || pc.iceConnectionState;
            const lastHealth = this.connectionHealth[userId] || 'unknown';
            
            // Update connection health status
            this.connectionHealth[userId] = connectionState;
            
            if (this.debugMode) {
                console.log(`Connection health for user ${userId}: ${connectionState}`);
            }
            
            // Track if any connection is unhealthy
            if (connectionState !== 'connected' && connectionState !== 'completed') {
                allConnectionsHealthy = false;
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
                    console.log(`Connection to user ${userId} recovered successfully`);
                    // Reset retry counter after successful recovery
                    this.connectionRetryAttempts[userId] = 0;
                }
            }
            
            // Check for ICE gathering stalls (no new candidates received in a while)
            const lastIceCandidateTime = this.lastIceCandidate[userId] || 0;
            const now = Date.now();
            
            // If no ICE candidates for 20 seconds during gathering and not connected
            if (pc.iceGatheringState === 'gathering' && 
                lastIceCandidateTime > 0 && 
                now - lastIceCandidateTime > 20000 &&
                (connectionState !== 'connected' && connectionState !== 'completed')) {
                
                console.warn(`ICE gathering may be stalled for user ${userId}, attempting recovery`);
                this.handleConnectionFailure(userId);
            }
        }
        
        // Update session active state based on connection health
        if (userIds.length > 0) {
            this.sessionActive = allConnectionsHealthy;
            
            // If session became inactive, try to rejoin
            if (!allConnectionsHealthy && !this.isRejoining && this.hasJoinedBefore) {
                console.log("Connections not healthy, attempting to rejoin session");
                this.rejoinSession();
            }
        }
    }

    /**
     * Toggle local video
     */
    toggleVideo() {
        if (this.localStream) {
            const videoTracks = this.localStream.getVideoTracks();
            if (videoTracks.length > 0) {
                this.videoEnabled = !this.videoEnabled;
                videoTracks.forEach(track => {
                    track.enabled = this.videoEnabled;
                });
                
                return this.videoEnabled;
            }
        }
        return false;
    }

    /**
     * Toggle local audio
     */
    toggleAudio() {
        if (this.localStream) {
            const audioTracks = this.localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                this.audioEnabled = !this.audioEnabled;
                audioTracks.forEach(track => {
                    track.enabled = this.audioEnabled;
                });
                
                return this.audioEnabled;
            }
        }
        return false;
    }

    /**
     * Clean up WebRTC resources
     */
    cleanup() {
        console.log("Cleaning up WebRTC resources");
        
        // Stop monitoring
        if (this.connectionMonitorInterval) {
            clearInterval(this.connectionMonitorInterval);
            this.connectionMonitorInterval = null;
        }
        
        // Clear reconnect timeout
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        // Close and clean up peer connections
        this.closePeerConnections();
        
        // Close WebSocket
        if (this.socket) {
            if (this.socket.readyState === WebSocket.OPEN) {
                this.socket.close(1000, "User left session");
            }
            this.socket = null;
        }
        
        // Stop local media tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
            });
            this.localStream = null;
        }
        
        // Clear local video
        if (this.localVideo) {
            this.localVideo.srcObject = null;
        }
        
        // Remove event listeners
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
        window.removeEventListener('orientationchange', this.handleDeviceOrientationChange);
        
        console.log("WebRTC resources cleaned up");
    }
}