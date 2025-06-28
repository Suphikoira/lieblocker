// Background script for handling API calls and message forwarding
// This runs in a service worker context with different CORS permissions

// Helper function to safely send messages to popup
async function safelySendMessageToPopup(message) {
  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Message timeout')), 5000);
    });
    
    const sendPromise = chrome.runtime.sendMessage(message);
    
    await Promise.race([sendPromise, timeoutPromise]);
  } catch (error) {
    // Popup is closed or not available - this is expected behavior
    console.log('Popup not available or timed out, message stored in background state:', error.message);
  }
}

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

// Initialize session stats on browser startup
async function initializeSessionStats() {
  try {
    // Reset session stats on browser startup/extension reload
    const sessionStats = {
      videosAnalyzed: 0,
      liesDetected: 0,
      timeSaved: 0
    };
    
    await chrome.storage.local.set({ sessionStats });
    console.log('📊 Session stats initialized on startup');
  } catch (error) {
    console.error('Error initializing session stats:', error);
  }
}

// Initialize background script
chrome.runtime.onStartup.addListener(async () => {
  await loadAnalysisState();
  await initializeSessionStats();
});

chrome.runtime.onInstalled.addListener(async () => {
  await loadAnalysisState();
  await initializeSessionStats();
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === 'analysisResult') {
    // Store the analysis results in background state
    analysisState.progress = message.data;
    
    // Handle both string and object data types safely
    const dataString = typeof message.data === 'string' ? message.data : 
                       typeof message.data === 'object' && message.data.message ? message.data.message :
                       JSON.stringify(message.data);
    
    console.log('📨 Background: analysisResult data type:', typeof message.data, 'converted to:', typeof dataString);
    
    if (dataString.includes('Analysis complete') || 
        dataString.includes('loaded from cache') ||
        dataString.includes('Error')) {
      analysisState.isRunning = false;
      analysisState.results = message.data;
      analysisState.stage = 'complete';
      if (dataString.includes('Error')) {
        analysisState.error = message.data;
        analysisState.stage = 'error';
      }
      
      // Create completion notification (without icon to avoid CSP issues)
      if (dataString.includes('Analysis complete') || dataString.includes('loaded from cache')) {
        try {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: '/icons/icon48.png', // Use relative path to extension icon
            title: 'LieBlocker Analysis Complete',
            message: `Video fact-checking finished. Found ${analysisState.currentClaims.length} lies.`
          }, (notificationId) => {
            if (chrome.runtime.lastError) {
              console.warn('Notification creation failed:', chrome.runtime.lastError.message);
            } else {
              console.log('✅ Analysis completion notification created:', notificationId);
            }
          });
        } catch (notificationError) {
          console.warn('Failed to create analysis completion notification:', notificationError);
        }
      }
    }
    
    // Save state persistently
    saveAnalysisState();
    
    // Forward analysis results to popup (if it's open)
    safelySendMessageToPopup(message);
    sendResponse({ success: true });
  } else if (message.type === 'analysisProgress') {
    // Handle progress updates with visual cues
    analysisState.stage = message.stage;
    analysisState.progress = message.message;
    
    // Save state persistently
    saveAnalysisState();
    
    // Forward to popup
    safelySendMessageToPopup(message);
    sendResponse({ success: true });
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
    
    // Create notification for high-severity lies (without icon to avoid CSP issues)
    if (!message.isComplete && message.claims && message.claims.length > 0) {
      const highSeverityLies = message.claims.filter(c => c.severity === 'critical').length;
      
      if (highSeverityLies > 0) {
        try {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: '/icons/icon48.png', // Use relative path to extension icon
            title: 'Lies Detected!',
            message: `Found ${highSeverityLies} critical lies in video analysis. Check the extension for details.`
          }, (notificationId) => {
            if (chrome.runtime.lastError) {
              console.warn('Notification creation failed:', chrome.runtime.lastError.message);
            } else {
              console.log('🚨 Lies detected notification created:', notificationId);
            }
          });
        } catch (notificationError) {
          console.warn('Failed to create lies detection notification:', notificationError);
        }
      }
    }
    
    // Save state persistently
    saveAnalysisState();
    
    // Forward to popup
    safelySendMessageToPopup(message);
    sendResponse({ success: true });
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
        try {
          sendResponse({ 
            success: true, 
            lies: lies,
            videoId: videoId 
          });
        } catch (error) {
          console.error('Error sending getCurrentVideoLies response:', error);
        }
      }).catch(error => {
        console.error('Error loading current video lies:', error);
        try {
          sendResponse({ 
            success: false, 
            lies: [],
            error: error.message 
          });
        } catch (sendError) {
          console.error('Error sending error response:', sendError);
        }
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
    safelySendMessageToPopup(message);
    sendResponse({ success: true });
  } else if (message.type === 'lieSkipped') {
    // NEW: Handle lie skip tracking for accurate time saved calculation
    console.log('⏭️ Background: Lie skipped:', message);
    
    // Update time saved statistics in background storage
    (async () => {
      try {
        const result = await chrome.storage.local.get(['sessionStats']);
        const stats = result.sessionStats || {
          videosAnalyzed: 0,
          liesDetected: 0,
          timeSaved: 0
        };
        
        // Add the skipped lie duration to time saved
        stats.timeSaved += (message.duration || 10);
        
        await chrome.storage.local.set({ sessionStats: stats });
        console.log(`⏭️ Background: Time saved updated: +${message.duration || 10}s (total: ${stats.timeSaved}s)`);
        
        // Forward to popup for UI update
        await safelySendMessageToPopup(message);
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error handling lieSkipped:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true;
  } else if (message.type === 'STATS_UPDATE') {
    // Handle stats updates - just forward to popup
    safelySendMessageToPopup(message);
    sendResponse({ success: true });
  } else {
    // For any other message types, send a basic response
    sendResponse({ success: true, message: 'Message received' });
  }
  
  // Return true to indicate we will respond asynchronously
  return true;
  } catch (error) {
    console.error('Error in background message handler:', error);
    // Still return true to keep message channel open
    return true;
  }
});

// Enhanced notification system for analysis completion and lies discovery
// This functionality is now integrated into the main message handler above

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