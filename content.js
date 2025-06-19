// Enhanced content script with comprehensive transcript extraction methods
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
  
  // Comprehensive YouTube transcript extraction with multiple methods
  class YouTubeTranscriptExtractor {
    constructor() {
      this.maxRetries = 5;
      this.retryDelay = 2000;
      
      // Comprehensive selectors for transcript segments
      this.transcriptSelectors = [
        'ytd-transcript-segment-renderer',
        '[data-transcript-segment]',
        '.transcript-segment',
        '.ytd-transcript-segment-renderer',
        'ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer',
        '#transcript ytd-transcript-segment-renderer',
        '.ytd-transcript-body-renderer ytd-transcript-segment-renderer'
      ];
      
      // Comprehensive selectors for transcript panels
      this.transcriptPanelSelectors = [
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
        '#panels ytd-engagement-panel-section-list-renderer',
        'ytd-transcript-renderer',
        '[aria-label*="transcript" i][role="dialog"]',
        '#engagement-panel-searchable-transcript',
        '.ytd-engagement-panel-section-list-renderer',
        'ytd-transcript-body-renderer',
        '#transcript'
      ];
      
      // Comprehensive selectors for transcript buttons
      this.transcriptButtonSelectors = [
        'button[aria-label*="transcript" i]',
        'button[aria-label*="Show transcript" i]',
        '[role="button"][aria-label*="transcript" i]',
        'ytd-button-renderer[button-text*="transcript" i]',
        'tp-yt-paper-button[aria-label*="transcript" i]',
        'yt-button-shape[aria-label*="transcript" i]',
        '[data-tooltip-text*="transcript" i]',
        'button[title*="transcript" i]',
        '.ytd-menu-service-item-renderer:has([aria-label*="transcript" i])',
        'ytd-menu-service-item-renderer[aria-label*="transcript" i]'
      ];
      
      this.wasTranscriptPanelOpenedByUs = false;
      this.originalPanelState = null;
    }

    async extractTranscript() {
      console.log('🎬 Starting comprehensive transcript extraction...');
      
      try {
        // Store original panel state
        this.originalPanelState = this.isTranscriptPanelVisible();
        console.log('📋 Transcript panel initially open:', this.originalPanelState);
        
        // Method 1: Try direct DOM extraction (if panel is already open)
        let domTranscript = await this.extractFromDOM();
        if (domTranscript && domTranscript.length > 0) {
          console.log('✅ Successfully extracted transcript from DOM (panel was already open)');
          return this.formatTranscript(domTranscript);
        }

        // Method 2: Try to open transcript panel and extract
        const panelTranscript = await this.extractWithPanelOpen();
        if (panelTranscript && panelTranscript.length > 0) {
          console.log('✅ Successfully extracted transcript after opening panel');
          
          // Hide the transcript panel if we opened it (unless it was originally open)
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

        // Method 4: Try alternative DOM extraction methods
        const alternativeTranscript = await this.extractWithAlternativeMethods();
        if (alternativeTranscript && alternativeTranscript.length > 0) {
          console.log('✅ Successfully extracted transcript with alternative methods');
          return this.formatTranscript(alternativeTranscript);
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
          const parsed = this.parseSegments(segments);
          if (parsed && parsed.length > 0) {
            return parsed;
          }
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
      // First, try to open the more menu if transcript button is there
      await this.openMoreMenuIfNeeded();
      
      for (const selector of this.transcriptButtonSelectors) {
        const button = document.querySelector(selector);
        if (button && button.offsetParent !== null) { // Check if visible
          console.log(`📝 Found transcript button with selector: ${selector}`);
          return button;
        }
      }

      // Try to find transcript button in menus
      const menuButtons = document.querySelectorAll('ytd-menu-service-item-renderer, .ytd-menu-service-item-renderer');
      for (const menuButton of menuButtons) {
        const text = menuButton.textContent || '';
        if (text.toLowerCase().includes('transcript')) {
          console.log('📝 Found transcript button in menu');
          return menuButton;
        }
      }

      return null;
    }

    async openMoreMenuIfNeeded() {
      try {
        // Look for "More" or "..." button that might contain transcript option
        const moreButtons = [
          'button[aria-label*="More" i]',
          'button[aria-label*="Show more" i]',
          'ytd-menu-renderer button',
          '#top-level-buttons ytd-button-renderer:last-child button',
          '.ytd-video-primary-info-renderer button[aria-label*="More" i]'
        ];

        for (const selector of moreButtons) {
          const button = document.querySelector(selector);
          if (button && button.offsetParent !== null) {
            console.log('🖱️ Clicking more menu button:', selector);
            button.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            break;
          }
        }
      } catch (error) {
        console.warn('⚠️ Error opening more menu:', error);
      }
    }

    async waitForTranscriptPanel(timeout = 15000) {
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeout) {
        // Check for any transcript segments
        for (const selector of this.transcriptSelectors) {
          const segments = document.querySelectorAll(selector);
          if (segments.length > 0) {
            console.log('✅ Transcript panel loaded with segments');
            return true;
          }
        }
        
        // Check if panel is visible
        if (this.isTranscriptPanelVisible()) {
          console.log('✅ Transcript panel is visible, waiting for content...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      throw new Error('Transcript panel did not load within timeout');
    }

    async extractFromInternalData() {
      console.log('📋 Attempting extraction from internal YouTube data...');
      
      try {
        // Method 1: Check ytInitialPlayerResponse
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

        // Method 2: Search in script tags for caption data
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const content = script.textContent;
          if (content && content.includes('captionTracks')) {
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

        // Method 3: Check for ytInitialData
        if (window.ytInitialData) {
          const transcript = this.extractTranscriptFromYtInitialData(window.ytInitialData);
          if (transcript && transcript.length > 0) {
            console.log('🔗 Found transcript in ytInitialData');
            return transcript;
          }
        }

      } catch (error) {
        console.error('Error extracting from internal data:', error);
      }
      
      return null;
    }

    extractTranscriptFromYtInitialData(data) {
      try {
        // Recursively search for transcript data in ytInitialData
        const searchForTranscript = (obj) => {
          if (!obj || typeof obj !== 'object') return null;
          
          // Look for transcript-related keys
          if (obj.transcriptRenderer || obj.transcriptSegmentListRenderer) {
            return obj;
          }
          
          // Recursively search in all properties
          for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
              const result = searchForTranscript(obj[key]);
              if (result) return result;
            }
          }
          
          return null;
        };

        const transcriptData = searchForTranscript(data);
        if (transcriptData) {
          // Extract segments from the found data
          // This is a simplified extraction - the actual structure may vary
          console.log('Found transcript data in ytInitialData:', transcriptData);
          return null; // Return null for now as structure needs to be analyzed
        }

      } catch (error) {
        console.error('Error extracting from ytInitialData:', error);
      }
      
      return null;
    }

    async extractWithAlternativeMethods() {
      console.log('📋 Attempting alternative extraction methods...');
      
      try {
        // Method 1: Try to find transcript in any text content
        const allTextElements = document.querySelectorAll('*');
        const transcriptElements = [];
        
        for (const element of allTextElements) {
          const text = element.textContent || '';
          const className = element.className || '';
          const id = element.id || '';
          
          // Look for elements that might contain transcript data
          if ((className.includes('transcript') || id.includes('transcript')) && 
              text.length > 10 && text.length < 500) {
            transcriptElements.push(element);
          }
        }
        
        if (transcriptElements.length > 0) {
          console.log(`Found ${transcriptElements.length} potential transcript elements`);
          return this.parseAlternativeElements(transcriptElements);
        }

        // Method 2: Try to extract from video description or comments
        const description = document.querySelector('#description, .ytd-video-secondary-info-renderer');
        if (description) {
          const descText = description.textContent || '';
          if (descText.includes('transcript') || descText.includes('Transcript')) {
            console.log('Found transcript reference in description');
            // This would need more sophisticated parsing
          }
        }

      } catch (error) {
        console.error('Error in alternative extraction methods:', error);
      }
      
      return null;
    }

    parseAlternativeElements(elements) {
      const segments = [];
      
      for (const element of elements) {
        const text = element.textContent.trim();
        if (text.length > 10) {
          // Try to extract timestamp if present
          const timestampMatch = text.match(/(\d{1,2}):(\d{2})/);
          let seconds = 0;
          
          if (timestampMatch) {
            seconds = parseInt(timestampMatch[1]) * 60 + parseInt(timestampMatch[2]);
          }
          
          segments.push({
            start: seconds,
            duration: 5,
            text: text.replace(/\d{1,2}:\d{2}/, '').trim()
          });
        }
      }
      
      return segments.length > 0 ? segments : null;
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
      const results = [];
      
      for (const segment of segments) {
        try {
          // Try multiple selectors for timestamp and text
          const timeElement = segment.querySelector(
            '.segment-timestamp, [class*="timestamp"], .ytd-transcript-segment-timestamp, .ytd-transcript-segment-renderer .segment-start-offset'
          );
          const textElement = segment.querySelector(
            '.segment-text, [class*="segment-text"], .ytd-transcript-segment-text, .ytd-transcript-segment-renderer .segment-text'
          ) || segment;
          
          let timestamp = '';
          let text = '';
          
          if (timeElement) {
            timestamp = timeElement.textContent.trim();
          } else {
            // Try to find timestamp in the segment's own text
            const segmentText = segment.textContent || '';
            const timestampMatch = segmentText.match(/(\d{1,2}):(\d{2})/);
            if (timestampMatch) {
              timestamp = timestampMatch[0];
            }
          }
          
          if (textElement) {
            text = textElement.textContent.trim();
            // Remove timestamp from text if it's included
            text = text.replace(/^\d{1,2}:\d{2}\s*/, '');
          }
          
          if (text && text.length > 0) {
            const seconds = this.timestampToSeconds(timestamp);
            results.push({
              start: seconds,
              duration: 5, // Default duration
              text: text
            });
          }
        } catch (error) {
          console.warn('Error parsing segment:', error);
        }
      }
      
      return results.filter(item => item.text && item.text.length > 0);
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

        console.log('⚠️ Applied all hiding methods - transcript panel should now be hidden');
        this.wasTranscriptPanelOpenedByUs = false;
        return true;

      } catch (error) {
        console.error('❌ Error hiding transcript panel:', error);
        return false;
      }
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
      console.log('📋 Received transcript extraction request');
      
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

  console.log('✅ Enhanced LieBlocker content script initialized with comprehensive transcript extraction');
})();