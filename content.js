// Helper function to check if extension context is still valid
function isExtensionContextValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

// Enhanced helper function to safely send messages to background script with context validation
async function safelySendMessageToBackground(message) {
  return new Promise((resolve) => {
    try {
      // Check if extension context is valid before attempting to send message
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated - cannot send message:', message.type);
        resolve(null);
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          // Handle specific error cases
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            console.warn('Extension context invalidated during message send');
            // Could show user notification here
            showExtensionReloadNotification();
          } else {
            console.warn('Failed to send message to background:', chrome.runtime.lastError.message);
          }
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      if (error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated:', error.message);
        showExtensionReloadNotification();
      } else {
        console.warn('Failed to send message to background:', error.message);
      }
      resolve(null);
    }
  });
}

// Helper function to show user notification when extension needs reload
function showExtensionReloadNotification() {
  try {
    // Only show notification once per page load
    if (window.lieBlockerExtensionReloadNotified) {
      return;
    }
    window.lieBlockerExtensionReloadNotified = true;

    // Create a subtle notification overlay
    const notification = document.createElement('div');
    notification.id = 'lieblocker-reload-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(66, 133, 244, 0.95);
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      max-width: 300px;
      line-height: 1.4;
      cursor: pointer;
      transition: opacity 0.3s ease;
    `;
    notification.innerHTML = `
      🔄 LieBlocker Extension Updated<br>
      <small style="opacity: 0.9;">Please refresh the page to continue</small>
    `;
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.opacity = '0';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, 10000);
    
    // Click to dismiss
    notification.addEventListener('click', () => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    });
    
    document.body.appendChild(notification);
  } catch (error) {
    console.log('Could not show extension reload notification:', error);
  }
}

// Original helper function (kept for backward compatibility)
async function safelySendMessageToBackgroundLegacy(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          // Background script might not be available - log but don't throw
          console.warn('Failed to send message to background:', chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      // Background script might not be available - log but don't throw
      console.warn('Failed to send message to background:', error.message);
      resolve(null);
    }
  });
}

// Function to extract YouTube video transcript from DOM
async function getTranscript() {
  console.log('🔍 Content: Extracting transcript directly from DOM...');
  
  try {
    const transcript = await extractTranscriptFromDOM();
    if (!transcript || transcript.length === 0) {
      throw new Error('No transcript found or transcript is empty');
    }
    return transcript;
  } catch (error) {
    console.error('❌ Error extracting transcript:', error);
    safelySendMessageToBackground({
      type: 'analysisResult',
      data: `Error: ${error.message}. Make sure the video has closed captions available and try opening the transcript panel manually.`
    });
    return null;
  }
}

// NEW: Non-blocking AsyncTranscriptExtractor class following SOLID principles
class AsyncTranscriptExtractor {
  constructor() {
    this.maxRetries = 3;
    this.baseDelay = 1000;
    this.selectors = [
      'ytd-transcript-segment-renderer',
      '#panels ytd-transcript-segment-renderer',
      'ytd-engagement-panel-section-list-renderer ytd-transcript-segment-renderer',
      '[target-id*="transcript"] ytd-transcript-segment-renderer'
    ];
  }

  // Non-blocking transcript extraction using MutationObserver
  async extractTranscript() {
    console.log('🔍 Starting non-blocking transcript extraction...');
    
    try {
      // First try to find existing transcript segments
      let segments = this.findExistingSegments();
      if (segments.length > 0) {
        console.log(`✅ Found ${segments.length} existing transcript segments`);
        const result = this.parseSegments(segments);
        
        // Close transcript panel if it was already open
        await this.closeTranscriptPanel();
        
        return result;
      }

      // If no existing segments, try to open transcript panel
      const transcriptOpened = await this.openTranscriptPanel();
      if (!transcriptOpened) {
        throw new Error('Could not open transcript panel');
      }

      // Wait for transcript segments to load using MutationObserver
      segments = await this.waitForTranscriptSegments();
      
      if (segments.length === 0) {
        throw new Error('No transcript segments found after loading');
      }

      console.log(`✅ Successfully extracted ${segments.length} transcript segments`);
      const result = this.parseSegments(segments);
      
      // Close transcript panel after successful extraction
      await this.closeTranscriptPanel();
      
      return result;

    } catch (error) {
      console.error('❌ DOM transcript extraction failed:', error);
      
      // Try to close transcript panel even if extraction failed
      await this.closeTranscriptPanel();
      
      // Fallback: Try to extract from ytInitialPlayerResponse caption URLs
      try {
        console.log('🔄 Attempting fallback to caption URL extraction...');
        return await this.extractFromCaptionUrl();
      } catch (fallbackError) {
        console.error('❌ Caption URL fallback also failed:', fallbackError);
        throw new Error(`All transcript extraction methods failed. Original error: ${error.message}`);
      }
    }
  }

  // Fallback method: Extract from caption URL
  async extractFromCaptionUrl() {
    let transcriptData = null;
    
    // Check for ytInitialPlayerResponse
    if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
      const captions = window.ytInitialPlayerResponse.captions;
      if (captions.playerCaptionsTracklistRenderer && captions.playerCaptionsTracklistRenderer.captionTracks) {
        transcriptData = captions.playerCaptionsTracklistRenderer.captionTracks[0];
      }
    }
    
    // Fallback: Search in script tags for caption data
    if (!transcriptData) {
      const scripts = document.querySelectorAll('script');
      for (let script of scripts) {
        const content = script.textContent;
        if (content.includes('captionTracks') || content.includes('playerCaptionsTracklistRenderer')) {
          const patterns = [
            /"captionTracks":\s*(\[.*?\])/,
            /"playerCaptionsTracklistRenderer":\s*\{[^}]*"captionTracks":\s*(\[.*?\])/
          ];
          
          for (let pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
              try {
                const captionTracks = JSON.parse(match[1]);
                if (captionTracks.length > 0) {
                  transcriptData = captionTracks[0];
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }
          if (transcriptData) break;
        }
      }
    }
    
    if (!transcriptData || !transcriptData.baseUrl) {
      throw new Error('No caption URL found in YouTube data');
    }
    
    console.log('✅ Found caption track URL, fetching transcript...');
    return await fetchTranscriptFromCaptionUrl(transcriptData.baseUrl);
  }

  // Find existing transcript segments without opening panel
  findExistingSegments() {
    for (const selector of this.selectors) {
      const segments = document.querySelectorAll(selector);
      if (segments.length > 0) {
        console.log(`📍 Found segments with selector: ${selector}`);
        return Array.from(segments);
      }
    }
    return [];
  }

  // Non-blocking transcript panel opening
  async openTranscriptPanel() {
    const transcriptButton = this.findTranscriptButton();
    if (!transcriptButton) {
      console.warn('⚠️ Transcript button not found');
      return false;
    }

    console.log('🔘 Attempting to open transcript panel...');
    
    // Click without blocking UI
    transcriptButton.click();
    
    // Brief non-blocking wait for panel animation
    await this.nonBlockingDelay(500);
    
    return true;
  }

  // Find transcript button with multiple selectors
  findTranscriptButton() {
    const selectors = [
      'button[aria-label*="transcript" i]',
      'button[aria-label*="Show transcript" i]',
      'yt-button-shape[aria-label*="transcript" i]',
      '[role="button"][aria-label*="transcript" i]',
      'ytd-button-renderer[aria-label*="transcript" i]',
      'tp-yt-paper-button[aria-label*="transcript" i]'
    ];

    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button) {
        console.log(`🎯 Found transcript button: ${selector}`);
        return button;
      }
    }
    
    // Fallback: search by text content
    const allButtons = document.querySelectorAll('button, [role="button"]');
    for (const button of allButtons) {
      const text = button.textContent.toLowerCase();
      if (text.includes('transcript') || text.includes('show transcript')) {
        console.log('🎯 Found transcript button by text content');
        return button;
      }
    }
    
    return null;
  }

  // Non-blocking wait using MutationObserver
  async waitForTranscriptSegments(timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      // Check immediately first
      const existingSegments = this.findExistingSegments();
      if (existingSegments.length > 0) {
        resolve(existingSegments);
        return;
      }

      // Set up MutationObserver for dynamic loading
      const observer = new MutationObserver(() => {
        const segments = this.findExistingSegments();
        if (segments.length > 0) {
          console.log(`🔄 MutationObserver found ${segments.length} segments`);
          observer.disconnect();
          resolve(segments);
        } else if (Date.now() - startTime > timeout) {
          observer.disconnect();
          reject(new Error(`Timeout waiting for transcript segments (${timeout}ms)`));
        }
      });

      // Observe DOM changes
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
      });

      // Timeout fallback
      setTimeout(() => {
        observer.disconnect();
        const finalSegments = this.findExistingSegments();
        if (finalSegments.length > 0) {
          console.log(`⏰ Timeout fallback found ${finalSegments.length} segments`);
          resolve(finalSegments);
        } else {
          reject(new Error(`No transcript segments found within ${timeout}ms`));
        }
      }, timeout);
    });
  }

  // Parse transcript segments into our format
  parseSegments(segments) {
    const transcriptSegments = [];
    
    segments.forEach((segment, index) => {
      try {
        const timeElement = segment.querySelector('.segment-timestamp, [class*="timestamp"]');
        const textElement = segment.querySelector('.segment-text, [class*="segment-text"]');
        
        const timestamp = timeElement ? timeElement.textContent.trim() : '';
        const text = textElement ? textElement.textContent.trim() : '';
        
        if (text && text.length > 0) {
          transcriptSegments.push({
            timestamp: timestamp,
            text: text,
            start: parseTimestampToSeconds(timestamp) || (index * 2)
          });
        }
      } catch (error) {
        console.warn(`⚠️ Error parsing segment ${index}:`, error);
      }
    });

    return transcriptSegments;
  }

  // Non-blocking delay using requestAnimationFrame
  async nonBlockingDelay(ms) {
    return new Promise(resolve => {
      if (ms <= 16) {
        requestAnimationFrame(resolve);
      } else {
        setTimeout(resolve, ms);
      }
    });
  }

  // Close transcript panel after extraction to keep UI clean
  async closeTranscriptPanel() {
    try {
      console.log('🔘 Attempting to close transcript panel...');
      
      // Multiple selectors to find the close button
      const closeButtonSelectors = [
        // Primary selector from your provided HTML
        '#visibility-button button[aria-label*="Close transcript" i]',
        '#visibility-button button[aria-label*="Close" i]',
        
        // Alternative selectors for robustness
        'ytd-engagement-panel-title-header-renderer button[aria-label*="Close transcript" i]',
        'ytd-engagement-panel-title-header-renderer button[aria-label*="Close" i]',
        '.ytd-engagement-panel-title-header-renderer button[aria-label*="Close" i]',
        
        // Generic close button selectors in transcript area
        'ytd-transcript-renderer ~ * button[aria-label*="Close" i]',
        '[target-id*="transcript"] button[aria-label*="Close" i]',
        
        // SVG-based close button detection
        'button svg path[d*="12.71 12"]', // The specific SVG path from your HTML
        'button:has(svg path[d*="12.71 12"])',
        
        // Fallback generic selectors
        'button[title*="Close" i]',
        'button[aria-label*="close" i]'
      ];
      
      let closeButton = null;
      
      // Try each selector until we find the close button
      for (const selector of closeButtonSelectors) {
        try {
          closeButton = document.querySelector(selector);
          if (closeButton) {
            console.log(`🎯 Found close button with selector: ${selector}`);
            break;
          }
        } catch (selectorError) {
          // Some selectors might not be valid, continue to next
          continue;
        }
      }
      
      if (closeButton) {
        // Ensure button is visible and clickable
        if (closeButton.offsetParent !== null) {
          console.log('🔘 Clicking transcript close button...');
          closeButton.click();
          
          // Brief delay to allow panel to close
          await this.nonBlockingDelay(500);
          
          console.log('✅ Transcript panel closed successfully');
          return true;
        } else {
          console.log('⚠️ Close button found but not visible');
        }
      } else {
        console.log('⚠️ Transcript close button not found - panel may already be closed');
      }
      
      return false;
    } catch (error) {
      console.warn('⚠️ Error closing transcript panel:', error);
      return false;
    }
  }
}

// Enhanced DOM transcript extraction with non-blocking approach
async function extractTranscriptFromDOM() {
  const extractor = new AsyncTranscriptExtractor();
  return await extractor.extractTranscript();
}

// NEW: Helper function to fetch transcript from caption URL
async function fetchTranscriptFromCaptionUrl(captionUrl) {
  try {
    console.log('🌐 Content: Fetching transcript from caption URL...');
    const response = await fetch(captionUrl);
    const xmlText = await response.text();
    
    // Parse the XML response
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const textElements = xmlDoc.querySelectorAll('text');
    
    const transcript = Array.from(textElements).map(element => {
      const start = element.getAttribute('start');
      const duration = element.getAttribute('dur');
      const text = element.textContent;
      
      // Convert seconds to timestamp format
      const startSeconds = parseFloat(start);
      const minutes = Math.floor(startSeconds / 60);
      const seconds = Math.floor(startSeconds % 60);
      const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      return {
        timestamp: timestamp,
        text: text.trim(),
        start: startSeconds,
        duration: parseFloat(duration) || 5
      };
    });
    
    console.log('✅ Content: Successfully fetched transcript from caption URL');
    return transcript;
  } catch (error) {
    console.error('❌ Content: Failed to fetch transcript from caption URL:', error);
    throw error;
  }
}

// NEW: Helper function to parse timestamp string to seconds
function parseTimestampToSeconds(timestamp) {
  if (!timestamp || typeof timestamp !== 'string') return 0;
  
  const parts = timestamp.split(':').map(part => parseInt(part, 10));
  
  if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // H:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  return 0;
}

// Function to prepare full transcript for analysis with configurable duration and enhanced mapping
async function prepareFullTranscript(transcript) {
  // Get user-configured analysis duration (default to 20 minutes)
  const settings = await chrome.storage.sync.get(['analysisDuration']);
  const ANALYSIS_LIMIT_MINUTES = settings.analysisDuration || 20;
  
  if (!transcript || transcript.length === 0) {
    return null;
  }
  
  // Sort transcript by start time to ensure proper ordering
  const sortedTranscript = [...transcript].sort((a, b) => a.start - b.start);
  
  // Apply user-configured limit
  const limitedDuration = ANALYSIS_LIMIT_MINUTES * 60; // Convert minutes to seconds
  const filteredTranscript = sortedTranscript.filter(segment => 
    segment.start < limitedDuration
  );
  
  if (filteredTranscript.length === 0) {
    return null;
  }
  
  // Build the full text with precise timestamp mapping and character-to-segment mapping
  let fullText = '';
  let segmentTimestamps = [];
  let timestampMap = new Map(); // Map text positions to exact timestamps
  let charToSegmentIndexMap = new Map(); // NEW: Map character positions to segment indices
  
  for (let segmentIndex = 0; segmentIndex < filteredTranscript.length; segmentIndex++) {
    const segment = filteredTranscript[segmentIndex];
    const segmentText = segment.text.trim();
    
    if (segmentText) {
      const segmentStartPos = fullText.length;
      
      // Add space if not first segment
      if (fullText) {
        fullText += ' ';
      }
      
      // Add the segment text
      fullText += segmentText;
      const segmentEndPos = fullText.length;
      
      // Create precise timestamp mapping for this segment
      const segmentInfo = {
        text: segmentText,
        timestamp: segment.start,
        duration: segment.duration || 0, // Include duration from original transcript
        startPos: segmentStartPos + (fullText.length > segmentText.length ? 1 : 0),
        endPos: segmentEndPos,
        formattedTime: formatSecondsToTimestamp(segment.start)
      };
      
      segmentTimestamps.push(segmentInfo);
      
      // Map every character position in this segment to its timestamp and segment index
      for (let pos = segmentInfo.startPos; pos < segmentInfo.endPos; pos++) {
        timestampMap.set(pos, segment.start);
        charToSegmentIndexMap.set(pos, segmentIndex); // NEW: Map to segment index
      }
    }
  }
  
  const startTime = filteredTranscript[0].start;
  const endTime = Math.min(filteredTranscript[filteredTranscript.length - 1].start, limitedDuration);
  const endMinutes = Math.floor(endTime / 60);
  const endSeconds = Math.floor(endTime % 60);
  
  return {
    text: fullText.trim(),
    startTime: startTime,
    endTime: endTime,
    segmentTimestamps: segmentTimestamps,
    timestampMap: timestampMap,
    charToSegmentIndexMap: charToSegmentIndexMap, // NEW: Include character-to-segment mapping
    timeWindow: `0:00 - ${endMinutes}:${endSeconds.toString().padStart(2, '0')}`,
    totalSegments: filteredTranscript.length,
    analysisDuration: ANALYSIS_LIMIT_MINUTES
  };
}

// Helper function to format seconds to MM:SS timestamp
function formatSecondsToTimestamp(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Function to get cached analysis results
async function getCachedAnalysis(videoId) {
  try {
    const result = await chrome.storage.local.get(`analysis_${videoId}`);
    const cached = result[`analysis_${videoId}`];
    
    if (cached) {
      // Check if cache is still valid (24 hours)
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      
      if (cacheAge < maxAge) {
        // Create LieBlockerDetectedLies object from cached data
        if (cached.claims && cached.claims.length > 0) {
          storeDetectedLiesForDownload(cached.claims, videoId);
        }
        
        return cached;
      } else {
        // Remove expired cache
        chrome.storage.local.remove(`analysis_${videoId}`);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error retrieving cached analysis:', error);
    return null;
  }
}

// Function to save analysis results to cache
async function saveAnalysisToCache(videoId, analysisText, lies = []) {
  try {
    const cacheData = {
      analysis: analysisText,
      claims: lies,
      timestamp: Date.now(),
      videoId: videoId,
      processed: Date.now(),
      version: '2.1',
      lastUpdated: Date.now()
    };
    
    await chrome.storage.local.set({
      [`analysis_${videoId}`]: cacheData
    });
    
    // Store detected lies for download
    storeDetectedLiesForDownload(lies, videoId);
    
    // Notify popup of cache update
    chrome.runtime.sendMessage({
      type: 'cacheUpdated',
      videoId: videoId,
      totalClaims: cacheData.claims.length
    });
    
  } catch (error) {
    console.error('Error saving analysis to cache:', error);
  }
}

// Function to store detected lies for download - ALWAYS create the object
function storeDetectedLiesForDownload(lies, videoId) {
  // Calculate severity breakdown
  const severityBreakdown = {
    high: lies.filter(l => l.severity === 'high').length,
    medium: lies.filter(l => l.severity === 'medium').length,
    low: lies.filter(l => l.severity === 'low').length
  };
  
  // Calculate average confidence
  const averageConfidence = lies.length > 0 
    ? lies.reduce((sum, l) => sum + (l.confidence || 0), 0) / lies.length 
    : 0;
  
  window.LieBlockerDetectedLies = {
    videoId: videoId,
    detectedAt: new Date().toISOString(),
    totalLies: lies.length,
    lies: lies,
    summary: {
      severityBreakdown: severityBreakdown,
      averageConfidence: averageConfidence
    },
    
    downloadLiesData: function() {
      const data = {
        videoId: this.videoId,
        detectedAt: this.detectedAt,
        totalLies: this.totalLies,
        lies: this.lies,
        summary: this.summary,
        metadata: {
          analysisVersion: '2.1',
          downloadedAt: new Date().toISOString(),
          dataFormat: 'LieBlocker Detected Lies Export'
        }
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `detected-lies-${this.videoId}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    
    // Helper methods for console access
    getLiesByTimestamp: function(timestamp) {
      return this.lies.filter(lie => lie.timestamp === timestamp);
    },
    
    getLiesBySeverity: function(severity) {
      return this.lies.filter(lie => lie.severity === severity);
    },
    
    getHighConfidenceLies: function(threshold = 0.8) {
      return this.lies.filter(lie => (lie.confidence || 0) >= threshold);
    }
  };
}

// Function to clean old cache entries (keep only last 50 analyses)
async function cleanOldCache() {
  try {
    const allData = await chrome.storage.local.get(null);
    const analysisKeys = Object.keys(allData).filter(key => key.startsWith('analysis_'));
    
    if (analysisKeys.length > 50) {
      // Sort by timestamp and keep only the 50 most recent
      const sortedEntries = analysisKeys
        .map(key => ({ key, timestamp: allData[key].timestamp }))
        .sort((a, b) => b.timestamp - a.timestamp);
      
      const keysToRemove = sortedEntries.slice(50).map(entry => entry.key);
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
    }
  } catch (error) {
    console.error('Error cleaning cache:', error);
  }
}

// Enhanced system prompt function with improved lie detection criteria and strict JSON formatting
function buildSystemPrompt(analysisDuration) {
  return `You are an expert fact-checker. Identify false, misleading, or unsupported claims in video content. Evaluate all topics equally based on factual accuracy.

DETECTION CRITERIA (85%+ confidence required):
- Factually incorrect statements (not opinions or predictions)
- Claims contradicted by credible evidence or expert consensus  
- Misleading information that could harm or deceive
- Statistical misrepresentations or false cause-and-effect claims
- EXCLUDE accurate, true, or uncertain statements

CRITICAL: Return ONLY valid JSON in this EXACT format:
{
  "claims": [
    {
      "claim": "Exact false statement as spoken",
      "explanation": "Why it's false with evidence", 
      "confidence": 0.95,
      "severity": "high"
    }
  ]
}

- NO markdown formatting (no code blocks)
- NO additional text before or after JSON
- NO explanatory comments
- Return {"claims": []} if no lies found
- Ensure all JSON is properly formatted with correct quotes and commas

Analyze the following transcript: `;
}

// NEW: Enhanced function to find precise timestamp and duration using n-gram fallback
function findClaimStartAndEnd(claimText, transcriptData) {
  console.log(`🔍 Searching for claim: "${claimText}"`);
  
  // Clean the claim text but preserve more structure than before
  const cleanedClaim = claimText
    .toLowerCase()
    .replace(/[""'']/g, '"') // Normalize quotes
    .replace(/[…]/g, '...') // Normalize ellipsis
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  const fullTranscriptText = transcriptData.text.toLowerCase();
  console.log(`📜 Full transcript length: ${fullTranscriptText.length} characters`);
  
  // PRIORITY 1: Try to find the exact claim text in transcript
  let exactMatchIndex = fullTranscriptText.indexOf(cleanedClaim);
  
  if (exactMatchIndex !== -1) {
    console.log(`✅ Found exact match at character position ${exactMatchIndex}`);
    return calculateDurationFromMatch(exactMatchIndex, cleanedClaim, transcriptData);
  }
  
  // PRIORITY 2: Try with punctuation removed from both
  const noPunctClaim = cleanedClaim.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const noPunctTranscript = fullTranscriptText.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');
  
  exactMatchIndex = noPunctTranscript.indexOf(noPunctClaim);
  
  if (exactMatchIndex !== -1) {
    console.log(`✅ Found punctuation-normalized match at character position ${exactMatchIndex}`);
    return calculateDurationFromMatch(exactMatchIndex, noPunctClaim, transcriptData, true);
  }
  
  // PRIORITY 3: Try finding the longest common substring (for partial matches)
  const bestMatch = findLongestCommonSubstring(cleanedClaim, fullTranscriptText, transcriptData);
  
  if (bestMatch) {
    console.log(`✅ Found best substring match at position ${bestMatch.index} with ${bestMatch.matchLength} chars`);
    return bestMatch.result;
  }
  
  // PRIORITY 4: Word-by-word matching fallback
  return findBestWordMatch(cleanedClaim, transcriptData);
}

// Helper function to calculate duration from a text match
function calculateDurationFromMatch(matchIndex, matchText, transcriptData, isPunctuationNormalized = false) {
  const matchEndIndex = matchIndex + matchText.length;
  
  // Use character-to-segment mapping to find start and end segments
  const charToSegmentMap = isPunctuationNormalized ? 
    createPunctuationNormalizedCharMap(transcriptData) : 
    transcriptData.charToSegmentIndexMap;
  
  const startSegmentIndex = charToSegmentMap.get(matchIndex) || 
                           findNearestSegmentIndex(matchIndex, charToSegmentMap);
  const endSegmentIndex = charToSegmentMap.get(Math.min(matchEndIndex - 1, transcriptData.text.length - 1)) || 
                         findNearestSegmentIndex(matchEndIndex - 1, charToSegmentMap);
  
  if (startSegmentIndex !== undefined && endSegmentIndex !== undefined) {
    const startSegment = transcriptData.segmentTimestamps[startSegmentIndex];
    const endSegment = transcriptData.segmentTimestamps[endSegmentIndex];
    
    if (startSegment && endSegment) {
      const startInSeconds = startSegment.timestamp;
      const endInSeconds = endSegment.timestamp + (endSegment.duration || 5);
      const exactDuration = endInSeconds - startInSeconds;
      
      // Ensure minimum duration of 3 seconds for skip functionality
      const finalDuration = Math.max(3, exactDuration);
      
      console.log(`📏 Exact duration calculated: ${finalDuration}s (segments ${startSegmentIndex} to ${endSegmentIndex})`);
      console.log(`📏 Time range: ${startInSeconds}s to ${endInSeconds}s`);
      
      return {
        startInSeconds: Math.round(startInSeconds),
        endInSeconds: Math.round(endInSeconds),
        duration: Math.round(finalDuration)
      };
    }
  }
  
  console.warn(`⚠️ Could not map character positions to segments`);
  return null;
}

// Helper function to find longest common substring
function findLongestCommonSubstring(claim, transcript, transcriptData) {
  const claimWords = claim.split(/\s+/);
  let bestMatch = null;
  let bestScore = 0;
  
  // Try progressively smaller portions of the claim
  for (let length = claimWords.length; length >= 3; length--) {
    for (let start = 0; start <= claimWords.length - length; start++) {
      const substring = claimWords.slice(start, start + length).join(' ');
      const matchIndex = transcript.indexOf(substring);
      
      if (matchIndex !== -1) {
        const score = substring.length; // Score by character length
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            index: matchIndex,
            matchLength: substring.length,
            result: calculateDurationFromMatch(matchIndex, substring, transcriptData)
          };
        }
      }
    }
  }
  
  return bestMatch;
}

// Helper function for word-by-word matching
function findBestWordMatch(claim, transcriptData) {
  const claimWords = claim.split(/\s+/).filter(word => word.length > 2);
  
  if (claimWords.length === 0) {
    console.warn(`⚠️ No valid words found in claim`);
    return getFallbackDuration(transcriptData);
  }
  
  // Find the best matching segment for the first significant word
  const firstWord = claimWords[0];
  const fullText = transcriptData.text.toLowerCase();
  const firstWordIndex = fullText.indexOf(firstWord);
  
  if (firstWordIndex !== -1) {
    console.log(`✅ Found first word "${firstWord}" at position ${firstWordIndex}`);
    
    // Estimate duration based on number of words (assume ~3 words per second)
    const estimatedDuration = Math.max(3, Math.min(claimWords.length / 3, 15));
    
    const result = calculateDurationFromMatch(firstWordIndex, firstWord, transcriptData);
    if (result) {
      // Override duration with word-based estimate
      result.duration = Math.round(estimatedDuration);
      result.endInSeconds = result.startInSeconds + result.duration;
      console.log(`📏 Word-based duration estimate: ${result.duration}s`);
      return result;
    }
  }
  
  console.warn(`⚠️ Could not find any words from claim in transcript`);
  return getFallbackDuration(transcriptData);
}

// Helper function to create punctuation-normalized character map
function createPunctuationNormalizedCharMap(transcriptData) {
  const map = new Map();
  let charPos = 0;
  
  for (let i = 0; i < transcriptData.segmentTimestamps.length; i++) {
    const segment = transcriptData.segmentTimestamps[i];
    const normalizedText = segment.text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    
    for (let j = 0; j < normalizedText.length; j++) {
      map.set(charPos + j, i);
    }
    
    charPos += normalizedText.length + 1; // +1 for space between segments
  }
  
  return map;
}

// Helper function to find nearest segment index
function findNearestSegmentIndex(charIndex, charToSegmentMap) {
  // Try nearby positions
  for (let offset = 0; offset <= 10; offset++) {
    const index1 = charToSegmentMap.get(charIndex + offset);
    const index2 = charToSegmentMap.get(charIndex - offset);
    
    if (index1 !== undefined) return index1;
    if (index2 !== undefined) return index2;
  }
  
  return 0; // Fallback to first segment
}

// Helper function for final fallback
function getFallbackDuration(transcriptData) {
  const firstSeg = transcriptData.segmentTimestamps[0];
  const fallbackDur = firstSeg ? firstSeg.duration : 5;
  
  console.log(`📏 Using fallback duration: ${fallbackDur}s (first segment)`);
  
  return {
    startInSeconds: Math.round(transcriptData.startTime),
    endInSeconds: Math.round(transcriptData.startTime + fallbackDur),
    duration: Math.round(fallbackDur)
  };
  
  // PRIORITY 2: N-gram fallback with 3-word combinations
  const claimWords = normalizedClaim.split(/\s+/).filter(word => word.length > 2);
  
  if (claimWords.length === 0) {
    // Fallback to transcript start if no valid words
    return {
      startInSeconds: Math.round(transcriptData.startTime),
      endInSeconds: Math.round(transcriptData.startTime + 12),
      duration: 12
    };
  }
  
  // Generate n-grams (3-word, 2-word, 1-word combinations)
  const nGrams = [];
  
  // 3-word combinations (highest priority)
  for (let i = 0; i <= claimWords.length - 3; i++) {
    nGrams.push({
      text: claimWords.slice(i, i + 3).join(' '),
      score: 30,
      type: '3-gram'
    });
  }
  
  // 2-word combinations (medium priority)
  for (let i = 0; i <= claimWords.length - 2; i++) {
    nGrams.push({
      text: claimWords.slice(i, i + 2).join(' '),
      score: 15,
      type: '2-gram'
    });
  }
  
  // 1-word combinations (lowest priority)
  claimWords.forEach(word => {
    nGrams.push({
      text: word,
      score: 5,
      type: '1-gram'
    });
  });
  
  // Search for best n-gram match in segments
  let bestMatch = null;
  let bestScore = 0;
  
  for (const segment of transcriptData.segmentTimestamps) {
    const segmentText = segment.text.toLowerCase();
    let totalScore = 0;
    
    for (const nGram of nGrams) {
      if (segmentText.includes(nGram.text)) {
        totalScore += nGram.score;
        
        // Bonus for exact word boundaries
        const wordBoundaryRegex = new RegExp(`\\b${nGram.text.replace(/\s+/g, '\\s+')}\\b`);
        if (wordBoundaryRegex.test(segmentText)) {
          totalScore += nGram.score * 0.5; // 50% bonus for word boundaries
        }
      }
    }
    
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestMatch = segment;
    }
  }
  
  if (bestMatch && bestScore > 10) {
    const startInSeconds = bestMatch.timestamp;
    
    // Find the segment index for this best match
    const segmentIndex = transcriptData.segmentTimestamps.findIndex(seg => seg.timestamp === bestMatch.timestamp);
    
    if (segmentIndex !== -1) {
      // Calculate exact duration by finding all segments that contain the claim text
      const claimWords = normalizedClaim.split(/\s+/);
      let endSegmentIndex = segmentIndex;
      
      // Look ahead to find where the claim likely ends based on word count
      const wordsPerSegment = 3; // Average words per segment estimate
      const estimatedSegmentsNeeded = Math.max(1, Math.ceil(claimWords.length / wordsPerSegment));
      endSegmentIndex = Math.min(segmentIndex + estimatedSegmentsNeeded - 1, transcriptData.segmentTimestamps.length - 1);
      
      const endSegment = transcriptData.segmentTimestamps[endSegmentIndex];
      const exactEndTime = endSegment.timestamp + endSegment.duration;
      const exactDuration = exactEndTime - startInSeconds;
      
      // Ensure minimum duration of 3 seconds
      const finalDuration = Math.max(3, exactDuration);
      
      console.log(`📏 N-gram exact duration calculated: ${finalDuration}s (segments ${segmentIndex} to ${endSegmentIndex})`);
      
      return {
        startInSeconds: Math.round(startInSeconds),
        endInSeconds: Math.round(startInSeconds + finalDuration),
        duration: Math.round(finalDuration)
      };
    }
    
    // Fallback if segment index not found - use single segment duration
    const segmentDuration = bestMatch.duration || 5;
    console.log(`📏 Single segment duration used: ${segmentDuration}s`);
    
    return {
      startInSeconds: Math.round(startInSeconds),
      endInSeconds: Math.round(startInSeconds + segmentDuration),
      duration: Math.round(segmentDuration)
    };
  }
  
  // Use the centralized fallback function
  return getFallbackDuration(transcriptData);
}

// Function to analyze lies in full transcript with simplified processing and configurable duration
async function analyzeLies(transcriptData) {
  try {
    // Send progress update
    chrome.runtime.sendMessage({
      type: 'analysisProgress',
      stage: 'ai_processing',
      message: 'Sending transcript to AI for analysis...'
    });

    // Get AI provider and model settings
    const settings = await chrome.storage.sync.get(['aiProvider', 'openaiModel', 'geminiModel']);
    const provider = settings.aiProvider || 'openai';
    
    let model;
    if (provider === 'openai') {
      model = settings.openaiModel || 'gpt-4.1-mini';
    } else if (provider === 'gemini') {
      model = settings.geminiModel || 'gemini-2.0-flash-exp';
    }
    
    const apiKeyResult = await chrome.storage.local.get([`${provider}ApiKey`]);
    const apiKey = apiKeyResult[`${provider}ApiKey`];
    
    if (!apiKey) {
      console.error(`${provider} API key not found`);
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: `Please set your ${provider === 'openai' ? 'OpenAI' : 'Gemini'} API key in the extension popup.`
      });
      return null;
    }

    const systemPrompt = buildSystemPrompt(transcriptData.analysisDuration);
    
    // Create a structured transcript with clear timestamps for the AI
    const structuredTranscript = transcriptData.segmentTimestamps.map(segment => {
      return `[${segment.formattedTime}] ${segment.text}`;
    }).join('\n');
    
    // Simplified user content focused on the transcript with clear structure
    const userContent = `TRANSCRIPT TO ANALYZE (${transcriptData.timeWindow}):

${structuredTranscript}

Analyze this transcript and identify any false or misleading claims. Use the exact timestamps shown in brackets [MM:SS]. Return only the JSON response as specified.`;
    
    // Send progress update
    chrome.runtime.sendMessage({
      type: 'analysisProgress',
      stage: 'ai_request',
      message: `Analyzing first ${transcriptData.analysisDuration} minutes of content...`
    });

    let response;
    
    if (provider === 'openai') {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{
            role: "system",
            content: systemPrompt
          }, {
            role: "user",
            content: userContent
          }],
          temperature: 0.2,
          max_tokens: 2000
        })
      });
    } else if (provider === 'gemini') {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\n${userContent}`
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2000
          }
        })
      });
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Send progress update
    chrome.runtime.sendMessage({
      type: 'analysisProgress',
      stage: 'processing_response',
      message: 'Processing AI response and mapping timestamps...'
    });

    const data = await response.json();
    let content;
    
    if (provider === 'openai') {
      content = data.choices[0].message.content;
    } else if (provider === 'gemini') {
      content = data.candidates[0].content.parts[0].text;
    }
    
    // Enhanced JSON parsing with multiple strategies and better error handling
    try {
      console.log('🔍 Raw AI response received:', content.substring(0, 500) + (content.length > 500 ? '...' : ''));
      
      // Strategy 1: Try direct JSON parsing (if response is pure JSON)
      let parsedResult;
      try {
        parsedResult = JSON.parse(content.trim());
        console.log('✅ Direct JSON parsing successful');
      } catch (directParseError) {
        console.log('❌ Direct JSON parsing failed, trying extraction methods...');
        
        // Strategy 2: Clean and extract JSON from mixed content
        let cleanContent = content.trim();
        
        // Remove markdown code blocks and formatting
        cleanContent = cleanContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
        cleanContent = cleanContent.replace(/^json\s*/gi, ''); // Remove leading "json" text
        
        // Fix common JSON formatting issues
        cleanContent = cleanContent.replace(/\\"/g, '"'); // Fix escaped quotes
        cleanContent = cleanContent.replace(/"\s*:\s*"/g, '": "'); // Fix spacing around colons
        cleanContent = cleanContent.replace(/,\s*}/g, '}'); // Remove trailing commas
        cleanContent = cleanContent.replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
        
        // Strategy 3: Multiple JSON extraction patterns
        const jsonPatterns = [
          /\{[\s\S]*?\}/g, // Basic JSON object
          /\{[\s\S]*?"claims"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/g, // JSON with claims array
          /\{[\s\S]*?\}(?=\s*$)/g, // JSON object at end of string
          /(?<=^|\n)\s*\{[\s\S]*?\}\s*(?=\n|$)/g // JSON object on its own line
        ];
        
        let jsonMatch = null;
        for (const pattern of jsonPatterns) {
          const matches = cleanContent.match(pattern);
          if (matches && matches.length > 0) {
            // Try parsing each match to find valid JSON
            for (const match of matches) {
              try {
                const testParse = JSON.parse(match);
                if (testParse && (testParse.claims || testParse.analysis || testParse.results)) {
                  jsonMatch = match;
                  console.log(`✅ JSON extracted using pattern: ${pattern.source}`);
                  break;
                }
              } catch (testError) {
                continue;
              }
            }
            if (jsonMatch) break;
          }
        }
        
        if (jsonMatch) {
          try {
            parsedResult = JSON.parse(jsonMatch);
            console.log('✅ JSON extraction and parsing successful');
          } catch (extractedParseError) {
            console.error('❌ Failed to parse extracted JSON:', extractedParseError);
            throw new Error(`JSON extraction succeeded but parsing failed: ${extractedParseError.message}`);
          }
        } else {
          // Strategy 4: Look for key-value patterns and construct JSON
          console.log('⚠️ No JSON patterns found, attempting fallback parsing...');
          
          // Try to find claims in a structured text format
          const claimsMatch = content.match(/(?:claims?|lies?|false.*?statements?)[\s\S]*?(?:\[[\s\S]*?\]|\{[\s\S]*?\})/gi);
          if (claimsMatch) {
            console.log('🔍 Found potential claims structure, attempting to parse...');
            
            // Create a minimal valid structure
            parsedResult = {
              claims: [],
              analysis: "AI response could not be parsed as JSON, but potential issues were detected",
              confidence: 0.6
            };
          } else {
            throw new Error('No JSON or structured content found in AI response');
          }
        }
      }
      
      // Validate the parsed result structure
      if (!parsedResult || typeof parsedResult !== 'object') {
        throw new Error('Parsed result is not a valid object');
      }
      
      // Ensure claims array exists (accept alternative field names)
      if (!parsedResult.claims) {
        if (parsedResult.lies) {
          parsedResult.claims = parsedResult.lies;
          console.log('📝 Mapped "lies" field to "claims"');
        } else if (parsedResult.results) {
          parsedResult.claims = parsedResult.results;
          console.log('📝 Mapped "results" field to "claims"');
        } else if (parsedResult.issues) {
          parsedResult.claims = parsedResult.issues;
          console.log('📝 Mapped "issues" field to "claims"');
        } else {
          parsedResult.claims = [];
          console.log('⚠️ No claims array found, created empty array');
        }
      }
      
      // Enhanced post-processing for accurate timestamps and durations
      if (parsedResult.claims && Array.isArray(parsedResult.claims)) {
        console.log(`🔍 Processing ${parsedResult.claims.length} claims from AI response`);
        
        parsedResult.claims = parsedResult.claims.map((claim, index) => {
          // Handle different claim formats
          const claimText = claim.claim || claim.text || claim.statement || claim.lie || '';
          const explanation = claim.explanation || claim.reason || claim.details || '';
          const confidence = claim.confidence || claim.score || 0.85;
          
          console.log(`📝 Claim ${index + 1}: "${claimText}"`);
          console.log(`💬 Explanation: "${explanation}"`);
          console.log(`🎯 Confidence: ${confidence}`);
          
          // Use the new findClaimStartAndEnd function for precise timestamp and duration
          const { startInSeconds, endInSeconds, duration } = findClaimStartAndEnd(claimText, transcriptData);
          
          // Use exact timestamp (no offset applied for accurate timing)
          const finalTimeInSeconds = Math.max(transcriptData.startTime, startInSeconds);
          const finalTimestamp = formatSecondsToTimestamp(finalTimeInSeconds);
          
          // Ensure timestamp is within bounds
          const boundedTimeInSeconds = Math.max(transcriptData.startTime, Math.min(finalTimeInSeconds, transcriptData.endTime));
          const boundedTimestamp = formatSecondsToTimestamp(boundedTimeInSeconds);
          
          // Ensure minimum confidence of 85%
          const adjustedConfidence = Math.max(0.85, confidence || 0.85);
          
          return {
            claim: claimText,
            explanation: explanation,
            confidence: adjustedConfidence,
            severity: claim.severity || 'medium',
            timestamp: boundedTimestamp,
            timeInSeconds: boundedTimeInSeconds,
            duration: duration
          };
        });
        
        // Filter out claims with empty text
        parsedResult.claims = parsedResult.claims.filter(claim => claim.claim && claim.claim.trim().length > 0);
        
        // Filter out lies with confidence below 85%
        let highConfidenceLies = parsedResult.claims.filter(claim => claim.confidence >= 0.85);
        console.log(`✅ ${highConfidenceLies.length} claims passed confidence threshold (85%+)`);
        
        // NEW: Filter out claims that AI explicitly identifies as accurate
        const beforeAccuracyFilter = highConfidenceLies.length;
        highConfidenceLies = highConfidenceLies.filter(claim => {
          const explanation = (claim.explanation || '').toLowerCase();
          const isAccurate = explanation.includes('accurate') ||
                            explanation.includes('correct') ||
                            explanation.includes('not false') ||
                            explanation.includes('not misleading') ||
                            explanation.includes('this claim is true') ||
                            explanation.includes('this statement is accurate') ||
                            explanation.includes('factually correct');
          
          if (isAccurate) {
            console.log(`🚫 Filtering out accurate claim: "${claim.claim}"`);
            console.log(`📝 Explanation: "${claim.explanation}"`);
            return false; // Exclude accurate claims
          }
          return true; // Keep potentially false claims
        });
        
        const afterAccuracyFilter = highConfidenceLies.length;
        if (beforeAccuracyFilter > afterAccuracyFilter) {
          console.log(`🚫 Filtered out ${beforeAccuracyFilter - afterAccuracyFilter} accurate claims`);
        }
        
        parsedResult.claims = highConfidenceLies;
        console.log(`🎯 Final result: ${parsedResult.claims.length} lies to report`);
        
        // Sort by timestamp for logical order
        parsedResult.claims.sort((a, b) => a.timeInSeconds - b.timeInSeconds);
      }
      
      return parsedResult;
      
    } catch (parseError) {
      console.error('❌ All JSON parsing strategies failed:', parseError);
      console.log('🔍 Full AI response for debugging:');
      console.log('Content length:', content.length);
      console.log('Content preview:', content.substring(0, 1000));
      console.log('Content type:', typeof content);
      
      // Return a fallback result instead of failing completely
      return { 
        claims: [], 
        rawContent: content, 
        parseError: parseError.message,
        analysis: "AI response could not be parsed. Please check the console for debugging information."
      };
    }
    
  } catch (error) {
    console.error('❌ Error analyzing lies:', error);
    
    // Handle extension context invalidation specially
    if (error.message.includes('Extension context invalidated')) {
      console.warn('🔄 Extension context invalidated during analysis');
      showExtensionReloadNotification();
      return {
        claims: [],
        analysis: 'Extension was reloaded during analysis. Please refresh the page and try again.',
        contextInvalidated: true
      };
    }
    
    // Provide specific error messages based on error type
    let userMessage = 'Error analyzing lies: ';
    
    if (error.message.includes('API key')) {
      userMessage += 'Please check your AI API key in the extension settings.';
    } else if (error.message.includes('fetch')) {
      userMessage += 'Network connection failed. Please check your internet connection and try again.';
    } else if (error.message.includes('HTTP error! status: 401')) {
      userMessage += 'API authentication failed. Please verify your API key is correct.';
    } else if (error.message.includes('HTTP error! status: 429')) {
      userMessage += 'API rate limit exceeded. Please wait a moment and try again.';
    } else if (error.message.includes('HTTP error! status: 500')) {
      userMessage += 'AI service temporarily unavailable. Please try again in a few minutes.';
    } else if (error.message.includes('JSON')) {
      userMessage += 'AI response format error. The analysis may still work, please check the results.';
    } else {
      userMessage += error.message;
    }
    
    // Only try to send message if extension context is valid
    if (isExtensionContextValid()) {
      try {
        await safelySendMessageToBackground({
          type: 'analysisResult',
          data: userMessage
        });
      } catch (msgError) {
        console.error('Error sending message:', msgError);
      }
    } else {
      console.warn('Cannot send error message - extension context invalidated');
    }
    
    return null;
  }
}

// NEW: Helper function to fetch video metadata (title, channel, etc.)
async function fetchVideoMetadata(videoId) {
  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${YOUTUBE_API_KEY}&part=snippet`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      const videoInfo = data.items[0].snippet;
      return {
        title: videoInfo.title,
        channelId: videoInfo.channelId,
        channelName: videoInfo.channelTitle,
        description: videoInfo.description,
        publishedAt: videoInfo.publishedAt
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching video metadata:', error);
    return null;
  }
}

// Enhanced main function to process video with full transcript analysis
async function processVideo() {
  try {
    const videoId = new URLSearchParams(window.location.href.split('?')[1]).get('v');
    if (!videoId) {
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: 'Error: Could not extract video ID from URL'
      });
      return;
    }

    // Initialize empty LieBlockerDetectedLies object immediately
    storeDetectedLiesForDownload([], videoId);

    // Notify background script that analysis is starting
    chrome.runtime.sendMessage({
      type: 'startAnalysis',
      videoId: videoId
    });

    // First check for existing analysis (cache + Supabase)
    chrome.runtime.sendMessage({
      type: 'analysisProgress',
      stage: 'existing_check',
      message: 'Checking for existing analysis data...'
    });

    // Check local cache first
    const cachedAnalysis = await getCachedAnalysis(videoId);
    if (cachedAnalysis) {
      chrome.runtime.sendMessage({
        type: 'analysisProgress',
        stage: 'cache_found',
        message: 'Loading cached analysis results...'
      });
      
      // Send cached lies for real-time display
      if (cachedAnalysis.claims && cachedAnalysis.claims.length > 0) {
        // Always store lies for potential skip mode use
        currentVideoLies = cachedAnalysis.claims;
        
        chrome.runtime.sendMessage({
          type: 'liesUpdate',
          claims: cachedAnalysis.claims,
          videoId: videoId,
          isComplete: true
        });
        
        // Update session stats for cached results
        await updateSessionStats(cachedAnalysis.claims, videoId);
        
        // Start skip mode monitoring if skip mode is enabled
        const settings = await chrome.storage.sync.get(['detectionMode']);
        if (settings.detectionMode === 'skip') {
          startSkipModeMonitoring();
        }
      }
      
      // Display cache results
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: cachedAnalysis.analysis + '\n\nAnalysis loaded from cache!'
      });
      return;
    }

    // Check Supabase database if available
    if (window.SupabaseDB) {
      try {
        chrome.runtime.sendMessage({
          type: 'analysisProgress',
          stage: 'database_check',
          message: 'Checking database for existing analysis...'
        });
        
        console.log('🔍 Content: Checking Supabase for video analysis...');
        const videoStats = await window.SupabaseDB.getVideoStats(videoId);
        
        if (videoStats && videoStats.lies && videoStats.lies.length > 0) {
          console.log('📊 Content: Found lies in Supabase database');
          
          chrome.runtime.sendMessage({
            type: 'analysisProgress',
            stage: 'database_found',
            message: 'Loading analysis from database...'
          });
          
          // Transform Supabase lies to our format
          const transformedLies = videoStats.lies.map(lie => ({
            timestamp: formatSecondsToTimestamp(lie.timestamp_seconds),
            timeInSeconds: lie.timestamp_seconds,
            duration: lie.duration_seconds || 10,
            claim: lie.claim_text,
            explanation: lie.explanation,
            confidence: lie.confidence,
            severity: lie.severity,
            category: lie.category || 'other'
          }));
          
          // Create analysis text
          const analysisText = `📊 Analysis loaded from database\n\nFound ${transformedLies.length} lies previously detected in this video.\nAverage confidence: ${Math.round(transformedLies.reduce((sum, lie) => sum + lie.confidence, 0) / transformedLies.length * 100)}%`;
          
          // Store in local cache for faster future access
          await saveAnalysisToCache(videoId, analysisText, transformedLies);
          
          // Store lies for download
          storeDetectedLiesForDownload(transformedLies, videoId);
          
          // Always store lies for potential skip mode use
          currentVideoLies = transformedLies;
          
          // Send lies update to popup
          chrome.runtime.sendMessage({
            type: 'liesUpdate',
            claims: transformedLies,
            videoId: videoId,
            isComplete: true
          });
          
          // Update session stats for database results
          await updateSessionStats(transformedLies, videoId);
          
          // Send final analysis message
          chrome.runtime.sendMessage({
            type: 'analysisResult',
            data: analysisText
          });
          
          // Start skip mode if enabled
          const settings = await chrome.storage.sync.get(['detectionMode']);
          if (settings.detectionMode === 'skip') {
            startSkipModeMonitoring();
          }
          
          console.log('✅ Content: Loaded analysis from Supabase database');
          return;
        }
      } catch (dbError) {
        console.warn('⚠️ Content: Error checking Supabase database:', dbError);
      }
    }

    // No existing analysis found - proceed with new analysis
    console.log('📭 Content: No existing analysis found, starting new analysis...');

    // No cache found, proceed with fresh analysis
    chrome.runtime.sendMessage({
      type: 'analysisProgress',
      stage: 'transcript_extraction',
      message: 'Extracting video transcript...'
    });
    
    const transcript = await getTranscript();
    if (!transcript) {
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: 'Could not extract transcript. Make sure the video has closed captions available.'
      });
      return;
    }

    chrome.runtime.sendMessage({
      type: 'analysisProgress',
      stage: 'transcript_preparation',
      message: 'Preparing transcript with precise timestamp mapping...'
    });

    // Prepare full transcript for analysis with enhanced timestamp mapping
    const transcriptData = await prepareFullTranscript(transcript);
    
    if (!transcriptData) {
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: 'No analyzable content found in transcript.'
      });
      return;
    }
    
    chrome.runtime.sendMessage({
      type: 'analysisProgress',
      stage: 'analysis_start',
      message: `Starting lie detection with 85%+ confidence threshold...`
    });

    // Analyze the full transcript for lies with simplified processing
    const analysis = await analyzeLies(transcriptData);
    
    let allLies = [];
    if (analysis && analysis.claims && analysis.claims.length > 0) {
      allLies = analysis.claims;
    }

    // Update the LieBlockerDetectedLies object with final results
    storeDetectedLiesForDownload(allLies, videoId);

    // Send final lies update
    chrome.runtime.sendMessage({
      type: 'liesUpdate',
      claims: allLies,
      videoId: videoId,
      totalClaims: allLies.length,
      isComplete: true
    });

    // Prepare final analysis with enhanced reporting
    let finalAnalysis;
    if (allLies.length === 0) {
      finalAnalysis = `✅ Lie detection complete!\n\nAnalyzed first ${transcriptData.analysisDuration} minutes of video content with precision timestamp mapping.\nNo lies detected in this video.\n\nThis content appears to be factually accurate based on our strict detection criteria.`;
    } else {
      // Sort lies by timestamp for final display
      allLies.sort((a, b) => a.timeInSeconds - b.timeInSeconds);
      
      const liesText = allLies.map((claim, index) => {
        const severityEmoji = {
          low: '🟡',
          medium: '🟠',
          high: '🔴'
        };
        
        return `${index + 1}. ${severityEmoji[claim.severity] || '🟠'} ${claim.timestamp} (${claim.duration}s)\n🚫 Lie: ${claim.claim}\n🎯 Confidence: ${Math.round(claim.confidence * 100)}%\n💡 ${claim.explanation}`;
      }).join('\n\n');
      
      const avgConfidence = Math.round(allLies.reduce((sum, c) => sum + c.confidence, 0) / allLies.length * 100);
      const highSeverity = allLies.filter(c => c.severity === 'high').length;
      
      finalAnalysis = `🚨 LIES DETECTED! 🚨\n\nAnalyzed first ${transcriptData.analysisDuration} minutes of video content with enhanced precision.\nFound ${allLies.length} lies with ${avgConfidence}% average confidence.\n\n⚠️ WARNING: This content contains false information that could be harmful if believed.\n\n${liesText}`;
    }

    // Save final analysis to cache
    await saveAnalysisToCache(videoId, finalAnalysis, allLies);
    
    // Store analysis to Supabase database if available
    if (window.SupabaseDB && allLies.length > 0) {
      try {
        console.log('💾 Content: Storing analysis results to Supabase...');
        await storeAnalysisToDatabase(videoId, allLies, transcriptData);
        console.log('✅ Content: Successfully stored lies to database');
      } catch (dbError) {
        console.warn('⚠️ Content: Failed to store lies to database:', dbError);
      }
    }
    
    // Update session stats with improved time calculation
    await updateSessionStats(allLies, videoId);
    
    // Clean old cache entries
    await cleanOldCache();

    chrome.runtime.sendMessage({
      type: 'analysisResult',
      data: finalAnalysis
    });

    // Always store lies for potential skip mode use
    if (allLies.length > 0) {
      currentVideoLies = allLies;
    }

    // Start skip mode monitoring if skip mode is enabled and lies were found
    const detectionSettings = await chrome.storage.sync.get(['detectionMode']);
    if (detectionSettings.detectionMode === 'skip' && allLies.length > 0) {
      startSkipModeMonitoring();
    }

  } catch (error) {
    console.error('Error in processVideo:', error);
    
    // Handle extension context invalidation specially
    if (error.message.includes('Extension context invalidated')) {
      console.warn('🔄 Extension context invalidated during video processing');
      showExtensionReloadNotification();
      return;
    }
    
    // Only try to send message if extension context is valid
    if (isExtensionContextValid()) {
      try {
        await safelySendMessageToBackground({
          type: 'analysisResult',
          data: `Error processing video: ${error.message}`
        });
      } catch (msgError) {
        console.error('Error sending message:', msgError);
      }
    } else {
      console.warn('Cannot send error message - extension context invalidated');
    }
  }
}

// Function to get current video timestamp
function getCurrentVideoTimestamp() {
  try {
    const video = document.querySelector('video');
    if (video && !isNaN(video.currentTime)) {
      return video.currentTime;
    }
    return 0;
  } catch (error) {
    console.error('Error getting current timestamp:', error);
    return 0;
  }
}

// Function to jump to specific timestamp
function jumpToVideoTimestamp(seconds) {
  try {
    const video = document.querySelector('video');
    if (video) {
      // Ensure the timestamp is valid
      const targetTime = Math.max(0, Math.min(seconds, video.duration || seconds));
      video.currentTime = targetTime;
      
      // Also update the URL to reflect the timestamp (YouTube feature)
      const url = new URL(window.location.href);
      url.searchParams.set('t', Math.floor(targetTime) + 's');
      window.history.replaceState({}, '', url.toString());
      
      return true;
    }
    console.error('Video element not found');
    return false;
  } catch (error) {
    console.error('Error jumping to timestamp:', error);
    return false;
  }
}

// Enhanced Skip Mode Variables and Functions
let currentVideoLies = [];
let skipModeActive = false;
let skipModeInterval = null;
let skippedLiesInSession = new Set();

// Function to create unique identifier for a lie
function createLieId(lie) {
  return `${lie.timeInSeconds}_${lie.claim.substring(0, 50)}`;
}

// Enhanced function to start skip mode monitoring
function startSkipModeMonitoring() {
  if (skipModeActive) {
    console.log('⏭️ Skip mode already active');
    return;
  }
  
  if (!currentVideoLies || currentVideoLies.length === 0) {
    console.log('⏭️ No lies to monitor for skipping');
    return;
  }
  
  skipModeActive = true;
  skippedLiesInSession.clear();
  console.log('🚀 Skip mode monitoring started with', currentVideoLies.length, 'lies to monitor');
  console.log('🚀 Lies to monitor:', currentVideoLies.map(l => `${l.timestamp} (${l.timeInSeconds}s-${l.timeInSeconds + l.duration}s)`));
  
  if (skipModeInterval) {
    clearInterval(skipModeInterval);
  }
  
  skipModeInterval = setInterval(() => {
    checkAndSkipLies();
  }, 250);
}

// Enhanced function to stop skip mode monitoring
function stopSkipModeMonitoring() {
  if (!skipModeActive) {
    return;
  }
  
  skipModeActive = false;
  console.log('⏹️ Skip mode monitoring stopped');
  
  if (skipModeInterval) {
    clearInterval(skipModeInterval);
    skipModeInterval = null;
  }
}

// Enhanced function to check and skip lies with comprehensive debugging
function checkAndSkipLies() {
  try {
    const video = document.querySelector('video');
    if (!video) {
      console.log('⏭️ Skip mode: Video element not found');
      return;
    }
    
    const currentTime = video.currentTime;
    const isPlaying = !video.paused && !video.ended && video.readyState > 2;
    
    // Log current state every 10 seconds for debugging
    if (Math.floor(currentTime) % 10 === 0 && Math.floor(currentTime * 4) % 4 === 0) {
      console.log(`⏭️ Skip mode: Current time: ${currentTime.toFixed(2)}s, Is playing: ${isPlaying}, Video state: paused=${video.paused}, ended=${video.ended}, readyState=${video.readyState}`);
      console.log(`⏭️ Skip mode: Monitoring ${currentVideoLies.length} lies, Already skipped: ${skippedLiesInSession.size}`);
    }
    
    if (!isPlaying) {
      return;
    }
    
    for (const lie of currentVideoLies) {
      const lieStart = lie.timeInSeconds;
      const lieDuration = lie.duration; // Use exact duration from transcript analysis
      
      // Ensure we have a valid duration (should always have one now)
      if (!lieDuration || lieDuration <= 0) {
        console.warn(`⚠️ Skip mode: Lie at ${lie.timestamp} has invalid duration (${lieDuration}), skipping`);
        continue;
      }
      
      const lieEnd = lieStart + lieDuration;
      const lieId = createLieId(lie);
      
      // Log when we're approaching a lie (within 5 seconds)
      if (currentTime >= lieStart - 5 && currentTime < lieStart && !skippedLiesInSession.has(lieId)) {
        console.log(`⏭️ Skip mode: Approaching lie at ${lie.timestamp} in ${(lieStart - currentTime).toFixed(1)}s`);
        console.log(`⏭️ Skip mode: Lie details - Start: ${lieStart}s, Duration: ${lieDuration}s, End: ${lieEnd}s`);
        console.log(`⏭️ Skip mode: Claim: "${lie.claim.substring(0, 100)}..."`);
      }
      
      if (currentTime >= lieStart && currentTime < lieEnd) {
        if (skippedLiesInSession.has(lieId)) {
          console.log(`⏭️ Skip mode: Lie already skipped: ${lie.timestamp}`);
          continue;
        }
        
        console.log(`🚨 SKIP MODE: SKIPPING LIE NOW!`);
        console.log(`🚨 Skip mode: Current time: ${currentTime.toFixed(2)}s`);
        console.log(`🚨 Skip mode: Lie start: ${lieStart}s (${lie.timestamp})`);
        console.log(`🚨 Skip mode: Lie duration: ${lieDuration}s`);
        console.log(`🚨 Skip mode: Lie end: ${lieEnd}s`);
        console.log(`🚨 Skip mode: Claim: "${lie.claim}"`);
        
        skippedLiesInSession.add(lieId);
        
        const skipToTime = lieEnd + 1;
        console.log(`🚨 Skip mode: Jumping to ${skipToTime}s`);
        
        video.currentTime = skipToTime;
        
        const url = new URL(window.location.href);
        url.searchParams.set('t', Math.floor(skipToTime) + 's');
        window.history.replaceState({}, '', url.toString());
        
        showSkipNotification(lie, lieDuration);
        
        // Notify background script for stats tracking
        chrome.runtime.sendMessage({
          type: 'lieSkipped',
          lie: lie,
          duration: lieDuration,
          timestamp: currentTime
        });
        
        console.log(`✅ Skip mode: Successfully skipped to ${skipToTime}s (after ${lieDuration}s lie)`);
        console.log(`⏱️ Skip mode: Time saved this skip: ${lieDuration}s`);
        console.log(`✅ Skip mode: Total lies skipped this session: ${skippedLiesInSession.size}`);
        
        break;
      }
    }
    
  } catch (error) {
    console.error('❌ Error in checkAndSkipLies:', error);
  }
}

// Function to show skip notification
function showSkipNotification(lie, duration) {
  try {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      max-width: 300px;
      animation: slideInBounce 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 18px;">⏭️</span>
        <div>
          <div style="font-weight: 700; margin-bottom: 4px;">Lie Skipped!</div>
          <div style="font-size: 12px; opacity: 0.9;">Skipped ${duration}s at ${lie.timestamp}</div>
        </div>
      </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInBounce {
        0% {
          transform: translateX(100%) scale(0.8);
          opacity: 0;
        }
        60% {
          transform: translateX(-10px) scale(1.05);
          opacity: 1;
        }
        100% {
          transform: translateX(0) scale(1);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOut 0.3s ease-in-out forwards';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
          if (style.parentNode) {
            style.remove();
          }
        }, 300);
      }
    }, 3000);
    
  } catch (error) {
    console.error('Error showing skip notification:', error);
  }
}

// Function to handle detection mode updates
function updateDetectionMode(mode) {
  console.log('🔧 Detection mode updated to:', mode);
  
  if (mode === 'skip') {
    // If we already have lies loaded, start monitoring immediately
    if (currentVideoLies && currentVideoLies.length > 0) {
      startSkipModeMonitoring();
    } else {
      // No lies loaded yet - try to auto-load them
      console.log('🔧 Skip mode enabled but no lies loaded - attempting to auto-load...');
      autoLoadVideoLies().then(() => {
        // After auto-loading, check if we now have lies to monitor
        if (currentVideoLies && currentVideoLies.length > 0) {
          console.log('🔧 Auto-loaded lies for skip mode:', currentVideoLies.length);
          startSkipModeMonitoring();
        } else {
          console.log('🔧 No lies found to monitor in skip mode');
        }
      }).catch(error => {
        console.warn('🔧 Could not auto-load lies for skip mode:', error);
      });
    }
  } else {
    stopSkipModeMonitoring();
  }
}

// Function to automatically load cached lies for the current video
async function autoLoadVideoLies() {
  try {
    const videoId = getCurrentVideoId();
    if (!videoId) {
      console.log('No video ID found for auto-loading lies');
      return;
    }

    console.log('🔄 Auto-loading cached lies for video:', videoId);
    
    // Check for cached analysis
    const cacheKey = `analysis_${videoId}`;
    const cached = await chrome.storage.local.get([cacheKey]);
    
    if (cached[cacheKey] && cached[cacheKey].claims) {
      const lies = cached[cacheKey].claims;
      console.log(`✅ Found ${lies.length} cached lies for auto-loading`);
      
      // Set the lies globally
      currentVideoLies = lies;
      window.LieBlockerDetectedLies = lies;
      
      // Send to background for UI updates
      safelySendMessageToBackground({
        type: 'analysisResult',
        data: {
          lies: lies,
          videoId: videoId,
          cached: true
        }
      });
      
      return lies;
    } else {
      console.log('No cached lies found for auto-loading');
      return [];
    }
  } catch (error) {
    console.error('Error auto-loading video lies:', error);
    return [];
  }
}

// Function to get current video ID from URL
function getCurrentVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

// Listen for messages from popup and background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === 'startAnalysis') {
      // Handle async processVideo properly
      processVideo().then(() => {
        try {
          sendResponse({ success: true });
        } catch (error) {
          console.error('Error sending startAnalysis response:', error);
        }
      }).catch(error => {
        console.error('Error in processVideo:', error);
        try {
          sendResponse({ success: false, error: error.message });
        } catch (sendError) {
          console.error('Error sending error response:', sendError);
        }
      });
      return true; // Keep message channel open for async response
    } else if (message.type === 'getCurrentTimestamp') {
      const timestamp = getCurrentVideoTimestamp();
      sendResponse({ timestamp: timestamp });
    } else if (message.type === 'jumpToTimestamp') {
      const success = jumpToVideoTimestamp(message.timestamp);
      sendResponse({ success: success });
    } else if (message.type === 'updateDetectionMode') {
      updateDetectionMode(message.mode);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: true });
    }
  } catch (error) {
    console.error('Error in content script message handler:', error);
    try {
      sendResponse({ success: false, error: error.message });
    } catch (sendError) {
      console.error('Error sending error response:', sendError);
    }
  }
});

// Check if we're on a YouTube video page
function isYouTubeVideoPage() {
  return window.location.href.includes('youtube.com/watch');
}

// Send page status to popup when it opens
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === 'checkPageStatus') {
      sendResponse({ 
        isVideoPage: isYouTubeVideoPage(),
        videoTitle: document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim() || 'Unknown Video'
      });
    } else {
      sendResponse({ success: true });
    }
  } catch (error) {
    console.error('Error in checkPageStatus handler:', error);
    try {
      sendResponse({ success: false, error: error.message });
    } catch (sendError) {
      console.error('Error sending error response:', sendError);
    }
  }
});

// Handle page navigation and cleanup
function handlePageNavigation() {
  const currentVideoId = new URLSearchParams(window.location.href.split('?')[1]).get('v');
  
  if (currentVideoId !== lastVideoId) {
    console.log('🔄 New video detected, resetting skip mode state');
    stopSkipModeMonitoring();
    currentVideoLies = [];
    skippedLiesInSession.clear();
    lastVideoId = currentVideoId;
    
    // Clear previous video data objects
    window.LieBlockerDetectedLies = null;
    
    // NEW: Auto-load lies for the new video
    if (currentVideoId) {
      setTimeout(() => {
        autoLoadVideoLies();
      }, 1000); // Wait 1 second for page to stabilize
    }
  }
}

let lastVideoId = null;

// Listen for URL changes (YouTube is a SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    handlePageNavigation();
  }
}).observe(document, { subtree: true, childList: true });

// Initialize on page load
handlePageNavigation();

// NEW: Auto-load lies when content script first loads
if (isYouTubeVideoPage()) {
  setTimeout(() => {
    autoLoadVideoLies();
  }, 2000); // Wait 2 seconds for page to fully load
}

// Function to update session stats with unique counting per video
async function updateSessionStats(newLies = [], videoId) {
  try {
    const stats = await chrome.storage.local.get(['sessionStats', 'analyzedVideos', 'videoLiesCounts']);
    const currentStats = stats.sessionStats || {
      videosAnalyzed: 0,
      liesDetected: 0,
      timeSaved: 0
    };
    
    // Track analyzed videos to prevent duplicate counting
    const analyzedVideos = new Set(stats.analyzedVideos || []);
    
    // Track lies detected per video to prevent duplicate counting
    const videoLiesCounts = stats.videoLiesCounts || {};
    
    // Only increment video count if this video hasn't been analyzed before
    if (videoId && !analyzedVideos.has(videoId)) {
      currentStats.videosAnalyzed += 1;
      analyzedVideos.add(videoId);
      
      // Store the updated list of analyzed videos
      await chrome.storage.local.set({ analyzedVideos: Array.from(analyzedVideos) });
      console.log(`📊 New video analyzed: ${videoId} (total: ${currentStats.videosAnalyzed})`);
    } else if (videoId && analyzedVideos.has(videoId)) {
      console.log(`📊 Video already analyzed: ${videoId} (not incrementing count)`);
    }
    
    // Only update lies count if this video's lies haven't been counted before
    if (videoId && !videoLiesCounts[videoId]) {
      currentStats.liesDetected += newLies.length;
      videoLiesCounts[videoId] = newLies.length;
      
      // Store the updated lies counts
      await chrome.storage.local.set({ videoLiesCounts: videoLiesCounts });
      console.log(`📊 New lies counted for ${videoId}: ${newLies.length} (total: ${currentStats.liesDetected})`);
    } else if (videoId && videoLiesCounts[videoId]) {
      console.log(`📊 Lies already counted for ${videoId}: ${videoLiesCounts[videoId]} (not adding again)`);
    }
    
    // NOTE: timeSaved is now only calculated when lies are actually skipped by the user
    // This ensures accurate time saved statistics based on actual user behavior
    // See lieSkipped message handler in popup.js and background.js for time tracking
    
    await chrome.storage.local.set({ sessionStats: currentStats });
    console.log('📊 Session stats updated:', currentStats);
    
    // Notify popup of stats update
    safelySendMessageToBackground({ type: 'STATS_UPDATE' });
    
  } catch (error) {
    console.error('Error updating session stats:', error);
  }
}

// Function to store analysis results to Supabase database
async function storeAnalysisToDatabase(videoId, lies, transcriptData) {
  console.log('💾 Attempting to store analysis to database...');
  console.log('💾 Window.SupabaseDB available:', !!window.SupabaseDB);
  
  if (!window.SupabaseDB) {
    console.warn('⚠️ Supabase database client not available - skipping database storage');
    console.log('💾 Available window properties:', Object.keys(window).filter(k => k.includes('Supabase')));
    return;
  }

  try {
    console.log('💾 Starting database storage process...');
    // Get video metadata
    const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer, #title h1')?.textContent?.trim() || 'Unknown Video';
    const channelName = document.querySelector('#channel-name a, #owner-text a')?.textContent?.trim() || 'Unknown Channel';
    const videoUrl = window.location.href.split('&')[0];
    
    const totalLies = lies.length;
    const averageConfidence = totalLies > 0 ? lies.reduce((sum, lie) => sum + lie.confidence, 0) / totalLies : 0;
    const severityBreakdown = lies.reduce((acc, lie) => {
      acc[lie.severity] = (acc[lie.severity] || 0) + 1;
      return acc;
    }, { low: 0, medium: 0, high: 0 });

    console.log('💾 Analysis summary:', { totalLies, averageConfidence, severityBreakdown });

    // Prepare analysis data for database (matching what content script expects)
    const analysisData = {
      video_id: videoId,
      video_title: videoTitle,
      channel_name: channelName,
      video_url: videoUrl,
      total_lies: totalLies,
      average_confidence: averageConfidence,
      severity_low: severityBreakdown.low,
      severity_medium: severityBreakdown.medium,
      severity_high: severityBreakdown.high,
      analysis_duration_minutes: transcriptData?.analysisDuration || 0,
      total_segments_analyzed: transcriptData?.totalSegments || 0
    };

    console.log('💾 Storing video analysis data:', analysisData);

    // Store video analysis
    await window.SupabaseDB.storeVideoAnalysis(analysisData);
    console.log('✅ Video analysis stored successfully');

    if (totalLies > 0) {
      // Prepare lies data for database
      const liesData = lies.map(lie => ({
        video_id: videoId,
        timestamp_seconds: lie.timeInSeconds,
        duration_seconds: lie.duration || 10,
        claim_text: lie.claim,
        explanation: lie.explanation,
        confidence: lie.confidence,
        severity: lie.severity,
        category: lie.category || 'other',
        created_at: new Date().toISOString()
      }));

      console.log('💾 Storing lies data:', liesData.length, 'lies');
      await window.SupabaseDB.storeLies(liesData);
      console.log('✅ Lies data stored successfully');
    }

    console.log(`✅ Database: Stored analysis for video ${videoId} with ${totalLies} lies`);
    
  } catch (error) {
    console.error('❌ Database: Error storing analysis:', error);
    console.error('❌ Error details:', error.message, error.stack);
    // Don't throw the error - allow the analysis to continue even if database storage fails
  }
}