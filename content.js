// Enhanced YouTube transcript extraction with automatic analysis on video load
// This content script runs on YouTube pages and handles video analysis

(function() {
  'use strict';
  
  console.log('🚀 LieBlocker content script loaded');
  
  // Set a flag to indicate the content script is loaded
  window.LieBlockerContentLoaded = true;
  
  // Global state
  let currentVideoId = null;
  let isAnalyzing = false;
  let skipLiesEnabled = false;
  let currentLies = [];
  let videoPlayer = null;
  let skipNotificationTimeout = null;
  let securityService = null;
  let autoAnalysisEnabled = true; // New flag for automatic analysis
  let transcriptCheckInterval = null;
  let analysisQueue = new Set(); // Track videos queued for analysis
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
  function initialize() {
    console.log('🎬 Initializing LieBlocker on YouTube');
    
    // Initialize security service if available
    if (typeof SecurityService !== 'undefined') {
      try {
        securityService = new SecurityService();
        console.log('🔒 Security service initialized in content script');
      } catch (error) {
        console.warn('⚠️ Failed to initialize SecurityService:', error);
      }
    } else {
      console.warn('⚠️ SecurityService not available in content script');
    }
    
    // Set up video change detection
    setupVideoChangeDetection();
    
    // Set up message listener
    setupMessageListener();
    
    // Load skip lies setting
    loadSkipLiesSetting();
    
    // Initial video detection and analysis
    detectVideoChange();
    
    console.log('✅ LieBlocker content script initialized');
  }
  
  function setupVideoChangeDetection() {
    // Watch for URL changes (YouTube is a SPA)
    let lastUrl = location.href;
    
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log('🔄 URL changed, detecting new video...');
        setTimeout(detectVideoChange, 1000); // Delay to ensure page is loaded
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Also listen for popstate events
    window.addEventListener('popstate', () => {
      console.log('🔄 Popstate event, detecting video change...');
      setTimeout(detectVideoChange, 1000);
    });
    
    // Listen for YouTube's navigation events
    window.addEventListener('yt-navigate-finish', () => {
      console.log('🔄 YouTube navigation finished, detecting video change...');
      setTimeout(detectVideoChange, 1000);
    });
  }
  
  function detectVideoChange() {
    const videoId = extractVideoId();
    
    if (videoId && videoId !== currentVideoId) {
      console.log('📹 New video detected:', videoId);
      currentVideoId = videoId;
      currentLies = [];
      
      // Clear any existing transcript check interval
      if (transcriptCheckInterval) {
        clearInterval(transcriptCheckInterval);
        transcriptCheckInterval = null;
      }
      
      // Get video player reference
      videoPlayer = document.querySelector('video');
      
      // Load lies for this video from background storage
      loadCurrentVideoLies(videoId);
      
      // Start automatic analysis if enabled and not already analyzing
      if (autoAnalysisEnabled && !isAnalyzing && !analysisQueue.has(videoId)) {
        console.log('🤖 Starting automatic analysis for video:', videoId);
        startAutomaticAnalysis(videoId);
      }
    }
  }
  
  function extractVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }
  
  async function startAutomaticAnalysis(videoId) {
    try {
      // Add to analysis queue to prevent duplicate analysis
      analysisQueue.add(videoId);
      
      // Check if we already have cached results
      const cachedResults = await checkCachedResults(videoId);
      if (cachedResults) {
        console.log('📋 Found cached results for video:', videoId);
        currentLies = cachedResults.lies || [];
        
        chrome.runtime.sendMessage({
          type: 'liesUpdate',
          claims: currentLies,
          videoId: videoId,
          isComplete: true
        });
        
        chrome.runtime.sendMessage({
          type: 'analysisResult',
          data: `Analysis loaded from cache. Found ${currentLies.length} lies.`
        });
        
        analysisQueue.delete(videoId);
        return;
      }
      
      // Wait for transcript to be available
      console.log('⏳ Waiting for transcript to be available...');
      const transcriptAvailable = await waitForTranscript();
      
      if (!transcriptAvailable) {
        console.log('❌ No transcript available for video:', videoId);
        analysisQueue.delete(videoId);
        
        chrome.runtime.sendMessage({
          type: 'analysisResult',
          data: 'No transcript available for this video'
        });
        return;
      }
      
      console.log('✅ Transcript available, starting analysis...');
      
      // Start the analysis process
      await handleAnalyzeVideo();
      
    } catch (error) {
      console.error('❌ Automatic analysis failed:', error);
      analysisQueue.delete(videoId);
      
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: `Automatic analysis failed: ${error.message}`
      });
    }
  }
  
  async function waitForTranscript(maxWaitTime = 30000) {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkTranscript = () => {
        // Check if transcript is available
        if (isTranscriptAvailable()) {
          console.log('✅ Transcript found!');
          resolve(true);
          return;
        }
        
        // Check if we've exceeded max wait time
        if (Date.now() - startTime > maxWaitTime) {
          console.log('⏰ Transcript wait timeout');
          resolve(false);
          return;
        }
        
        // Continue checking
        setTimeout(checkTranscript, 2000);
      };
      
      // Start checking immediately
      checkTranscript();
    });
  }
  
  function isTranscriptAvailable() {
    // Check for transcript button
    const transcriptButton = findTranscriptButton();
    if (!transcriptButton) {
      return false;
    }
    
    // Check if transcript panel is already open
    if (isTranscriptPanelOpen()) {
      const segments = findTranscriptSegments();
      return segments.length > 0;
    }
    
    // Try to click transcript button to check availability
    try {
      transcriptButton.click();
      
      // Wait a moment for panel to load
      setTimeout(() => {
        const segments = findTranscriptSegments();
        const available = segments.length > 0;
        
        if (!available) {
          // Close transcript panel if no segments found
          const closeButton = document.querySelector('[aria-label*="Close transcript"]');
          if (closeButton) {
            closeButton.click();
          }
        }
        
        return available;
      }, 1000);
      
      return true; // Assume available if button exists and is clickable
    } catch (error) {
      console.log('❌ Error checking transcript availability:', error);
      return false;
    }
  }
  
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('📨 Content script received message:', message.type);
      
      try {
        if (message.type === 'ping') {
          // Respond to ping messages to confirm content script is loaded and responsive
          sendResponse({ success: true, loaded: true, timestamp: Date.now() });
          return true;
        } else if (message.type === 'analyzeVideo') {
          handleAnalyzeVideo(sendResponse);
          return true; // Keep message channel open
        } else if (message.type === 'skipLiesToggle') {
          skipLiesEnabled = message.enabled;
          console.log('⏭️ Skip lies toggled:', skipLiesEnabled);
          sendResponse({ success: true });
        } else if (message.type === 'jumpToTimestamp') {
          jumpToTimestamp(message.timestamp);
          sendResponse({ success: true });
        } else if (message.type === 'toggleAutoAnalysis') {
          autoAnalysisEnabled = message.enabled;
          console.log('🤖 Auto analysis toggled:', autoAnalysisEnabled);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: true, message: 'Message received' });
        }
      } catch (error) {
        console.error('❌ Error handling message:', error);
        sendResponse({ success: false, error: error.message });
      }
    });
  }
  
  async function handleAnalyzeVideo(sendResponse = null) {
    if (isAnalyzing) {
      const error = 'Analysis already in progress';
      if (sendResponse) sendResponse({ success: false, error });
      return;
    }
    
    const videoId = extractVideoId();
    if (!videoId) {
      const error = 'No video ID found';
      if (sendResponse) sendResponse({ success: false, error });
      return;
    }
    
    try {
      isAnalyzing = true;
      
      // Notify background that analysis is starting
      chrome.runtime.sendMessage({
        type: 'startAnalysis',
        videoId: videoId
      });
      
      // Send initial progress
      chrome.runtime.sendMessage({
        type: 'analysisProgress',
        stage: 'starting',
        message: 'Starting automatic video analysis...'
      });
      
      // CRITICAL: Check API key before proceeding with analysis
      chrome.runtime.sendMessage({
        type: 'analysisProgress',
        stage: 'validation',
        message: 'Validating API configuration...'
      });
      
      const settings = await getSettings();
      if (!settings.apiKey || settings.apiKey.trim() === '') {
        throw new Error('AI API key not configured. Please add your API key in the extension settings.');
      }
      
      // Validate API key format
      if (!validateApiKeyFormat(settings.aiProvider, settings.apiKey)) {
        throw new Error(`Invalid ${settings.aiProvider} API key format. Please check your API key in settings.`);
      }
      
      console.log('✅ API key validation passed');
      
      // Check if we have cached results first
      const cachedResults = await checkCachedResults(videoId);
      if (cachedResults) {
        console.log('📋 Using cached analysis results');
        
        currentLies = cachedResults.lies || [];
        
        chrome.runtime.sendMessage({
          type: 'liesUpdate',
          claims: currentLies,
          videoId: videoId,
          isComplete: true
        });
        
        chrome.runtime.sendMessage({
          type: 'analysisResult',
          data: `Analysis loaded from cache. Found ${currentLies.length} lies.`
        });
        
        isAnalyzing = false;
        analysisQueue.delete(videoId);
        if (sendResponse) sendResponse({ success: true, cached: true });
        return;
      }
      
      // Extract transcript with auto-generated priority
      chrome.runtime.sendMessage({
        type: 'analysisProgress',
        stage: 'transcript',
        message: 'Extracting video transcript...'
      });
      
      const transcript = await extractTranscript();
      if (!transcript) {
        throw new Error('Transcript extraction failed: All transcript extraction methods failed');
      }
      
      console.log('📝 Transcript extracted successfully, length:', transcript.length);
      
      // Get video metadata
      const videoData = await getVideoMetadata();
      
      // Start real-time analysis
      chrome.runtime.sendMessage({
        type: 'analysisProgress',
        stage: 'analysis',
        message: 'Analyzing transcript for lies in real-time...'
      });
      
      const analysisResults = await analyzeTranscriptRealTime(transcript, videoData);
      
      // Store results
      await storeAnalysisResults(videoId, videoData, analysisResults);
      
      // Update current lies
      currentLies = analysisResults.lies || [];
      
      // Send final results
      chrome.runtime.sendMessage({
        type: 'liesUpdate',
        claims: currentLies,
        videoId: videoId,
        isComplete: true
      });
      
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: `Analysis complete. Found ${currentLies.length} lies.`
      });
      
      isAnalyzing = false;
      analysisQueue.delete(videoId);
      if (sendResponse) sendResponse({ success: true, lies: currentLies });
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: `Error: ${error.message}`
      });
      
      isAnalyzing = false;
      analysisQueue.delete(videoId);
      if (sendResponse) sendResponse({ success: false, error: error.message });
    }
  }
  
  // New function for real-time analysis
  async function analyzeTranscriptRealTime(transcript, videoData) {
    const settings = await getSettings();
    const analysisDuration = settings.analysisDuration || 60;
    const minConfidenceThreshold = settings.minConfidenceThreshold || 0;
    
    // Split transcript into chunks for real-time processing
    const chunks = splitTranscriptIntoChunks(transcript, analysisDuration);
    let allLies = [];
    let processedMinutes = 0;
    
    console.log(`📊 Processing ${chunks.length} chunks for real-time analysis`);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      processedMinutes += chunk.durationMinutes;
      
      try {
        // Update progress
        chrome.runtime.sendMessage({
          type: 'analysisProgress',
          stage: 'analysis',
          message: `Analyzing minute ${processedMinutes}/${analysisDuration}...`
        });
        
        // Analyze this chunk
        const chunkResults = await analyzeTranscriptChunk(chunk, videoData, settings);
        
        if (chunkResults.lies && chunkResults.lies.length > 0) {
          // Filter by confidence threshold
          const filteredLies = chunkResults.lies.filter(claim => 
            (claim.confidence || 0) >= (minConfidenceThreshold / 100)
          );
          
          allLies = allLies.concat(filteredLies);
          
          // Send real-time update
          chrome.runtime.sendMessage({
            type: 'liesUpdate',
            claims: allLies,
            videoId: currentVideoId,
            isComplete: false,
            progress: `${processedMinutes}/${analysisDuration} minutes analyzed`
          });
          
          console.log(`📊 Found ${filteredLies.length} new lies in chunk ${i + 1}, total: ${allLies.length}`);
        }
        
        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error analyzing chunk ${i + 1}:`, error);
        // Continue with next chunk
      }
    }
    
    return {
      lies: allLies,
      totalLies: allLies.length,
      analysisDuration: analysisDuration
    };
  }
  
  function splitTranscriptIntoChunks(transcript, totalDurationMinutes) {
    const lines = transcript.split('\n').filter(line => line.trim());
    const chunksPerMinute = Math.ceil(lines.length / totalDurationMinutes);
    const chunks = [];
    
    for (let i = 0; i < totalDurationMinutes; i++) {
      const startIndex = i * chunksPerMinute;
      const endIndex = Math.min((i + 1) * chunksPerMinute, lines.length);
      const chunkLines = lines.slice(startIndex, endIndex);
      
      if (chunkLines.length > 0) {
        chunks.push({
          text: chunkLines.join('\n'),
          startMinute: i,
          endMinute: i + 1,
          durationMinutes: 1
        });
      }
    }
    
    return chunks;
  }
  
  async function analyzeTranscriptChunk(chunk, videoData, settings) {
    // Build a focused system prompt for chunk analysis
    const systemPrompt = `You are a fact-checking expert. Analyze this 1-minute segment of a YouTube transcript and identify false or misleading claims.

DETECTION CRITERIA:
- Only flag factual claims, not opinions or predictions
- Require very high confidence (${Math.max(90, settings.minConfidenceThreshold)}%+) before flagging
- Focus on clear, verifiable false claims with strong evidence
- Be specific about what makes each claim problematic
- Consider context and intent
- Err on the side of caution to avoid false positives

RESPONSE FORMAT:
Respond with a JSON object containing an array of claims. Each claim should have:
- "timestamp": The estimated timestamp in format "M:SS" (e.g., "${chunk.startMinute}:30")
- "timeInSeconds": Timestamp converted to seconds (e.g., ${chunk.startMinute * 60 + 30})
- "duration": Estimated duration of the lie in seconds (5-30, based on actual complexity)
- "claim": The specific false or misleading statement (exact quote from transcript)
- "explanation": Why this claim is problematic (1-2 sentences)
- "confidence": Your confidence level (0.0-1.0)
- "severity": "low", "medium", "high", or "critical"

Example response:
{
  "claims": [
    {
      "timestamp": "${chunk.startMinute}:23",
      "timeInSeconds": ${chunk.startMinute * 60 + 23},
      "duration": 12,
      "claim": "Vaccines contain microchips",
      "explanation": "This is a debunked conspiracy theory with no scientific evidence.",
      "confidence": 0.95,
      "severity": "critical"
    }
  ]
}

IMPORTANT: Only return the JSON object. Do not include any other text.`;
    
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: `Analyze this 1-minute segment (minute ${chunk.startMinute + 1}) of the YouTube video "${videoData.title}" by ${videoData.channelName}:\n\n${chunk.text}`
      }
    ];
    
    // Make API call
    const response = await makeAIAPICall(settings.aiProvider, settings.aiModel, messages, settings.apiKey);
    
    // Parse response
    const analysisResult = parseAIResponse(response);
    
    return {
      lies: analysisResult.claims || [],
      totalLies: (analysisResult.claims || []).length
    };
  }
  
  function validateApiKeyFormat(provider, apiKey) {
    if (!apiKey || typeof apiKey !== 'string') return false;
    
    switch (provider) {
      case 'openai':
        return apiKey.startsWith('sk-') && apiKey.length > 20;
      case 'gemini':
        return apiKey.length > 20; // Basic length check for Gemini
      case 'openrouter':
        return apiKey.startsWith('sk-or-') && apiKey.length > 20;
      default:
        return false;
    }
  }
  
  async function extractTranscript() {
    console.log('📝 Starting transcript extraction...');
    
    // Method 1: Try auto-generated transcript first (highest priority)
    try {
      console.log('🤖 Attempting auto-generated transcript extraction...');
      const autoTranscript = await extractAutoGeneratedTranscript();
      if (autoTranscript && autoTranscript.length > 100) {
        console.log('✅ Auto-generated transcript extracted successfully');
        return autoTranscript;
      }
    } catch (error) {
      console.log('⚠️ Auto-generated transcript extraction failed:', error.message);
    }
    
    // Method 2: Try manual transcript extraction
    try {
      console.log('📋 Attempting manual transcript extraction...');
      const manualTranscript = await extractManualTranscript();
      if (manualTranscript && manualTranscript.length > 100) {
        console.log('✅ Manual transcript extracted successfully');
        return manualTranscript;
      }
    } catch (error) {
      console.log('⚠️ Manual transcript extraction failed:', error.message);
    }
    
    // Method 3: Try DOM-based extraction
    try {
      console.log('🔍 Attempting DOM-based transcript extraction...');
      const domTranscript = await extractTranscriptFromDOM();
      if (domTranscript && domTranscript.length > 100) {
        console.log('✅ DOM-based transcript extracted successfully');
        return domTranscript;
      }
    } catch (error) {
      console.log('⚠️ DOM-based transcript extraction failed:', error.message);
    }
    
    throw new Error('All transcript extraction methods failed');
  }
  
  async function extractAutoGeneratedTranscript() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Auto-generated transcript extraction timeout'));
      }, 15000);
      
      try {
        // First, try to find and click the transcript button
        const transcriptButton = findTranscriptButton();
        if (!transcriptButton) {
          clearTimeout(timeout);
          reject(new Error('Transcript button not found'));
          return;
        }
        
        // Click the transcript button if not already open
        if (!isTranscriptPanelOpen()) {
          transcriptButton.click();
          console.log('🖱️ Clicked transcript button');
        }
        
        // Wait for transcript panel to load
        setTimeout(() => {
          try {
            // Look for auto-generated transcript specifically
            const autoTranscriptSegments = findAutoGeneratedTranscriptSegments();
            
            if (autoTranscriptSegments.length === 0) {
              clearTimeout(timeout);
              reject(new Error('No auto-generated transcript segments found'));
              return;
            }
            
            // Extract text with timestamps
            const transcriptText = autoTranscriptSegments.map(segment => {
              const timeElement = segment.querySelector('[data-start]') || 
                                segment.querySelector('.ytd-transcript-segment-renderer:first-child');
              const textElement = segment.querySelector('.segment-text, .ytd-transcript-segment-renderer:last-child') ||
                                segment.querySelector('div:last-child');
              
              const timestamp = timeElement ? timeElement.textContent.trim() : '';
              const text = textElement ? textElement.textContent.trim() : '';
              
              return timestamp && text ? `${timestamp} ${text}` : text;
            }).filter(line => line.length > 0).join('\n');
            
            clearTimeout(timeout);
            
            if (transcriptText.length > 100) {
              console.log('✅ Auto-generated transcript extracted:', transcriptText.length, 'characters');
              resolve(transcriptText);
            } else {
              reject(new Error('Auto-generated transcript too short'));
            }
            
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        }, 3000);
        
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  function findAutoGeneratedTranscriptSegments() {
    // Look for auto-generated transcript indicators
    const selectors = [
      // Auto-generated transcript segments
      'ytd-transcript-segment-renderer[auto-generated="true"]',
      'ytd-transcript-segment-renderer:not([manual="true"])',
      // Generic transcript segments (assume auto-generated if no manual indicator)
      'ytd-transcript-segment-renderer',
      '.transcript-segment',
      '[role="button"][data-start]'
    ];
    
    for (const selector of selectors) {
      const segments = document.querySelectorAll(selector);
      if (segments.length > 0) {
        console.log(`🎯 Found ${segments.length} auto-generated transcript segments with selector: ${selector}`);
        
        // Check if these are actually auto-generated by looking for indicators
        const autoSegments = Array.from(segments).filter(segment => {
          // Look for auto-generated indicators
          const hasAutoAttr = segment.hasAttribute('auto-generated') || 
                             segment.getAttribute('auto-generated') === 'true';
          const noManualAttr = !segment.hasAttribute('manual') || 
                              segment.getAttribute('manual') !== 'true';
          const hasAutoClass = segment.classList.contains('auto-generated') ||
                               segment.closest('.auto-generated');
          
          // If we can't determine, assume it's auto-generated (most common case)
          return hasAutoAttr || (noManualAttr && !hasAutoClass);
        });
        
        if (autoSegments.length > 0) {
          return autoSegments;
        }
        
        // If we can't determine auto vs manual, return all segments
        // (auto-generated is more common)
        return Array.from(segments);
      }
    }
    
    return [];
  }
  
  async function extractManualTranscript() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Manual transcript extraction timeout'));
      }, 15000);
      
      try {
        // Look for manual transcript segments
        const manualSegments = findManualTranscriptSegments();
        
        if (manualSegments.length === 0) {
          clearTimeout(timeout);
          reject(new Error('No manual transcript segments found'));
          return;
        }
        
        // Extract text with timestamps
        const transcriptText = manualSegments.map(segment => {
          const timeElement = segment.querySelector('[data-start]') || 
                            segment.querySelector('.ytd-transcript-segment-renderer:first-child');
          const textElement = segment.querySelector('.segment-text, .ytd-transcript-segment-renderer:last-child') ||
                            segment.querySelector('div:last-child');
          
          const timestamp = timeElement ? timeElement.textContent.trim() : '';
          const text = textElement ? textElement.textContent.trim() : '';
          
          return timestamp && text ? `${timestamp} ${text}` : text;
        }).filter(line => line.length > 0).join('\n');
        
        clearTimeout(timeout);
        
        if (transcriptText.length > 100) {
          console.log('✅ Manual transcript extracted:', transcriptText.length, 'characters');
          resolve(transcriptText);
        } else {
          reject(new Error('Manual transcript too short'));
        }
        
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  function findManualTranscriptSegments() {
    // Look for manual transcript indicators
    const selectors = [
      'ytd-transcript-segment-renderer[manual="true"]',
      'ytd-transcript-segment-renderer.manual',
      '.transcript-segment.manual'
    ];
    
    for (const selector of selectors) {
      const segments = document.querySelectorAll(selector);
      if (segments.length > 0) {
        console.log(`🎯 Found ${segments.length} manual transcript segments with selector: ${selector}`);
        return Array.from(segments);
      }
    }
    
    return [];
  }
  
  async function extractTranscriptFromDOM() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('DOM transcript extraction timeout'));
      }, 15000);
      
      try {
        // First, try to find and click the transcript button
        const transcriptButton = findTranscriptButton();
        if (!transcriptButton) {
          clearTimeout(timeout);
          reject(new Error('Transcript button not found'));
          return;
        }
        
        // Click the transcript button if not already open
        if (!isTranscriptPanelOpen()) {
          transcriptButton.click();
          console.log('🖱️ Clicked transcript button');
        }
        
        // Wait for transcript panel to load
        setTimeout(() => {
          try {
            const transcriptSegments = findTranscriptSegments();
            
            if (transcriptSegments.length === 0) {
              clearTimeout(timeout);
              reject(new Error('No transcript segments found'));
              return;
            }
            
            // Extract text with timestamps
            const transcriptText = transcriptSegments.map(segment => {
              const timeElement = segment.querySelector('[data-start]') || 
                                segment.querySelector('.ytd-transcript-segment-renderer:first-child');
              const textElement = segment.querySelector('.segment-text, .ytd-transcript-segment-renderer:last-child') ||
                                segment.querySelector('div:last-child');
              
              const timestamp = timeElement ? timeElement.textContent.trim() : '';
              const text = textElement ? textElement.textContent.trim() : '';
              
              return timestamp && text ? `${timestamp} ${text}` : text;
            }).filter(line => line.length > 0).join('\n');
            
            clearTimeout(timeout);
            
            if (transcriptText.length > 100) {
              console.log('✅ DOM transcript extracted:', transcriptText.length, 'characters');
              resolve(transcriptText);
            } else {
              reject(new Error('Transcript too short'));
            }
            
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        }, 3000);
        
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  function findTranscriptButton() {
    const selectors = [
      'button[aria-label*="transcript" i]',
      'button[aria-label*="Show transcript" i]',
      'button[title*="transcript" i]',
      '[role="button"][aria-label*="transcript" i]',
      'ytd-button-renderer:has([aria-label*="transcript" i])',
      'yt-button-shape:has([aria-label*="transcript" i])'
    ];
    
    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button) {
        console.log('🎯 Found transcript button with selector:', selector);
        return button;
      }
    }
    
    // Try to find by text content
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const button of buttons) {
      const text = button.textContent.toLowerCase();
      const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
      
      if (text.includes('transcript') || ariaLabel.includes('transcript')) {
        console.log('🎯 Found transcript button by text content');
        return button;
      }
    }
    
    return null;
  }
  
  function isTranscriptPanelOpen() {
    const panelSelectors = [
      'ytd-transcript-renderer',
      '#transcript',
      '.transcript-container',
      '[data-testid="transcript"]'
    ];
    
    return panelSelectors.some(selector => {
      const panel = document.querySelector(selector);
      return panel && panel.offsetHeight > 0;
    });
  }
  
  function findTranscriptSegments() {
    const selectors = [
      'ytd-transcript-segment-renderer',
      '.transcript-segment',
      '[role="button"][data-start]',
      '.ytd-transcript-segment-renderer'
    ];
    
    for (const selector of selectors) {
      const segments = document.querySelectorAll(selector);
      if (segments.length > 0) {
        console.log(`🎯 Found ${segments.length} transcript segments with selector: ${selector}`);
        return Array.from(segments);
      }
    }
    
    return [];
  }
  
  async function getVideoMetadata() {
    const title = document.querySelector('h1.ytd-video-primary-info-renderer, h1.title, .ytd-video-primary-info-renderer h1')?.textContent?.trim() || 'Unknown Title';
    const channelName = document.querySelector('#channel-name a, .ytd-channel-name a, ytd-channel-name a')?.textContent?.trim() || 'Unknown Channel';
    
    return {
      title,
      channelName,
      videoId: currentVideoId
    };
  }
  
  function buildSystemPrompt(analysisDuration, minConfidenceThreshold) {
    return `You are a fact-checking expert. Analyze this ${analysisDuration}-minute YouTube transcript and identify false or misleading claims.

DETECTION CRITERIA:
- Only flag factual claims, not opinions or predictions
- Require very high confidence (${Math.max(90, minConfidenceThreshold)}%+) before flagging
- Focus on clear, verifiable false claims with strong evidence
- Be specific about what makes each claim problematic
- Consider context and intent
- Err on the side of caution to avoid false positives

RESPONSE FORMAT:
Respond with a JSON object containing an array of claims. Each claim should have:
- "timestamp": The exact timestamp from the transcript (e.g., "2:34")
- "timeInSeconds": Timestamp converted to seconds (e.g., 154)
- "duration": Estimated duration of the lie in seconds (5-30, based on actual complexity)
- "claim": The specific false or misleading statement (exact quote from transcript)
- "explanation": Why this claim is problematic (1-2 sentences)
- "confidence": Your confidence level (0.0-1.0)
- "severity": "low", "medium", "high", or "critical"

Example response:
{
  "claims": [
    {
      "timestamp": "1:23",
      "timeInSeconds": 83,
      "duration": 12,
      "claim": "Vaccines contain microchips",
      "explanation": "This is a debunked conspiracy theory with no scientific evidence.",
      "confidence": 0.95,
      "severity": "critical"
    }
  ]
}

IMPORTANT: Only return the JSON object. Do not include any other text.`;
  }
  
  function limitTranscriptByDuration(transcript, durationMinutes) {
    // Simple approach: estimate based on average speaking rate
    // Average speaking rate is about 150-160 words per minute
    const wordsPerMinute = 155;
    const targetWords = durationMinutes * wordsPerMinute;
    
    const words = transcript.split(/\s+/);
    if (words.length <= targetWords) {
      return transcript;
    }
    
    return words.slice(0, targetWords).join(' ') + '...';
  }
  
  async function makeAIAPICall(provider, model, messages, apiKey) {
    let apiUrl, headers, body;
    
    if (provider === 'openai') {
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
      body = {
        model: model,
        messages: messages,
        temperature: 0.3,
        max_tokens: 4000
      };
    } else if (provider === 'gemini') {
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      headers = {
        'Content-Type': 'application/json'
      };
      body = {
        contents: messages.slice(1).map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        })),
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4000
        }
      };
    } else if (provider === 'openrouter') {
      apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lieblocker.com',
        'X-Title': 'LieBlocker'
      };
      body = {
        model: model,
        messages: messages,
        temperature: 0.3,
        max_tokens: 4000
      };
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`${provider} API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }
    
    return await response.json();
  }
  
  function parseAIResponse(response) {
    try {
      let content;
      
      // Handle OpenAI response format
      if (response.choices && response.choices[0]) {
        content = response.choices[0].message.content;
      }
      // Handle Gemini response format
      else if (response.candidates && response.candidates[0]) {
        content = response.candidates[0].content.parts[0].text;
      }
      else {
        throw new Error('Unexpected AI response format');
      }
      
      // Clean up the content (remove markdown code blocks if present)
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Handle incomplete JSON responses (common with free models)
      if (!content.endsWith('}')) {
        // Try to find the last complete claim
        const lastCompleteClaimIndex = content.lastIndexOf('}');
        if (lastCompleteClaimIndex > 0) {
          // Find the start of the claims array
          const claimsStartIndex = content.indexOf('"claims": [');
          if (claimsStartIndex > 0) {
            // Reconstruct the JSON with complete claims only
            const beforeClaims = content.substring(0, claimsStartIndex + '"claims": ['.length);
            const claimsSection = content.substring(claimsStartIndex + '"claims": ['.length, lastCompleteClaimIndex + 1);
            content = beforeClaims + claimsSection + ']}';
          }
        } else {
          // No complete claims found, return empty
          content = '{"claims": []}';
        }
      }
      
      // Parse JSON
      const parsed = JSON.parse(content);
      
      // Validate and process claims
      if (parsed.claims && Array.isArray(parsed.claims)) {
        parsed.claims = parsed.claims.map(claim => ({
          ...claim,
          timestamp_seconds: claim.timeInSeconds || parseTimestamp(claim.timestamp),
          duration_seconds: claim.duration || 10,
          claim_text: claim.claim,
          category: 'other'
        }));
      }
      
      return parsed;
    } catch (error) {
      console.error('❌ Failed to parse AI response:', error);
      console.log('Raw response:', response);
      return { claims: [] };
    }
  }
  
  function parseTimestamp(timestamp) {
    if (typeof timestamp === 'number') return timestamp;
    if (typeof timestamp !== 'string') return 0;
    
    const parts = timestamp.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }
  
  async function getSettings() {
    // First try to get from secure storage
    let secureSettings = {};
    if (securityService) {
      try {
        secureSettings = await securityService.getSecureSettings() || {};
      } catch (error) {
        console.warn('⚠️ Could not load secure settings:', error);
      }
    }
    
    // Get regular settings from Chrome storage
    const result = await new Promise((resolve) => {
      chrome.storage.local.get([
        'aiProvider',
        'openaiModel',
        'geminiModel',
        'openrouterModel',
        'apiKey', // Fallback for existing users
        'analysisDuration',
        'minConfidenceThreshold'
      ], resolve);
    });
    
    // Merge with priority to secure storage
    const settings = {
      aiProvider: result.aiProvider || 'openai',
      apiKey: secureSettings.apiKey || result.apiKey || '',
      analysisDuration: result.analysisDuration || 60,
      minConfidenceThreshold: result.minConfidenceThreshold || 0
    };
    
    // Set the correct model based on provider
    if (settings.aiProvider === 'openai') {
      settings.aiModel = result.openaiModel || 'gpt-4o-mini';
    } else if (settings.aiProvider === 'gemini') {
      settings.aiModel = result.geminiModel || 'gemini-2.0-flash-exp';
    } else if (settings.aiProvider === 'openrouter') {
      settings.aiModel = result.openrouterModel || 'meta-llama/llama-4-maverick-17b-128e-instruct:free';
    }
    
    return settings;
  }
  
  async function checkCachedResults(videoId) {
    try {
      // Check Supabase first
      if (window.SupabaseDB) {
        const stats = await window.SupabaseDB.getVideoStats(videoId);
        if (stats && stats.lies && stats.lies.length > 0) {
          return {
            lies: stats.lies.map(lie => ({
              timestamp_seconds: lie.timestamp_seconds,
              duration_seconds: lie.duration_seconds,
              claim_text: lie.claim_text,
              explanation: lie.explanation,
              confidence: lie.confidence,
              severity: lie.severity,
              category: lie.category
            }))
          };
        }
      }
      
      // Fallback to local storage
      const result = await new Promise(resolve => {
        chrome.storage.local.get([`analysis_${videoId}`], resolve);
      });
      
      return result[`analysis_${videoId}`] || null;
    } catch (error) {
      console.error('❌ Error checking cached results:', error);
      return null;
    }
  }
  
  async function storeAnalysisResults(videoId, videoData, analysisResults) {
    try {
      // Store in Supabase if available
      if (window.SupabaseDB) {
        const analysisData = {
          video_id: videoId,
          video_title: videoData.title,
          channel_name: videoData.channelName,
          total_lies: analysisResults.totalLies,
          analysis_duration_minutes: analysisResults.analysisDuration
        };
        
        await window.SupabaseDB.storeVideoAnalysis(analysisData);
        
        if (analysisResults.lies && analysisResults.lies.length > 0) {
          const liesData = analysisResults.lies.map(lie => ({
            video_id: videoId,
            timestamp_seconds: lie.timestamp_seconds,
            duration_seconds: lie.duration_seconds,
            claim_text: lie.claim_text,
            explanation: lie.explanation,
            confidence: lie.confidence,
            severity: lie.severity,
            category: lie.category
          }));
          
          await window.SupabaseDB.storeLies(liesData);
        }
      }
      
      // Also store locally as backup
      const cacheData = {
        lies: analysisResults.lies,
        timestamp: Date.now(),
        videoData: videoData
      };
      
      chrome.storage.local.set({
        [`analysis_${videoId}`]: cacheData
      });
      
    } catch (error) {
      console.error('❌ Error storing analysis results:', error);
      // Continue anyway - don't fail the analysis
    }
  }
  
  async function loadCurrentVideoLies(videoId) {
    try {
      // First try to get from background script
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'getCurrentVideoLies',
          videoId: videoId
        }, resolve);
      });
      
      if (response && response.success && response.lies) {
        currentLies = response.lies;
        console.log('📋 Loaded current video lies:', currentLies.length);
        return;
      }
      
      // Fallback to checking cached results
      const cachedResults = await checkCachedResults(videoId);
      if (cachedResults && cachedResults.lies) {
        currentLies = cachedResults.lies;
        console.log('📋 Loaded lies from cache:', currentLies.length);
      }
      
    } catch (error) {
      console.error('❌ Error loading current video lies:', error);
    }
  }
  
  async function loadSkipLiesSetting() {
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['skipLiesEnabled'], resolve);
    });
    
    skipLiesEnabled = result.skipLiesEnabled || false;
    console.log('⏭️ Skip lies setting loaded:', skipLiesEnabled);
  }
  
  function jumpToTimestamp(timestamp) {
    if (!videoPlayer) {
      videoPlayer = document.querySelector('video');
    }
    
    if (videoPlayer) {
      videoPlayer.currentTime = timestamp;
      console.log('⏭️ Jumped to timestamp:', timestamp);
    }
  }
  
  // Auto-skip functionality
  function setupAutoSkip() {
    if (!videoPlayer || !skipLiesEnabled || currentLies.length === 0) {
      return;
    }
    
    const checkSkip = () => {
      if (!skipLiesEnabled) return;
      
      const currentTime = videoPlayer.currentTime;
      
      for (const lie of currentLies) {
        const startTime = lie.timestamp_seconds;
        const endTime = startTime + (lie.duration_seconds || 10);
        
        if (currentTime >= startTime && currentTime < endTime) {
          // Skip this lie
          videoPlayer.currentTime = endTime;
          
          // Show skip notification
          showSkipNotification(lie);
          
          // Track skip for statistics
          chrome.runtime.sendMessage({
            type: 'lieSkipped',
            videoId: currentVideoId,
            timestamp: startTime,
            duration: lie.duration_seconds || 10,
            claim: lie.claim_text
          });
          
          break;
        }
      }
    };
    
    // Check every 500ms when video is playing
    const skipInterval = setInterval(() => {
      if (videoPlayer && !videoPlayer.paused) {
        checkSkip();
      }
    }, 500);
    
    // Clean up interval when video changes
    const cleanup = () => {
      clearInterval(skipInterval);
    };
    
    // Store cleanup function for later use
    window.cleanupAutoSkip = cleanup;
  }
  
  function showSkipNotification(lie) {
    // Clear any existing notification
    if (skipNotificationTimeout) {
      clearTimeout(skipNotificationTimeout);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4285f4;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      max-width: 300px;
      animation: slideIn 0.3s ease;
    `;
    
    notification.innerHTML = `
      <div style="margin-bottom: 4px;">🚨 Lie Skipped</div>
      <div style="font-size: 12px; opacity: 0.9;">${lie.claim_text.substring(0, 100)}${lie.claim_text.length > 100 ? '...' : ''}</div>
    `;
    
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    skipNotificationTimeout = setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, 3000);
  }
  
  // Set up auto-skip when lies are loaded
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'liesUpdate' && message.videoId === currentVideoId) {
      currentLies = message.claims || [];
      if (skipLiesEnabled) {
        setupAutoSkip();
      }
    }
  });
  
  // Add CSS for animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
})();