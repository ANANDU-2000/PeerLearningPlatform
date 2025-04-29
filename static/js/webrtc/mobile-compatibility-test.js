/**
 * PeerLearn Mobile Compatibility Test Script
 * This script helps test and verify mobile compatibility features
 * for WebRTC video sessions in the PeerLearn platform.
 */

class MobileCompatibilityTest {
    constructor() {
        // Detect mobile device
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        this.isAndroid = /Android/i.test(navigator.userAgent);
        
        // Results container
        this.results = {
            deviceType: this.isMobile ? (this.isIOS ? 'iOS' : (this.isAndroid ? 'Android' : 'Other Mobile')) : 'Desktop',
            userAgent: navigator.userAgent,
            tests: {},
            networkInfo: {},
            orientationSupport: {}
        };
        
        console.log(`Mobile Compatibility Test initialized for ${this.results.deviceType} device`);
    }
    
    /**
     * Run all compatibility tests
     */
    async runAllTests() {
        try {
            // Get network information
            this.testNetworkInfo();
            
            // Test media capabilities
            await this.testMediaCapabilities();
            
            // Test orientation handling
            this.testOrientationSupport();
            
            // Test WebRTC support
            this.testWebRTCSupport();
            
            // Display results
            console.log('Mobile Compatibility Test Results:', this.results);
            return this.results;
        } catch (error) {
            console.error('Error running mobile compatibility tests:', error);
            this.results.error = error.message;
            return this.results;
        }
    }
    
    /**
     * Test network information capabilities
     */
    testNetworkInfo() {
        if (navigator.connection) {
            this.results.networkInfo = {
                effectiveType: navigator.connection.effectiveType || 'unknown',
                downlink: navigator.connection.downlink || 'unknown',
                rtt: navigator.connection.rtt || 'unknown',
                saveData: navigator.connection.saveData || false,
                supported: true
            };
        } else {
            this.results.networkInfo = {
                supported: false,
                reason: 'navigator.connection not available'
            };
        }
        
        this.results.tests.networkInfo = this.results.networkInfo.supported;
        return this.results.networkInfo;
    }
    
    /**
     * Test media capabilities
     */
    async testMediaCapabilities() {
        this.results.tests.mediaDevices = !!navigator.mediaDevices;
        this.results.tests.getUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        
        if (this.results.tests.getUserMedia) {
            try {
                // Test video access
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                this.results.tests.videoAccess = true;
                
                // Get video tracks info
                if (videoStream.getVideoTracks().length > 0) {
                    const videoTrack = videoStream.getVideoTracks()[0];
                    this.results.videoCapabilities = {
                        label: videoTrack.label,
                        constraintsSupported: !!(videoTrack.getConstraints && videoTrack.applyConstraints),
                        settings: videoTrack.getSettings ? videoTrack.getSettings() : 'Not supported'
                    };
                }
                
                // Stop video stream
                videoStream.getTracks().forEach(track => track.stop());
                
                // Test audio access
                const audioStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                this.results.tests.audioAccess = true;
                
                // Stop audio stream
                audioStream.getTracks().forEach(track => track.stop());
            } catch (error) {
                console.warn('Media access test failed:', error);
                this.results.tests.videoAccess = false;
                this.results.tests.audioAccess = false;
                this.results.mediaAccessError = error.name || error.message;
            }
        }
        
        return this.results.tests;
    }
    
    /**
     * Test orientation support
     */
    testOrientationSupport() {
        this.results.orientationSupport = {
            orientationEvent: 'onorientationchange' in window,
            orientationProperty: 'orientation' in window,
            screenOrientation: 'orientation' in screen,
            matchMedia: !!(window.matchMedia && window.matchMedia("(orientation: portrait)").matches !== undefined),
            currentOrientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
        };
        
        this.results.tests.orientationSupport = Object.values(this.results.orientationSupport).some(val => val === true);
        return this.results.orientationSupport;
    }
    
    /**
     * Test WebRTC support
     */
    testWebRTCSupport() {
        this.results.webRTCSupport = {
            RTCPeerConnection: !!window.RTCPeerConnection,
            RTCSessionDescription: !!window.RTCSessionDescription,
            RTCIceCandidate: !!window.RTCIceCandidate,
            performance: this.testRTCPerformance()
        };
        
        this.results.tests.webRTCSupport = this.results.webRTCSupport.RTCPeerConnection && 
                                           this.results.webRTCSupport.RTCSessionDescription && 
                                           this.results.webRTCSupport.RTCIceCandidate;
        
        return this.results.webRTCSupport;
    }
    
    /**
     * Test RTC performance characteristics
     */
    testRTCPerformance() {
        // Create a sample peer connection to test initialization time
        const startTime = performance.now();
        const pc = new RTCPeerConnection();
        const endTime = performance.now();
        pc.close();
        
        return {
            initializationTime: endTime - startTime,
            performanceAPI: !!window.performance
        };
    }
    
    /**
     * Generate HTML report of test results
     */
    generateHTMLReport() {
        let html = `
            <div class="mobile-compatibility-results">
                <h2>Mobile Compatibility Test Results</h2>
                <div class="result-section">
                    <h3>Device Information</h3>
                    <p><strong>Device Type:</strong> ${this.results.deviceType}</p>
                    <p><strong>User Agent:</strong> ${this.results.userAgent}</p>
                    <p><strong>Viewport Size:</strong> ${window.innerWidth}x${window.innerHeight}</p>
                    <p><strong>Orientation:</strong> ${this.results.orientationSupport.currentOrientation}</p>
                </div>
                
                <div class="result-section">
                    <h3>Test Results</h3>
                    <ul>
                        ${Object.entries(this.results.tests).map(([key, value]) => 
                            `<li><strong>${key}:</strong> <span class="${value ? 'passed' : 'failed'}">${value ? 'Passed' : 'Failed'}</span></li>`
                        ).join('')}
                    </ul>
                </div>
                
                <div class="result-section">
                    <h3>Network Information</h3>
                    ${this.results.networkInfo.supported ? 
                        `<p><strong>Connection Type:</strong> ${this.results.networkInfo.effectiveType}</p>
                         <p><strong>Downlink:</strong> ${this.results.networkInfo.downlink} Mbps</p>
                         <p><strong>Round Trip Time:</strong> ${this.results.networkInfo.rtt} ms</p>
                         <p><strong>Data Saver:</strong> ${this.results.networkInfo.saveData ? 'Enabled' : 'Disabled'}</p>` 
                        : 
                        `<p>Network Information API not supported</p>`
                    }
                </div>
                
                <div class="result-section">
                    <h3>WebRTC Support</h3>
                    <ul>
                        <li><strong>RTCPeerConnection:</strong> <span class="${this.results.webRTCSupport.RTCPeerConnection ? 'passed' : 'failed'}">${this.results.webRTCSupport.RTCPeerConnection ? 'Supported' : 'Not Supported'}</span></li>
                        <li><strong>RTCSessionDescription:</strong> <span class="${this.results.webRTCSupport.RTCSessionDescription ? 'passed' : 'failed'}">${this.results.webRTCSupport.RTCSessionDescription ? 'Supported' : 'Not Supported'}</span></li>
                        <li><strong>RTCIceCandidate:</strong> <span class="${this.results.webRTCSupport.RTCIceCandidate ? 'passed' : 'failed'}">${this.results.webRTCSupport.RTCIceCandidate ? 'Supported' : 'Not Supported'}</span></li>
                    </ul>
                </div>
                
                ${this.results.tests.videoAccess ? 
                    `<div class="result-section">
                        <h3>Video Capabilities</h3>
                        <p><strong>Camera:</strong> ${this.results.videoCapabilities.label}</p>
                        <p><strong>Constraints API:</strong> ${this.results.videoCapabilities.constraintsSupported ? 'Supported' : 'Not Supported'}</p>
                        <p><strong>Settings:</strong> ${typeof this.results.videoCapabilities.settings === 'object' ? 
                            Object.entries(this.results.videoCapabilities.settings).map(([key, value]) => 
                                `<br>${key}: ${value}`
                            ).join('') : this.results.videoCapabilities.settings}</p>
                    </div>` 
                    : ''
                }
                
                ${this.results.error ? 
                    `<div class="result-section error">
                        <h3>Error</h3>
                        <p>${this.results.error}</p>
                    </div>` 
                    : ''
                }
            </div>
        `;
        
        return html;
    }
    
    /**
     * Display test results in the specified element
     */
    displayResults(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = this.generateHTMLReport();
            // Add styles
            const style = document.createElement('style');
            style.textContent = `
                .mobile-compatibility-results {
                    font-family: Arial, sans-serif;
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f5f5f5;
                    border-radius: 8px;
                }
                .result-section {
                    margin-bottom: 20px;
                    padding: 15px;
                    background-color: white;
                    border-radius: 5px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .passed {
                    color: #28a745;
                    font-weight: bold;
                }
                .failed {
                    color: #dc3545;
                    font-weight: bold;
                }
                .error {
                    background-color: #fff8f8;
                    border-left: 4px solid #dc3545;
                }
            `;
            document.head.appendChild(style);
        } else {
            console.error(`Element with ID '${elementId}' not found`);
        }
    }
}

// Example usage:
// const mobileTest = new MobileCompatibilityTest();
// mobileTest.runAllTests().then(() => {
//     mobileTest.displayResults('results-container');
// });