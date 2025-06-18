// Enhanced background script with improved connection handling and error recovery
// This runs in a service worker context with different CORS permissions

// Helper function to safely send messages to popup with enhanced error handling
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

// Enhanced analysis state with persistent storage and error recovery
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

// Enhanced persistent lies storage for current video
let currentVideoLies = [];
let currentVideoId = null;

// Connection state tracking
let connectionState = {
  popupConnected: false,
  contentScriptConnected: false,
  lastError: null
};

// Build system prompt for AI analysis
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
- "severity": "low", "medium", or "high"

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
      "severity": "high"
    }
  ]
}

IMPORTANT: Only return the JSON object. Do not include any other text.`;
}

// Enhanced AI analysis function
async function performAIAnalysis(videoId, transcript, settings) {
  try {
    console.log('🤖 Starting AI analysis for video:', videoId);
    
    // Update progress
    analysisState.stage = 'ai_analysis';
    analysisState.progress = 'Analyzing transcript with AI...';
    await safelySendMessageToPopup({
      type: 'analysisProgress',
      stage: 'ai_analysis',
      message: 'Analyzing transcript with AI...'
    });
    
    // Validate settings
    if (!settings.apiKey) {
      throw new Error('API key not configured');
    }
    
    if (!transcript || transcript.length === 0) {
      throw new Error('No transcript available for analysis');
    }
    
    // Build the prompt
    const systemPrompt = buildSystemPrompt(settings.analysisDuration || 20);
    
    // Format transcript for analysis
    const transcriptText = transcript.map(segment => {
      const minutes = Math.floor(segment.start / 60);
      const seconds = Math.floor(segment.start % 60);
      const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      return `[${timestamp}] ${segment.text}`;
    }).join('\n');
    
    console.log('📝 Transcript formatted for AI analysis:', transcriptText.length, 'characters');
    
    // Prepare messages for AI
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: `Please analyze this YouTube transcript for false or misleading claims:\n\n${transcriptText}`
      }
    ];
    
    console.log('🚀 Sending request to AI provider:', settings.aiProvider);
    
    // Make AI API call
    const aiResponse = await makeAIRequest(settings, messages);
    
    // Parse AI response
    const analysisResult = parseAIResponse(aiResponse, settings.aiProvider);
    
    console.log('✅ AI analysis completed:', analysisResult.claims.length, 'lies detected');
    
    // Process and validate the detected lies
    const processedLies = processDetectedLies(analysisResult.claims, videoId);
    
    // Update analysis state
    analysisState.currentClaims = processedLies;
    analysisState.isRunning = false;
    analysisState.stage = 'complete';
    analysisState.results = `Analysis complete. Found ${processedLies.length} lies.`;
    
    // Store lies persistently
    currentVideoLies = processedLies;
    await saveCurrentVideoLies(videoId, processedLies);
    
    // Notify popup of completion
    await safelySendMessageToPopup({
      type: 'liesUpdate',
      claims: processedLies,
      videoId: videoId,
      isComplete: true
    });
    
    await safelySendMessageToPopup({
      type: 'analysisResult',
      data: `Analysis complete. Found ${processedLies.length} lies.`
    });
    
    return processedLies;
    
  } catch (error) {
    console.error('❌ AI analysis failed:', error);
    
    analysisState.isRunning = false;
    analysisState.stage = 'error';
    analysisState.error = error.message;
    
    await safelySendMessageToPopup({
      type: 'analysisResult',
      data: `Error: ${error.message}`
    });
    
    throw error;
  }
}

// Make AI API request based on provider
async function makeAIRequest(settings, messages) {
  const { aiProvider, apiKey } = settings;
  
  if (aiProvider === 'openai') {
    return await makeOpenAIRequest(apiKey, settings.openaiModel || 'gpt-4.1-mini', messages);
  } else if (aiProvider === 'gemini') {
    return await makeGeminiRequest(apiKey, settings.geminiModel || 'gemini-2.0-flash-exp', messages);
  } else {
    throw new Error(`Unsupported AI provider: ${aiProvider}`);
  }
}

// OpenAI API request
async function makeOpenAIRequest(apiKey, model, messages) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.3,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }

  return await response.json();
}

// Gemini API request
async function makeGeminiRequest(apiKey, model, messages) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: messages.filter(msg => msg.role !== 'system').map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      })),
      systemInstruction: {
        parts: [{ text: messages.find(msg => msg.role === 'system')?.content || '' }]
      },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4000
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }

  return await response.json();
}

// Parse AI response based on provider
function parseAIResponse(response, provider) {
  try {
    let content;
    
    if (provider === 'openai') {
      content = response.choices?.[0]?.message?.content;
    } else if (provider === 'gemini') {
      content = response.candidates?.[0]?.content?.parts?.[0]?.text;
    }
    
    if (!content) {
      throw new Error('No content in AI response');
    }
    
    // Clean up the content (remove markdown code blocks if present)
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Parse JSON
    const parsed = JSON.parse(cleanContent);
    
    // Validate structure
    if (!parsed.claims || !Array.isArray(parsed.claims)) {
      throw new Error('Invalid response format: missing claims array');
    }
    
    return parsed;
    
  } catch (error) {
    console.error('❌ Error parsing AI response:', error);
    console.error('Raw response:', response);
    throw new Error(`Failed to parse AI response: ${error.message}`);
  }
}

// Process and validate detected lies
function processDetectedLies(claims, videoId) {
  return claims.map((claim, index) => {
    // Convert timestamp to seconds if not already provided
    let timeInSeconds = claim.timeInSeconds;
    if (!timeInSeconds && claim.timestamp) {
      timeInSeconds = parseTimestamp(claim.timestamp);
    }
    
    return {
      id: `${videoId}_${index}_${Date.now()}`,
      video_id: videoId,
      timestamp_seconds: timeInSeconds || 0,
      duration_seconds: Math.max(5, Math.min(30, claim.duration || 10)),
      claim_text: String(claim.claim || '').substring(0, 1000),
      explanation: String(claim.explanation || '').substring(0, 2000),
      confidence: Math.max(0, Math.min(1, parseFloat(claim.confidence) || 0)),
      severity: validateSeverity(claim.severity),
      category: 'factual'
    };
  }).filter(lie => lie.confidence >= 0.85); // Only include high-confidence lies
}

// Parse timestamp string to seconds
function parseTimestamp(timestamp) {
  if (!timestamp) return 0;
  
  const parts = timestamp.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  }
  
  return 0;
}

// Validate severity levels
function validateSeverity(severity) {
  const allowedSeverities = ['low', 'medium', 'high'];
  const normalizedSeverity = String(severity || 'medium').toLowerCase();
  
  if (allowedSeverities.includes(normalizedSeverity)) {
    return normalizedSeverity;
  }
  
  // Map variations
  const severityMap = {
    'minor': 'low',
    'moderate': 'medium',
    'major': 'high',
    'severe': 'high',
    'critical': 'high'
  };
  
  return severityMap[normalizedSeverity] || 'medium';
}

// Extract transcript from content script
async function extractTranscript(tabId) {
  try {
    console.log('📋 Extracting transcript from tab:', tabId);
    
    analysisState.stage = 'transcript_extraction';
    analysisState.progress = 'Extracting video transcript...';
    await safelySendMessageToPopup({
      type: 'analysisProgress',
      stage: 'transcript_extraction',
      message: 'Extracting video transcript...'
    });
    
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'extractDOMTranscript'
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to extract transcript');
    }
    
    const transcript = response.data;
    if (!transcript || transcript.length === 0) {
      throw new Error('No transcript data available');
    }
    
    console.log('✅ Transcript extracted:', transcript.length, 'segments');
    return transcript;
    
  } catch (error) {
    console.error('❌ Transcript extraction failed:', error);
    throw new Error(`Transcript extraction failed: ${error.message}`);
  }
}

// Main analysis orchestrator
async function startVideoAnalysis(videoId, settings) {
  try {
    console.log('🎬 Starting video analysis for:', videoId);
    
    // Get active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      throw new Error('No active tab found');
    }
    
    const tab = tabs[0];
    
    // Extract transcript
    const transcript = await extractTranscript(tab.id);
    
    // Perform AI analysis
    const lies = await performAIAnalysis(videoId, transcript, settings);
    
    console.log('✅ Video analysis completed successfully');
    return lies;
    
  } catch (error) {
    console.error('❌ Video analysis failed:', error);
    
    analysisState.isRunning = false;
    analysisState.stage = 'error';
    analysisState.error = error.message;
    
    await safelySendMessageToPopup({
      type: 'analysisResult',
      data: `Error: ${error.message}`
    });
    
    throw error;
  }
}

// Persistent state management with error handling
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

// Enhanced save current video lies persistently
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

// Enhanced load current video lies from storage
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

// Enhanced message handling with better error recovery
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log('📨 Background: Received message:', message.type, 'from:', sender.tab ? 'content' : 'popup');
    
    if (message.type === 'ping') {
      // Simple ping/pong for connection testing
      sendResponse({ success: true, message: 'pong' });
      return;
    }
    
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
        
        // Create completion notification
        if (dataString.includes('Analysis complete') || dataString.includes('loaded from cache')) {
          try {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iMTIiIGZpbGw9IiM0Mjg1RjQiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMiAxMikiPgo8cGF0aCBkPSJNMTIgMkMxMy4xIDIgMTQgMi45IDE0NDRIMT1WNkMxNS41IDYgMTYgNi41IDE2IDdWMTdDMTYgMTcuNSAxNS41IDE4IDE1IDE4SDlDOC41IDE4IDggMTcuNSA4IDE3VjdDOCA2LjUgOC41IDYgOSA2SDEwVjRDMTAgMi45IDEwLjkgMiAxMiAyWk0xMiA0QzExLjQgNCAxMSA0LjQgMTEgNVY2SDEzVjVDMTMgNC40IDEyLjYgNCAxMiA0WkMxNCAzQzE0IDMgMTQgMyAxNCAzVjJDMTYuMiAyIDE4IDMuOCAxOCA2VjE4QzE4IDIwLjIgMTYuMiAyMiAxNCAyMkgxMEMwIDIyIDggMjAuMiA4IDE4VjZDOCAzLjggOS44IDIgMTIgMloiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo8L3N2Zz4K',
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
      
      // Store lies persistently for current video
      if (message.videoId) {
        currentVideoId = message.videoId;
        currentVideoLies = message.claims || [];
        saveCurrentVideoLies(message.videoId, currentVideoLies);
      }
      
      if (message.isComplete) {
        analysisState.isRunning = false;
        analysisState.stage = 'complete';
      }
      
      // Create notification for high-severity lies
      if (!message.isComplete && message.claims && message.claims.length > 0) {
        const highSeverityLies = message.claims.filter(c => c.severity === 'high').length;
        
        if (highSeverityLies > 0) {
          try {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iMTIiIGZpbGw9IiNEQzM1NDUiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMiAxMikiPgo8cGF0aCBkPSJNMTIgMkMyIDIgMiAxMiAyIDEyUzIgMjIgMTIgMjJTMjIgMTIgMjIgMTJTMjIgMiAxMiAyWk0xMiA3QzEyLjUgNyAxMyA3LjUgMTMgOFYxMkMxMyAxMi41IDEyLjUgMTMgMTIgMTNTMTEgMTIuNSAxMSAxMlY4QzExIDcuNSAxMS41IDcgMTIgN1pNMTIgMTVDMTIuNSAxNSAxMyAxNS41IDEzIDE2UzEyLjUgMTcgMTIgMTdTMTEgMTYuNSAxMSAxNlMxMS41IDE1IDEyIDE1WiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+Cjwvc3ZnPgo=',
              title: 'Lies Detected!',
              message: `Found ${highSeverityLies} lies in video analysis. Check the extension for details.`
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
      // Enhanced analysis start with actual AI processing
      analysisState.isRunning = true;
      analysisState.videoId = message.videoId;
      analysisState.progress = 'Starting full video analysis...';
      analysisState.results = '';
      analysisState.error = null;
      analysisState.currentClaims = [];
      analysisState.startTime = Date.now();
      analysisState.stage = 'starting';
      
      // Set current video context
      currentVideoId = message.videoId;
      currentVideoLies = [];
      
      // Save state persistently
      saveAnalysisState();
      
      // Start the actual analysis process asynchronously
      startVideoAnalysis(message.videoId, message.settings).catch(error => {
        console.error('❌ Analysis failed:', error);
      });
      
      sendResponse({ success: true });
      return true;
      
    } else if (message.type === 'getAnalysisState') {
      // Popup requesting current analysis state
      sendResponse(analysisState);
      return true;
      
    } else if (message.type === 'getCurrentVideoLies') {
      // Enhanced popup requesting current video lies
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
      
      // Clear current video lies
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
      // Handle lie skip tracking for accurate time saved calculation
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
    
    // Send error response if possible
    try {
      sendResponse({ success: false, error: error.message });
    } catch (responseError) {
      console.error('Error sending error response:', responseError);
    }
    
    // Still return true to keep message channel open
    return true;
  }
});

// Enhanced periodic cleanup of old analysis states and video lies data
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

console.log('✅ Enhanced LieBlocker background script initialized with AI analysis capabilities');