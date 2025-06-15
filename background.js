// Background script for handling API calls and message forwarding
// This runs in a service worker context with different CORS permissions

// Enhanced analysis state with persistent storage
let analysisState = {
  isRunning: false,
  videoId: null,
  progress: '',
  results: '',
  error: null,
  currentClaims: [],
  startTime: null,
  stage: 'idle'
};

// NEW: Persistent lies storage for current video
let currentVideoLies = [];
let currentVideoId = null;

// Persistent state management
async function saveAnalysisState() {
  try {
    await chrome.storage.local.set({ 
      backgroundAnalysisState: {
        ...analysisState,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    console.error('Error saving analysis state:', error);
  }
}

// NEW: Save current video lies persistently
async function saveCurrentVideoLies(videoId, lies) {
  try {
    await chrome.storage.local.set({
      [`currentVideoLies_${videoId}`]: {
        lies: lies,
        timestamp: Date.now(),
        videoId: videoId
      }
    });
    console.log('💾 Saved current video lies to storage:', lies.length);
  } catch (error) {
    console.error('Error saving current video lies:', error);
  }
}

// NEW: Load current video lies from storage
async function loadCurrentVideoLies(videoId) {
  try {
    const result = await chrome.storage.local.get([`currentVideoLies_${videoId}`]);
    const stored = result[`currentVideoLies_${videoId}`];
    
    if (stored && stored.lies) {
      // Check if data is recent (within 24 hours)
      const dataAge = Date.now() - (stored.timestamp || 0);
      if (dataAge < 24 * 60 * 60 * 1000) {
        console.log('📋 Loaded current video lies from storage:', stored.lies.length);
        return stored.lies;
      } else {
        // Clean up old data
        await chrome.storage.local.remove([`currentVideoLies_${videoId}`]);
      }
    }
    
    return [];
  } catch (error) {
    console.error('Error loading current video lies:', error);
    return [];
  }
}

async function loadAnalysisState() {
  try {
    const result = await chrome.storage.local.get(['backgroundAnalysisState']);
    if (result.backgroundAnalysisState) {
      const savedState = result.backgroundAnalysisState;
      
      // Check if state is recent (within 1 hour)
      const stateAge = Date.now() - (savedState.timestamp || 0);
      if (stateAge < 3600000) { // 1 hour
        analysisState = { ...savedState };
        console.log('📋 Restored analysis state from storage');
        return true;
      } else {
        // Clear old state
        await chrome.storage.local.remove(['backgroundAnalysisState']);
      }
    }
  } catch (error) {
    console.error('Error loading analysis state:', error);
  }
  return false;
}

// Initialize background script
chrome.runtime.onStartup.addListener(async () => {
  await loadAnalysisState();
});

chrome.runtime.onInstalled.addListener(async () => {
  await loadAnalysisState();
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'analysisResult') {
    // Store the analysis results in background state
    analysisState.progress = message.data;
    if (message.data.includes('Analysis complete') || 
        message.data.includes('loaded from cache') ||
        message.data.includes('Error')) {
      analysisState.isRunning = false;
      analysisState.results = message.data;
      analysisState.stage = 'complete';
      if (message.data.includes('Error')) {
        analysisState.error = message.data;
        analysisState.stage = 'error';
      }
    }
    
    // Save state persistently
    saveAnalysisState();
    
    // Forward analysis results to popup (if it's open)
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      // Popup might be closed, that's okay - we're storing the state
      console.log('Popup closed, storing analysis state in background');
    }
  } else if (message.type === 'analysisProgress') {
    // Handle progress updates with visual cues
    analysisState.stage = message.stage;
    analysisState.progress = message.message;
    
    // Save state persistently
    saveAnalysisState();
    
    // Forward to popup
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.log('Popup closed, storing progress update in background');
    }
  } else if (message.type === 'liesUpdate') {
    // Handle real-time lies updates
    analysisState.currentClaims = message.claims || [];
    
    // NEW: Store lies persistently for current video
    if (message.videoId) {
      currentVideoId = message.videoId;
      currentVideoLies = message.claims || [];
      saveCurrentVideoLies(message.videoId, currentVideoLies);
    }
    
    if (message.isComplete) {
      analysisState.isRunning = false;
      analysisState.stage = 'complete';
    }
    
    // Save state persistently
    saveAnalysisState();
    
    // Forward to popup
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.log('Popup closed, storing lies update in background');
    }
  } else if (message.type === 'getTranscript') {
    // Handle transcript extraction in background script
    handleTranscriptRequest(message.data)
      .then(result => {
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  } else if (message.type === 'startAnalysis') {
    // Track analysis start
    analysisState.isRunning = true;
    analysisState.videoId = message.videoId;
    analysisState.progress = 'Starting full video analysis...';
    analysisState.results = '';
    analysisState.error = null;
    analysisState.currentClaims = [];
    analysisState.startTime = Date.now();
    analysisState.stage = 'starting';
    
    // NEW: Set current video context
    currentVideoId = message.videoId;
    currentVideoLies = [];
    
    // Save state persistently
    saveAnalysisState();
    
    sendResponse({ success: true });
    return true;
  } else if (message.type === 'getAnalysisState') {
    // Popup requesting current analysis state
    sendResponse(analysisState);
    return true;
  } else if (message.type === 'getCurrentVideoLies') {
    // NEW: Popup requesting current video lies
    const videoId = message.videoId;
    if (videoId) {
      loadCurrentVideoLies(videoId).then(lies => {
        sendResponse({ 
          success: true, 
          lies: lies,
          videoId: videoId 
        });
      });
    } else {
      sendResponse({ 
        success: false, 
        lies: [],
        error: 'No video ID provided' 
      });
    }
    return true;
  } else if (message.type === 'clearAnalysisState') {
    // Clear the stored state
    analysisState = {
      isRunning: false,
      videoId: null,
      progress: '',
      results: '',
      error: null,
      currentClaims: [],
      startTime: null,
      stage: 'idle'
    };
    
    // NEW: Clear current video lies
    currentVideoLies = [];
    currentVideoId = null;
    
    // Clear persistent storage
    chrome.storage.local.remove(['backgroundAnalysisState']);
    
    // Clear all current video lies data
    chrome.storage.local.get(null).then(allData => {
      const keysToRemove = Object.keys(allData).filter(key => key.startsWith('currentVideoLies_'));
      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove);
      }
    });
    
    sendResponse({ success: true });
    return true;
  } else if (message.type === 'cacheUpdated') {
    // Handle cache updates
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.log('Popup closed, cache update stored in background');
    }
  } else if (message.type === 'lieSkipped') {
    // NEW: Handle lie skip tracking for accurate time saved calculation
    console.log('⏭️ Background: Lie skipped:', message);
    
    // Forward to popup for stats update
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.log('Popup closed, lie skip stored in background');
    }
  }
  
  // Must return true if response is async
  return true;
});

// Enhanced function to extract transcript using multiple providers with DOM as default
async function handleTranscriptRequest(requestData) {
  const { videoId, currentUrl } = requestData;
  
  try {
    console.log('🎬 Background: Extracting transcript for video:', videoId);
    console.log('🌐 Background: URL being processed:', currentUrl);
    
    // Get transcript provider setting (default to 'dom')
    const settings = await chrome.storage.sync.get(['transcriptProvider']);
    const provider = settings.transcriptProvider || 'dom';
    
    console.log('📡 Background: Using transcript provider:', provider);
    
    if (provider === 'dom') {
      return await extractTranscriptFromDOM(videoId, currentUrl);
    } else if (provider === 'alternative') {
      return await extractTranscriptFromAlternativeAPI(videoId, currentUrl);
    } else if (provider === 'supadata') {
      return await extractTranscriptFromSupadata(videoId, currentUrl);
    } else {
      // Default fallback to DOM
      return await extractTranscriptFromDOM(videoId, currentUrl);
    }

  } catch (error) {
    console.error('❌ Background: Error extracting transcript:', error);
    
    // Try fallback methods if primary method fails
    console.log('🔄 Background: Trying fallback transcript methods...');
    
    try {
      // Try DOM first as it's most reliable
      if (provider !== 'dom') {
        console.log('🔄 Background: Fallback to DOM extraction...');
        return await extractTranscriptFromDOM(videoId, currentUrl);
      }
      
      // Then try alternative API
      if (provider !== 'alternative') {
        console.log('🔄 Background: Fallback to alternative API...');
        return await extractTranscriptFromAlternativeAPI(videoId, currentUrl);
      }
      
      // Finally try Supadata
      if (provider !== 'supadata') {
        console.log('🔄 Background: Fallback to Supadata API...');
        return await extractTranscriptFromSupadata(videoId, currentUrl);
      }
      
    } catch (fallbackError) {
      console.error('❌ Background: All transcript methods failed:', fallbackError);
      throw new Error('All transcript extraction methods failed. Please ensure the video has captions available.');
    }
    
    throw error;
  }
}

// NEW: Extract transcript from DOM (default method)
async function extractTranscriptFromDOM(videoId, currentUrl) {
  console.log('📋 Background: Extracting transcript from DOM...');
  
  // Send message to content script to extract transcript from DOM
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error('No active tab found');
  }
  
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, {
      type: 'extractDOMTranscript'
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      if (!response || !response.success) {
        reject(new Error(response?.error || 'Failed to extract DOM transcript'));
        return;
      }
      
      console.log('✅ Background: DOM transcript extracted successfully');
      resolve(response.data);
    });
  });
}

// NEW: Extract transcript from alternative YouTube transcript API
async function extractTranscriptFromAlternativeAPI(videoId, currentUrl) {
  console.log('📋 Background: Extracting transcript from alternative API...');
  
  const apiUrl = `https://youtube-transcript-api-4c8m.onrender.com/transcript?video_id=${videoId}`;
  
  console.log('📡 Background: Making request to alternative API:', apiUrl);
  
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  console.log('📡 Background: Alternative API response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Background: Alternative API Error Response:', errorText);
    throw new Error(`Alternative API error! status: ${response.status}, message: ${errorText}`);
  }

  const result = await response.json();
  console.log('📋 Background: Alternative API response received');
  
  // Transform alternative API format to our expected format
  if (!result || !Array.isArray(result)) {
    console.error('❌ Background: Invalid response structure from alternative API:', result);
    throw new Error('No transcript content found in alternative API response');
  }
  
  // Alternative API format: [{ text, start, duration }]
  const transcript = result.map(segment => ({
    text: segment.text,
    start: segment.start, // Already in seconds
    duration: segment.duration || 5 // Default duration if not provided
  }));
  
  console.log('✅ Background: Successfully processed alternative API transcript');
  console.log(`✅ Background: ${transcript.length} transcript segments processed`);
  
  return transcript;
}

// Extract transcript from Supadata API (existing method)
async function extractTranscriptFromSupadata(videoId, currentUrl) {
  console.log('📋 Background: Extracting transcript from Supadata API...');
  
  // Get Supadata token from storage
  const tokenResult = await chrome.storage.local.get(['supadataToken']);
  const supadataToken = tokenResult.supadataToken;
  
  if (!supadataToken) {
    throw new Error('Supadata API token not configured. Please set your token in the extension settings.');
  }
  
  // Build the API URL with query parameters and force English language
  const apiUrl = new URL('https://api.supadata.ai/v1/youtube/transcript');
  apiUrl.searchParams.append('url', currentUrl);
  apiUrl.searchParams.append('lang', 'en'); // Force English language
  
  console.log('📡 Background: Making GET request to:', apiUrl.toString());
  console.log('🇺🇸 Background: Forcing English language transcript');
  
  const response = await fetch(apiUrl.toString(), {
    method: 'GET',
    headers: {
      'x-api-key': supadataToken,
      'Content-Type': 'application/json'
    }
  });

  console.log('📡 Background: Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Background: API Error Response:', errorText);
    
    // If English transcript is not available, try without language parameter as fallback
    if (response.status === 404 || errorText.includes('language') || errorText.includes('transcript')) {
      console.log('🔄 Background: English transcript not available, trying auto-detect...');
      
      // Retry without language parameter
      const fallbackUrl = new URL('https://api.supadata.ai/v1/youtube/transcript');
      fallbackUrl.searchParams.append('url', currentUrl);
      
      const fallbackResponse = await fetch(fallbackUrl.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': supadataToken,
          'Content-Type': 'application/json'
        }
      });
      
      if (!fallbackResponse.ok) {
        const fallbackErrorText = await fallbackResponse.text();
        throw new Error(`No transcript available. Status: ${fallbackResponse.status}, message: ${fallbackErrorText}`);
      }
      
      const fallbackResult = await fallbackResponse.json();
      console.log('📋 Background: Fallback transcript received');
      console.log('📋 Background: Language:', fallbackResult.lang);
      
      // Check if the fallback transcript is in English
      if (fallbackResult.lang && fallbackResult.lang.toLowerCase() !== 'en') {
        console.warn('⚠️ Background: Video transcript is not in English. Language detected:', fallbackResult.lang);
        console.warn('⚠️ Background: Proceeding with non-English transcript - results may be less accurate');
      }
      
      return processSupadataTranscriptResponse(fallbackResult);
    }
    
    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
  }

  const result = await response.json();
  console.log('📋 Background: English transcript API Response received');
  console.log('📋 Background: Language:', result.lang);
  console.log('📋 Background: Available languages:', result.availableLangs);
  
  // Verify we got English transcript
  if (result.lang && result.lang.toLowerCase() !== 'en') {
    console.warn('⚠️ Background: Expected English but got:', result.lang);
    console.warn('⚠️ Background: Proceeding anyway - results may be less accurate');
  } else {
    console.log('✅ Background: Confirmed English transcript received');
  }
  
  return processSupadataTranscriptResponse(result);
}

// Helper function to process Supadata transcript response
function processSupadataTranscriptResponse(result) {
  // Extract transcript from the 'content' array in Supadata response
  if (!result.content || !Array.isArray(result.content)) {
    console.error('❌ Background: Invalid response structure - no content array:', result);
    throw new Error('No transcript content found in Supadata API response');
  }
  
  // Transform Supadata format to our expected format
  // Supadata uses: { text, offset (ms), duration (ms), lang }
  // We need: { text, start (seconds) }
  const transcript = result.content.map(segment => ({
    text: segment.text,
    start: segment.offset / 1000, // Convert milliseconds to seconds
    duration: segment.duration / 1000 // Convert milliseconds to seconds (for reference)
  }));
  
  console.log('✅ Background: Successfully processed Supadata transcript');
  console.log(`✅ Background: ${transcript.length} transcript segments processed`);
  console.log('📋 Background: Sample transformed segment:', transcript[0]);
  
  // Log language information for debugging
  if (result.lang) {
    console.log(`🌐 Background: Final transcript language: ${result.lang}`);
    if (result.lang.toLowerCase() !== 'en') {
      console.warn('⚠️ Background: WARNING - Transcript is not in English, lie detection accuracy may be reduced');
    }
  }
  
  return transcript;
}

// Enhanced notification system for analysis completion
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'analysisResult' && 
      (message.data.includes('Analysis complete') || message.data.includes('loaded from cache'))) {
    
    // Create notification to let user know analysis is done
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiMzNGE4NTMiLz4KPHN2ZyB4PSIxMiIgeT0iMTIiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIj4KPHA+dGggZD0iTTkgMTJsMyAzIDYtNiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPC9zdmc+Cjwvc3ZnPgo=',
      title: 'LieBlocker Analysis Complete',
      message: `Video fact-checking finished. Found ${analysisState.currentClaims.length} lies.`
    });
  }
});

// Notification for real-time lies discovery
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'liesUpdate' && !message.isComplete && message.claims && message.claims.length > 0) {
    const highSeverityLies = message.claims.filter(c => c.severity === 'critical').length;
    
    if (highSeverityLies > 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KP2NpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiNkYzM1NDUiLz4KPHN2ZyB4PSIxMiIgeT0iMTIiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIj4KPHA+dGggZD0iTTEyIDl2NGwtMyAzaDZ6IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4KPC9zdmc+Cg==',
        title: 'Lies Detected!',
        message: `Found ${highSeverityLies} lies in video analysis. Check the extension for details.`
      });
    }
  }
});

// Periodic cleanup of old analysis states and video lies data
setInterval(async () => {
  try {
    const allData = await chrome.storage.local.get(null);
    
    // Clean up old analysis states
    if (allData.backgroundAnalysisState) {
      const stateAge = Date.now() - (allData.backgroundAnalysisState.timestamp || 0);
      
      // Clean up states older than 2 hours
      if (stateAge > 7200000) {
        await chrome.storage.local.remove(['backgroundAnalysisState']);
        console.log('🧹 Cleaned up old analysis state');
      }
    }
    
    // Clean up old video lies data (older than 24 hours)
    const videoLiesKeys = Object.keys(allData).filter(key => key.startsWith('currentVideoLies_'));
    const keysToRemove = [];
    
    for (const key of videoLiesKeys) {
      const data = allData[key];
      if (data && data.timestamp) {
        const dataAge = Date.now() - data.timestamp;
        if (dataAge > 24 * 60 * 60 * 1000) { // 24 hours
          keysToRemove.push(key);
        }
      }
    }
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log('🧹 Cleaned up old video lies data:', keysToRemove.length);
    }
    
  } catch (error) {
    console.error('Error during periodic cleanup:', error);
  }
}, 600000); // Run every 10 minutes