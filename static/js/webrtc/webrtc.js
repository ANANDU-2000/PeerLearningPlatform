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
            // Get user media (camera and microphone)
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            // Display local video stream
            if (this.localVideo) {
                this.localVideo.srcObject = this.localStream;
            }
            
            // Setup WebSocket for signaling
            this.setupWebSocket();
        } catch (error) {
            this.onError("Failed to access camera and microphone: " + error.message);
        }
    }

    /**
     * Setup WebSocket for signaling
     */
    setupWebSocket() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws/video/${this.sessionId}/`;
        
        this.socket = new WebSocket(wsUrl);
        
        this.socket.onopen = () => {
            console.log("WebSocket connection established");
        };
        
        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleSignalingMessage(data);
        };
        
        this.socket.onclose = () => {
            console.log("WebSocket connection closed");
        };
        
        this.socket.onerror = (error) => {
            this.onError("WebSocket error: " + error.message);
        };
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
        const iceServers = [
            ...this.stunServers.map(server => ({ urls: server }))
        ];
        
        // Add TURN servers if available
        if (this.turnServers.length > 0) {
            this.turnServers.forEach(server => {
                iceServers.push({
                    urls: server,
                    username: this.turnUsername,
                    credential: this.turnCredential
                });
            });
        }
        
        // Create peer connection
        const pc = new RTCPeerConnection({ iceServers });
        this.peerConnections[userId] = pc;
        
        // Add local tracks to the connection
        this.localStream.getTracks().forEach(track => {
            pc.addTrack(track, this.localStream);
        });
        
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
        
        // Handle remote tracks
        pc.ontrack = (event) => {
            this.handleRemoteTrack(event, userId, userName);
        };
        
        return pc;
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