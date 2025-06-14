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
    
    // Save state persistently
    saveAnalysisState();
    
    sendResponse({ success: true });
    return true;
  } else if (message.type === 'getAnalysisState') {
    // Popup requesting current analysis state
    sendResponse(analysisState);
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
    
    // Clear persistent storage
    chrome.storage.local.remove(['backgroundAnalysisState']);
    
    sendResponse({ success: true });
    return true;
  } else if (message.type === 'cacheUpdated') {
    // Handle cache updates
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.log('Popup closed, cache update stored in background');
    }
  } else if (message.type === 'checkSupabaseConnection') {
    // Check Supabase connection
    checkSupabaseConnection()
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        sendResponse({ connected: false, error: error.message });
      });
    return true;
  } else if (message.type === 'getSupabaseTranscript') {
    // Get transcript using Supabase Edge Function
    getSupabaseTranscript(message.data)
      .then(result => {
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  // Must return true if response is async
  return true;
});

// Enhanced function to extract transcript with Supabase fallback
async function handleTranscriptRequest(requestData) {
  const { videoId, currentUrl } = requestData;
  
  try {
    console.log('🎬 Background: Extracting transcript for video:', videoId);
    console.log('🌐 Background: URL being processed:', currentUrl);
    
    // First try Supabase Edge Function
    try {
      const supabaseResult = await getSupabaseTranscript({ videoId, currentUrl });
      console.log('✅ Background: Successfully got transcript from Supabase');
      return supabaseResult;
    } catch (supabaseError) {
      console.log('⚠️ Background: Supabase failed, falling back to Supadata:', supabaseError.message);
      
      // Fallback to original Supadata API
      return await getSupadataTranscript({ videoId, currentUrl });
    }

  } catch (error) {
    console.error('❌ Background: Error extracting transcript:', error);
    throw error;
  }
}

// Function to get transcript using Supabase Edge Function
async function getSupabaseTranscript(requestData) {
  const { videoId, currentUrl } = requestData;
  
  try {
    // Get Supabase credentials from storage
    const settings = await chrome.storage.sync.get(['supabaseUrl', 'supabaseAnonKey']);
    const { supabaseUrl, supabaseAnonKey } = settings;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase credentials not configured. Please set them in extension settings.');
    }
    
    console.log('📡 Background: Using Supabase Edge Function for transcript');
    
    // Call the youtube-transcript Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/youtube-transcript`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: currentUrl,
        lang: 'en' // Force English language
      })
    });

    console.log('📡 Background: Supabase response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Background: Supabase API Error Response:', errorText);
      throw new Error(`Supabase Edge Function error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('📋 Background: Supabase transcript received');
    
    return processSupabaseTranscriptResponse(result);

  } catch (error) {
    console.error('❌ Background: Error with Supabase transcript:', error);
    throw error;
  }
}

// Function to get transcript using original Supadata API (fallback)
async function getSupadataTranscript(requestData) {
  const { videoId, currentUrl } = requestData;
  
  try {
    console.log('📡 Background: Falling back to Supadata API');
    
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
    
    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': supadataToken,
        'Content-Type': 'application/json'
      }
    });

    console.log('📡 Background: Supadata response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Background: Supadata API Error Response:', errorText);
      
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
        
        return processSupadataTranscriptResponse(fallbackResult);
      }
      
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const result = await response.json();
    console.log('📋 Background: Supadata transcript received');
    
    return processSupadataTranscriptResponse(result);

  } catch (error) {
    console.error('❌ Background: Error with Supadata transcript:', error);
    throw error;
  }
}

// Helper function to process Supabase transcript response
function processSupabaseTranscriptResponse(result) {
  // Process Supabase Edge Function response format
  if (!result.transcript || !Array.isArray(result.transcript)) {
    console.error('❌ Background: Invalid Supabase response structure:', result);
    throw new Error('No transcript content found in Supabase response');
  }
  
  // Transform Supabase format to our expected format
  const transcript = result.transcript.map(segment => ({
    text: segment.text,
    start: segment.start, // Already in seconds
    duration: segment.duration || 0
  }));
  
  console.log('✅ Background: Successfully processed Supabase transcript');
  console.log(`✅ Background: ${transcript.length} transcript segments processed`);
  
  return transcript;
}

// Helper function to process Supadata transcript response
function processSupadataTranscriptResponse(result) {
  // Extract transcript from the 'content' array in Supadata response
  if (!result.content || !Array.isArray(result.content)) {
    console.error('❌ Background: Invalid Supadata response structure:', result);
    throw new Error('No transcript content found in Supadata API response');
  }
  
  // Transform Supadata format to our expected format
  const transcript = result.content.map(segment => ({
    text: segment.text,
    start: segment.offset / 1000, // Convert milliseconds to seconds
    duration: segment.duration / 1000 // Convert milliseconds to seconds
  }));
  
  console.log('✅ Background: Successfully processed Supadata transcript');
  console.log(`✅ Background: ${transcript.length} transcript segments processed`);
  
  return transcript;
}

// Function to check Supabase connection
async function checkSupabaseConnection() {
  try {
    const settings = await chrome.storage.sync.get(['supabaseUrl', 'supabaseAnonKey']);
    const { supabaseUrl, supabaseAnonKey } = settings;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return { connected: false, error: 'Supabase credentials not configured' };
    }
    
    // Test connection by calling a simple Edge Function or REST endpoint
    const response = await fetch(`${supabaseUrl}/functions/v1/health-check`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      return { connected: true, message: 'Supabase connection successful' };
    } else {
      return { connected: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return { connected: false, error: error.message };
  }
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

// Periodic cleanup of old analysis states
setInterval(async () => {
  try {
    const result = await chrome.storage.local.get(['backgroundAnalysisState']);
    if (result.backgroundAnalysisState) {
      const stateAge = Date.now() - (result.backgroundAnalysisState.timestamp || 0);
      
      // Clean up states older than 2 hours
      if (stateAge > 7200000) {
        await chrome.storage.local.remove(['backgroundAnalysisState']);
        console.log('🧹 Cleaned up old analysis state');
      }
    }
  } catch (error) {
    console.error('Error during periodic cleanup:', error);
  }
}, 600000); // Run every 10 minutes