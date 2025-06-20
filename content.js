// Enhanced YouTube transcript extraction with auto-generated transcript priority
// This content script runs on YouTube pages and handles video analysis

(function() {
  'use strict';
  
  console.log('🚀 LieBlocker content script loaded');
  
  // Global state
  let currentVideoId = null;
  let isAnalyzing = false;
  let skipLiesEnabled = false;
  let currentLies = [];
  let videoPlayer = null;
  let skipNotificationTimeout = null;
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
  function initialize() {
    console.log('🎬 Initializing LieBlocker on YouTube');
    
    // Set up video change detection
    setupVideoChangeDetection();
    
    // Set up message listener
    setupMessageListener();
    
    // Load skip lies setting
    loadSkipLiesSetting();
    
    // Initial video detection
    detectVideoChange();
  }
  
  function setupVideoChangeDetection() {
    // Watch for URL changes (YouTube is a SPA)
    let lastUrl = location.href;
    
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(detectVideoChange, 1000); // Delay to ensure page is loaded
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Also listen for popstate events
    window.addEventListener('popstate', () => {
      setTimeout(detectVideoChange, 1000);
    });
  }
  
  function detectVideoChange() {
    const videoId = extractVideoId();
    
    if (videoId && videoId !== currentVideoId) {
      console.log('📹 New video detected:', videoId);
      currentVideoId = videoId;
      currentLies = [];
      
      // Get video player reference
      videoPlayer = document.querySelector('video');
      
      // Load lies for this video from background storage
      loadCurrentVideoLies(videoId);
    }
  }
  
  function extractVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }
  
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('📨 Content script received message:', message.type);
      
      if (message.type === 'analyzeVideo') {
        handleAnalyzeVideo(sendResponse);
        return true; // Keep message channel open
      } else if (message.type === 'skipLiesToggle') {
        skipLiesEnabled = message.enabled;
        console.log('⏭️ Skip lies toggled:', skipLiesEnabled);
        sendResponse({ success: true });
      } else if (message.type === 'jumpToTimestamp') {
        jumpToTimestamp(message.timestamp);
        sendResponse({ success: true });
      }
    });
  }
  
  async function handleAnalyzeVideo(sendResponse) {
    if (isAnalyzing) {
      sendResponse({ success: false, error: 'Analysis already in progress' });
      return;
    }
    
    const videoId = extractVideoId();
    if (!videoId) {
      sendResponse({ success: false, error: 'No video ID found' });
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
        message: 'Starting video analysis...'
      });
      
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
        sendResponse({ success: true, cached: true });
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
      
      // Analyze transcript with AI
      chrome.runtime.sendMessage({
        type: 'analysisProgress',
        stage: 'analysis',
        message: 'Analyzing transcript for lies...'
      });
      
      const analysisResults = await analyzeTranscriptWithAI(transcript, videoData);
      
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
      sendResponse({ success: true, lies: currentLies });
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: `Error: ${error.message}`
      });
      
      isAnalyzing = false;
      sendResponse({ success: false, error: error.message });
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
  
  async function analyzeTranscriptWithAI(transcript, videoData) {
    // Get settings from storage
    const settings = await getSettings();
    
    if (!settings.apiKey) {
      throw new Error('AI API key not configured');
    }
    
    const analysisDuration = settings.analysisDuration || 20;
    
    // Build the system prompt
    const systemPrompt = buildSystemPrompt(analysisDuration);
    
    // Prepare the transcript for analysis (limit to analysis duration)
    const limitedTranscript = limitTranscriptByDuration(transcript, analysisDuration);
    
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: `Analyze this ${analysisDuration}-minute YouTube transcript for false or misleading claims:\n\n${limitedTranscript}`
      }
    ];
    
    // Make API call
    const response = await makeAIAPICall(settings.aiProvider, settings.aiModel, messages, settings.apiKey);
    
    // Parse response
    const analysisResult = parseAIResponse(response);
    
    return {
      lies: analysisResult.claims || [],
      totalLies: (analysisResult.claims || []).length,
      analysisDuration: analysisDuration
    };
  }
  
  function buildSystemPrompt(analysisDuration) {
    return `You are a fact-checking expert. Analyze this ${analysisDuration}-minute YouTube transcript and identify false or misleading claims.

DETECTION CRITERIA:
- Only flag factual claims, not opinions or predictions
- Require very high confidence (90%+) before flagging
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
    const apiUrl = provider === 'openai' 
      ? 'https://api.openai.com/v1/chat/completions'
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const headers = provider === 'openai'
      ? {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      : {
          'Content-Type': 'application/json'
        };
    
    const body = provider === 'openai'
      ? {
          model: model,
          messages: messages,
          temperature: 0.3,
          max_tokens: 4000
        }
      : {
          contents: messages.slice(1).map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          })),
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4000
          }
        };
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`AI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
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
    return new Promise((resolve) => {
      chrome.storage.local.get([
        'aiProvider',
        'aiModel',
        'apiKey',
        'analysisDuration'
      ], (result) => {
        resolve({
          aiProvider: result.aiProvider || 'openai',
          aiModel: result.aiModel || 'gpt-4o-mini',
          apiKey: result.apiKey || '',
          analysisDuration: result.analysisDuration || 20
        });
      });
    });
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