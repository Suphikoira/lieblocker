// Enhanced content script with improved transcript extraction and robust error handling
(function() {
  'use strict';
  
  console.log('🚀 LieBlocker content script loaded');
  
  // Connection state management
  let connectionState = {
    isConnected: false,
    lastError: null,
    retryCount: 0
  };
  
  // Test extension context and connection
  function testExtensionContext() {
    try {
      // Test if chrome.runtime is available
      if (!chrome || !chrome.runtime || !chrome.runtime.id) {
        throw new Error('Extension context invalidated');
      }
      
      // Test if we can access extension APIs
      chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('⚠️ Extension context may be invalid:', chrome.runtime.lastError.message);
          connectionState.isConnected = false;
        } else {
          connectionState.isConnected = true;
        }
      });
      
      return true;
    } catch (error) {
      console.error('❌ Extension context test failed:', error);
      connectionState.isConnected = false;
      connectionState.lastError = error.message;
      return false;
    }
  }
  
  // Enhanced message sending with error handling
  async function sendMessageSafely(message, options = {}) {
    const { retries = 2, timeout = 10000 } = options;
    
    // Test extension context first
    if (!testExtensionContext()) {
      throw new Error('Extension context invalidated - please refresh the page');
    }
    
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        console.log(`📤 Content: Sending message (attempt ${attempt}):`, message);
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Message timeout')), timeout);
        });
        
        const messagePromise = new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
        
        const response = await Promise.race([messagePromise, timeoutPromise]);
        console.log('📥 Content: Message response:', response);
        return response;
        
      } catch (error) {
        console.error(`❌ Content: Message send failed (attempt ${attempt}):`, error);
        
        if (error.message.includes('Extension context invalidated') || 
            error.message.includes('Could not establish connection')) {
          // Don't retry on context invalidation
          throw error;
        }
        
        if (attempt <= retries) {
          console.log(`🔄 Content: Retrying message in ${attempt * 500}ms...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 500));
        } else {
          throw error;
        }
      }
    }
  }
  
  // Enhanced transcript extraction with comprehensive panel hiding
  class YouTubeTranscriptExtractor {
    constructor() {
      this.maxRetries = 3;
      this.retryDelay = 2000;
      this.transcriptSelectors = [
        'ytd-transcript-segment-renderer',
        '[data-transcript-segment]',
        '.transcript-segment',
        '.ytd-transcript-segment-renderer'
      ];
      this.transcriptPanelSelectors = [
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
        '#panels ytd-engagement-panel-section-list-renderer',
        'ytd-transcript-renderer',
        '[aria-label*="transcript" i][role="dialog"]',
        '#engagement-panel-searchable-transcript',
        '.ytd-engagement-panel-section-list-renderer'
      ];
      this.transcriptButtonSelectors = [
        'button[aria-label*="transcript" i]',
        'button[aria-label*="Show transcript" i]',
        '[role="button"][aria-label*="transcript" i]',
        'ytd-button-renderer[button-text*="transcript" i]',
        'tp-yt-paper-button[aria-label*="transcript" i]',
        'yt-button-shape[aria-label*="transcript" i]',
        '[data-tooltip-text*="transcript" i]'
      ];
      this.wasTranscriptPanelOpenedByUs = false;
      this.originalPanelState = null;
    }

    async extractTranscript() {
      console.log('🎬 Starting transcript extraction...');
      
      try {
        // Store original panel state
        this.originalPanelState = this.isTranscriptPanelVisible();
        console.log('📋 Transcript panel initially open:', this.originalPanelState);
        
        // Method 1: Try direct DOM extraction
        let domTranscript = await this.extractFromDOM();
        if (domTranscript && domTranscript.length > 0) {
          console.log('✅ Successfully extracted transcript from DOM (panel was already open)');
          // If panel was already open, don't hide it
          return this.formatTranscript(domTranscript);
        }

        // Method 2: Try to open transcript panel and extract
        const panelTranscript = await this.extractWithPanelOpen();
        if (panelTranscript && panelTranscript.length > 0) {
          console.log('✅ Successfully extracted transcript after opening panel');
          
          // Always hide the transcript panel after extraction (unless it was originally open)
          if (this.wasTranscriptPanelOpenedByUs && !this.originalPanelState) {
            await this.hideTranscriptPanel();
          }
          
          return this.formatTranscript(panelTranscript);
        }

        // Method 3: Try to extract from YouTube's internal data
        const internalTranscript = await this.extractFromInternalData();
        if (internalTranscript && internalTranscript.length > 0) {
          console.log('✅ Successfully extracted transcript from internal data');
          return this.formatTranscript(internalTranscript);
        }

        throw new Error('All transcript extraction methods failed');

      } catch (error) {
        console.error('❌ Transcript extraction failed:', error);
        
        // Always try to hide the panel if we opened it, even on error
        if (this.wasTranscriptPanelOpenedByUs && !this.originalPanelState) {
          await this.hideTranscriptPanel();
        }
        
        throw new Error(`Transcript extraction failed: ${error.message}`);
      }
    }

    isTranscriptPanelVisible() {
      for (const selector of this.transcriptPanelSelectors) {
        const panel = document.querySelector(selector);
        if (panel && panel.offsetParent !== null && 
            !panel.hasAttribute('hidden') && 
            getComputedStyle(panel).display !== 'none' &&
            getComputedStyle(panel).visibility !== 'hidden') {
          console.log(`📋 Found visible transcript panel with selector: ${selector}`);
          return true;
        }
      }
      return false;
    }

    async extractFromDOM() {
      console.log('📋 Attempting DOM extraction...');
      
      for (const selector of this.transcriptSelectors) {
        const segments = document.querySelectorAll(selector);
        if (segments.length > 0) {
          console.log(`✅ Found ${segments.length} segments with selector: ${selector}`);
          return this.parseSegments(segments);
        }
      }
      
      return null;
    }

    async extractWithPanelOpen() {
      console.log('📋 Attempting extraction with panel opening...');
      
      // Check if panel is already open
      if (this.isTranscriptPanelVisible()) {
        console.log('📋 Transcript panel already open, extracting...');
        return await this.extractFromDOM();
      }
      
      // Try to find and click transcript button
      const transcriptButton = await this.findTranscriptButton();
      if (!transcriptButton) {
        console.log('❌ Transcript button not found');
        return null;
      }

      // Click the button
      console.log('🖱️ Clicking transcript button...');
      transcriptButton.click();
      this.wasTranscriptPanelOpenedByUs = true;

      // Wait for transcript panel to load
      await this.waitForTranscriptPanel();

      // Try extraction again
      return await this.extractFromDOM();
    }

    async findTranscriptButton() {
      for (const selector of this.transcriptButtonSelectors) {
        const button = document.querySelector(selector);
        if (button && button.offsetParent !== null) { // Check if visible
          console.log(`📝 Found transcript button with selector: ${selector}`);
          return button;
        }
      }

      return null;
    }

    async waitForTranscriptPanel(timeout = 10000) {
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeout) {
        const segments = document.querySelectorAll(this.transcriptSelectors[0]);
        if (segments.length > 0) {
          console.log('✅ Transcript panel loaded');
          return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      throw new Error('Transcript panel did not load within timeout');
    }

    async hideTranscriptPanel() {
      console.log('🙈 Attempting to hide transcript panel...');
      
      try {
        // Method 1: Try to find and click the close button
        const closeButtonSelectors = [
          'button[aria-label*="close" i][aria-label*="transcript" i]',
          'button[aria-label="Close transcript"]',
          'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] button[aria-label*="close" i]',
          '#panels button[aria-label*="close" i]',
          '.ytd-engagement-panel-title-header-renderer button[aria-label*="close" i]',
          'yt-button-shape[aria-label*="close" i]',
          '#engagement-panel-searchable-transcript button[aria-label*="close" i]',
          '[data-tooltip-text*="close" i]'
        ];

        for (const selector of closeButtonSelectors) {
          const closeButton = document.querySelector(selector);
          if (closeButton && closeButton.offsetParent !== null) {
            console.log(`🖱️ Found close button with selector: ${selector}`);
            closeButton.click();
            
            // Wait a bit to see if panel closes
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (!this.isTranscriptPanelVisible()) {
              console.log('✅ Successfully closed transcript panel with close button');
              this.wasTranscriptPanelOpenedByUs = false;
              return true;
            }
          }
        }

        // Method 2: Try clicking the transcript button again to toggle it off
        const transcriptButton = await this.findTranscriptButton();
        if (transcriptButton) {
          console.log('🖱️ Toggling transcript button to close panel...');
          transcriptButton.click();
          
          // Wait a bit to see if panel closes
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          if (!this.isTranscriptPanelVisible()) {
            console.log('✅ Successfully toggled transcript panel closed');
            this.wasTranscriptPanelOpenedByUs = false;
            return true;
          }
        }

        // Method 3: Try to hide the panel directly with CSS (more aggressive)
        for (const selector of this.transcriptPanelSelectors) {
          const panel = document.querySelector(selector);
          if (panel) {
            console.log(`🎨 Hiding panel with CSS: ${selector}`);
            
            // Store original styles for potential restoration
            const originalDisplay = panel.style.display;
            const originalVisibility = panel.style.visibility;
            
            // Hide the panel
            panel.style.display = 'none';
            panel.style.visibility = 'hidden';
            panel.setAttribute('hidden', 'true');
            panel.setAttribute('data-lieblocker-hidden', 'true');
            
            // Also try to hide parent containers
            let parent = panel.parentElement;
            while (parent && parent !== document.body) {
              if (parent.id === 'panels' || 
                  parent.classList.contains('ytd-engagement-panel') ||
                  parent.tagName === 'YTD-ENGAGEMENT-PANEL-SECTION-LIST-RENDERER') {
                parent.style.display = 'none';
                parent.style.visibility = 'hidden';
                parent.setAttribute('hidden', 'true');
                parent.setAttribute('data-lieblocker-hidden', 'true');
                break;
              }
              parent = parent.parentElement;
            }
            
            console.log('✅ Transcript panel hidden with CSS');
            this.wasTranscriptPanelOpenedByUs = false;
            return true;
          }
        }

        // Method 4: Try pressing Escape key to close any open panels
        console.log('⌨️ Trying Escape key to close panel...');
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          bubbles: true,
          cancelable: true
        }));
        
        // Also try on the document body and window
        document.body.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          bubbles: true,
          cancelable: true
        }));
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (!this.isTranscriptPanelVisible()) {
          console.log('✅ Successfully closed transcript panel with Escape key');
          this.wasTranscriptPanelOpenedByUs = false;
          return true;
        }

        // Method 5: Try clicking outside the panel to close it
        console.log('🖱️ Trying to click outside panel to close it...');
        const videoPlayer = document.querySelector('#movie_player, .video-stream, video');
        if (videoPlayer) {
          videoPlayer.click();
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          if (!this.isTranscriptPanelVisible()) {
            console.log('✅ Successfully closed transcript panel by clicking outside');
            this.wasTranscriptPanelOpenedByUs = false;
            return true;
          }
        }

        // Method 6: Force hide with more aggressive CSS and DOM manipulation
        console.log('🔧 Attempting aggressive panel hiding...');
        const allPanels = document.querySelectorAll([
          '#panels',
          'ytd-engagement-panel-section-list-renderer',
          '[id*="transcript"]',
          '[class*="transcript"]',
          '[aria-label*="transcript" i]'
        ].join(', '));
        
        allPanels.forEach(panel => {
          if (panel.textContent && panel.textContent.toLowerCase().includes('transcript')) {
            panel.style.display = 'none !important';
            panel.style.visibility = 'hidden !important';
            panel.style.opacity = '0 !important';
            panel.style.height = '0 !important';
            panel.style.overflow = 'hidden !important';
            panel.setAttribute('hidden', 'true');
            panel.setAttribute('data-lieblocker-force-hidden', 'true');
          }
        });

        console.log('⚠️ Applied aggressive hiding - transcript panel should now be hidden');
        this.wasTranscriptPanelOpenedByUs = false;
        return true;

      } catch (error) {
        console.error('❌ Error hiding transcript panel:', error);
        return false;
      }
    }

    async extractFromInternalData() {
      console.log('📋 Attempting extraction from internal YouTube data...');
      
      try {
        // Check for ytInitialPlayerResponse
        if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
          const captions = window.ytInitialPlayerResponse.captions;
          if (captions.playerCaptionsTracklistRenderer && 
              captions.playerCaptionsTracklistRenderer.captionTracks) {
            const captionTrack = captions.playerCaptionsTracklistRenderer.captionTracks[0];
            if (captionTrack && captionTrack.baseUrl) {
              console.log('🔗 Found caption track URL:', captionTrack.baseUrl);
              return await this.fetchCaptionData(captionTrack.baseUrl);
            }
          }
        }

        // Search in script tags for caption data
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const content = script.textContent;
          if (content.includes('captionTracks')) {
            const match = content.match(/"captionTracks":\s*(\[.*?\])/);
            if (match) {
              try {
                const captionTracks = JSON.parse(match[1]);
                if (captionTracks.length > 0 && captionTracks[0].baseUrl) {
                  console.log('🔗 Found caption track in script:', captionTracks[0].baseUrl);
                  return await this.fetchCaptionData(captionTracks[0].baseUrl);
                }
              } catch (parseError) {
                console.warn('Failed to parse caption tracks from script');
              }
            }
          }
        }

      } catch (error) {
        console.error('Error extracting from internal data:', error);
      }
      
      return null;
    }

    async fetchCaptionData(captionUrl) {
      try {
        console.log('🌐 Fetching caption data from URL...');
        const response = await fetch(captionUrl);
        const xmlText = await response.text();
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const textElements = xmlDoc.querySelectorAll('text');
        
        return Array.from(textElements).map(element => {
          const start = parseFloat(element.getAttribute('start') || '0');
          const duration = parseFloat(element.getAttribute('dur') || '5');
          const text = element.textContent.trim();
          
          return {
            start: start,
            duration: duration,
            text: text
          };
        });
        
      } catch (error) {
        console.error('Error fetching caption data:', error);
        return null;
      }
    }

    parseSegments(segments) {
      return Array.from(segments).map(segment => {
        // Try multiple selectors for timestamp and text
        const timeElement = segment.querySelector(
          '.segment-timestamp, [class*="timestamp"], .ytd-transcript-segment-timestamp'
        );
        const textElement = segment.querySelector(
          '.segment-text, [class*="segment-text"], .ytd-transcript-segment-text'
        );
        
        const timestamp = timeElement ? timeElement.textContent.trim() : '';
        const text = textElement ? textElement.textContent.trim() : '';
        
        // Convert timestamp to seconds
        const seconds = this.timestampToSeconds(timestamp);
        
        return {
          start: seconds,
          duration: 5, // Default duration
          text: text
        };
      }).filter(item => item.text && item.text.length > 0);
    }

    timestampToSeconds(timestamp) {
      if (!timestamp) return 0;
      
      const parts = timestamp.split(':');
      if (parts.length === 2) {
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
      } else if (parts.length === 3) {
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
      }
      
      return 0;
    }

    formatTranscript(segments) {
      return segments.map(segment => ({
        text: segment.text,
        start: segment.start,
        duration: segment.duration || 5
      }));
    }
  }

  // Enhanced video control with better error handling
  class YouTubeVideoController {
    constructor() {
      this.player = null;
      this.skipNotificationTimeout = null;
    }

    getPlayer() {
      if (!this.player) {
        this.player = document.querySelector('#movie_player, .video-stream, video');
      }
      return this.player;
    }

    getCurrentTime() {
      const player = this.getPlayer();
      if (player && typeof player.getCurrentTime === 'function') {
        return player.getCurrentTime();
      } else if (player && player.currentTime !== undefined) {
        return player.currentTime;
      }
      return 0;
    }

    seekTo(seconds) {
      const player = this.getPlayer();
      if (player && typeof player.seekTo === 'function') {
        player.seekTo(seconds);
        return true;
      } else if (player && player.currentTime !== undefined) {
        player.currentTime = seconds;
        return true;
      }
      return false;
    }

    showSkipNotification(lie) {
      // Clear any existing notification
      this.hideSkipNotification();

      // Create notification element
      const notification = document.createElement('div');
      notification.id = 'lieBlocker-skip-notification';
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #dc3545;
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
      `;

      notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 16px;">🚨</span>
          <strong>Lie Detected & Skipped</strong>
        </div>
        <div style="font-size: 12px; opacity: 0.9; line-height: 1.4;">
          ${lie.claim_text.substring(0, 100)}${lie.claim_text.length > 100 ? '...' : ''}
        </div>
        <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">
          Confidence: ${Math.round(lie.confidence * 100)}%
        </div>
      `;

      // Add CSS animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);

      document.body.appendChild(notification);

      // Auto-hide after 4 seconds
      this.skipNotificationTimeout = setTimeout(() => {
        this.hideSkipNotification();
      }, 4000);
    }

    hideSkipNotification() {
      const notification = document.getElementById('lieBlocker-skip-notification');
      if (notification) {
        notification.remove();
      }
      if (this.skipNotificationTimeout) {
        clearTimeout(this.skipNotificationTimeout);
        this.skipNotificationTimeout = null;
      }
    }
  }

  // Initialize components
  const transcriptExtractor = new YouTubeTranscriptExtractor();
  const videoController = new YouTubeVideoController();

  // Enhanced message handling with error recovery
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Test extension context first
    if (!testExtensionContext()) {
      sendResponse({ success: false, error: 'Extension context invalidated' });
      return;
    }
    
    if (message.type === 'extractDOMTranscript') {
      transcriptExtractor.extractTranscript()
        .then(transcript => {
          console.log('✅ Transcript extraction completed, panel should be hidden');
          sendResponse({ success: true, data: transcript });
        })
        .catch(error => {
          console.error('❌ Transcript extraction failed:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep message channel open for async response
    }
    
    if (message.type === 'skipToTime') {
      const success = videoController.seekTo(message.time);
      if (success && message.lie) {
        videoController.showSkipNotification(message.lie);
        
        // Send skip tracking message to background
        sendMessageSafely({
          type: 'lieSkipped',
          videoId: message.videoId,
          timestamp: message.time,
          duration: message.lie.duration_seconds || 10,
          lieId: message.lie.id
        }).catch(error => {
          console.error('❌ Error sending skip tracking:', error);
        });
      }
      sendResponse({ success: success });
    }
    
    if (message.type === 'getCurrentTime') {
      const currentTime = videoController.getCurrentTime();
      sendResponse({ success: true, currentTime: currentTime });
    }
    
    if (message.type === 'ping') {
      sendResponse({ success: true, message: 'pong' });
    }
  });

  // Auto-skip functionality with error handling
  let autoSkipEnabled = false;
  let currentVideoLies = [];
  let lastSkipTime = 0;

  // Load auto-skip setting with error handling
  try {
    chrome.storage.sync.get(['autoSkipEnabled'], (result) => {
      if (chrome.runtime.lastError) {
        console.warn('⚠️ Could not load auto-skip setting:', chrome.runtime.lastError.message);
      } else {
        autoSkipEnabled = result.autoSkipEnabled || false;
      }
    });
  } catch (error) {
    console.error('❌ Error loading auto-skip setting:', error);
  }

  // Listen for setting changes with error handling
  try {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.autoSkipEnabled) {
        autoSkipEnabled = changes.autoSkipEnabled.newValue;
      }
    });
  } catch (error) {
    console.error('❌ Error setting up storage listener:', error);
  }

  // Auto-skip monitoring with error handling
  function checkForAutoSkip() {
    if (!autoSkipEnabled || currentVideoLies.length === 0) return;

    try {
      const currentTime = videoController.getCurrentTime();
      
      // Find lies that should be skipped at current time
      const liesToSkip = currentVideoLies.filter(lie => {
        const lieStart = lie.timestamp_seconds;
        const lieEnd = lieStart + (lie.duration_seconds || 10);
        
        return currentTime >= lieStart && 
               currentTime < lieEnd && 
               currentTime > lastSkipTime + 5; // Prevent rapid skipping
      });

      if (liesToSkip.length > 0) {
        const lie = liesToSkip[0];
        const skipToTime = lie.timestamp_seconds + (lie.duration_seconds || 10);
        
        console.log(`⏭️ Auto-skipping lie at ${lie.timestamp_seconds}s`);
        
        if (videoController.seekTo(skipToTime)) {
          videoController.showSkipNotification(lie);
          lastSkipTime = currentTime;
          
          // Send skip tracking message
          sendMessageSafely({
            type: 'lieSkipped',
            videoId: getCurrentVideoId(),
            timestamp: lie.timestamp_seconds,
            duration: lie.duration_seconds || 10,
            lieId: lie.id
          }).catch(error => {
            console.error('❌ Error sending auto-skip tracking:', error);
          });
        }
      }
    } catch (error) {
      console.error('❌ Error in auto-skip check:', error);
    }
  }

  // Monitor video time for auto-skip
  setInterval(checkForAutoSkip, 1000);

  // Listen for lies updates from background with error handling
  chrome.runtime.onMessage.addListener((message) => {
    try {
      if (message.type === 'liesUpdate' && message.claims) {
        currentVideoLies = message.claims;
        console.log(`📋 Updated current video lies: ${currentVideoLies.length} lies`);
      }
    } catch (error) {
      console.error('❌ Error handling lies update:', error);
    }
  });

  // Utility function to get current video ID
  function getCurrentVideoId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('v');
    } catch (error) {
      console.error('❌ Error getting video ID:', error);
      return null;
    }
  }

  // Enhanced auto-loading with error recovery
  async function autoLoadVideoLies() {
    try {
      if (!testExtensionContext()) {
        console.warn('⚠️ Extension context invalid, skipping auto-load');
        return;
      }
      
      const videoId = getCurrentVideoId();
      if (!videoId) {
        console.log('📋 No video ID found, skipping auto-load');
        return;
      }
      
      console.log('📋 Auto-loading lies for video:', videoId);
      
      const response = await sendMessageSafely({
        type: 'getCurrentVideoLies',
        videoId: videoId
      }, { retries: 1, timeout: 5000 });
      
      if (response && response.success && response.lies) {
        currentVideoLies = response.lies;
        console.log(`✅ Auto-loaded ${response.lies.length} lies for current video`);
      } else {
        console.log('📋 No lies found for current video');
        currentVideoLies = [];
      }
      
    } catch (error) {
      console.error('❌ Error auto-loading video lies:', error);
      
      if (error.message.includes('Extension context invalidated')) {
        console.warn('⚠️ Extension context invalidated - user should refresh page');
      }
    }
  }

  // Auto-load lies when page loads or URL changes
  let lastVideoId = getCurrentVideoId();
  
  // Initial load
  setTimeout(autoLoadVideoLies, 2000);
  
  // Monitor for URL changes (YouTube SPA navigation)
  const observer = new MutationObserver(() => {
    const currentVideoId = getCurrentVideoId();
    if (currentVideoId && currentVideoId !== lastVideoId) {
      lastVideoId = currentVideoId;
      console.log('🔄 Video changed, auto-loading lies...');
      setTimeout(autoLoadVideoLies, 2000);
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });

  // Test extension context periodically
  setInterval(() => {
    testExtensionContext();
  }, 30000); // Every 30 seconds

  // Clean up any transcript panels that might have been left open by previous sessions
  function cleanupLeftoverTranscriptPanels() {
    try {
      const leftoverPanels = document.querySelectorAll('[data-lieblocker-hidden="true"], [data-lieblocker-force-hidden="true"]');
      leftoverPanels.forEach(panel => {
        panel.style.display = 'none';
        panel.style.visibility = 'hidden';
        panel.setAttribute('hidden', 'true');
      });
      
      if (leftoverPanels.length > 0) {
        console.log(`🧹 Cleaned up ${leftoverPanels.length} leftover transcript panels`);
      }
    } catch (error) {
      console.error('❌ Error cleaning up leftover panels:', error);
    }
  }

  // Run cleanup on page load
  setTimeout(cleanupLeftoverTranscriptPanels, 1000);

  console.log('✅ Enhanced LieBlocker content script initialized with comprehensive transcript panel hiding');
})();