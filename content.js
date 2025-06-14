// Function to extract YouTube video transcript via background script
async function getTranscript() {
  const videoId = new URLSearchParams(window.location.href.split('?')[1]).get('v');
  if (!videoId) {
    return null;
  }

  try {
    const currentUrl = window.location.href;
    
    // Send request to background script to handle API call
    const response = await chrome.runtime.sendMessage({
      type: 'getTranscript',
      data: { videoId, currentUrl }
    });
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
    return response.data;

  } catch (error) {
    console.error('❌ Error extracting transcript:', error);
    try {
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: `Error: ${error.message}. Make sure the video has closed captions available.`
      });
    } catch (msgError) {
      console.error('Error sending message:', msgError);
    }
    return null;
  }
}

// Function to prepare full transcript for analysis with configurable duration
async function prepareFullTranscript(transcript) {
  const settings = await chrome.storage.sync.get(['analysisDuration']);
  const ANALYSIS_LIMIT_MINUTES = settings.analysisDuration || 20;
  
  if (!transcript || transcript.length === 0) {
    return null;
  }
  
  const sortedTranscript = [...transcript].sort((a, b) => a.start - b.start);
  const limitedDuration = ANALYSIS_LIMIT_MINUTES * 60;
  const filteredTranscript = sortedTranscript.filter(segment => 
    segment.start < limitedDuration
  );
  
  if (filteredTranscript.length === 0) {
    return null;
  }
  
  let fullText = '';
  let segmentTimestamps = [];
  let timestampMap = new Map();
  
  for (const segment of filteredTranscript) {
    const segmentText = segment.text.trim();
    if (segmentText) {
      const segmentStartPos = fullText.length;
      
      if (fullText) {
        fullText += ' ';
      }
      
      fullText += segmentText;
      const segmentEndPos = fullText.length;
      
      const segmentInfo = {
        text: segmentText,
        timestamp: segment.start,
        duration: segment.duration || 0,
        startPos: segmentStartPos + (fullText.length > segmentText.length ? 1 : 0),
        endPos: segmentEndPos,
        formattedTime: formatSecondsToTimestamp(segment.start)
      };
      
      segmentTimestamps.push(segmentInfo);
      
      for (let pos = segmentInfo.startPos; pos < segmentInfo.endPos; pos++) {
        timestampMap.set(pos, segment.start);
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
    timeWindow: `0:00 - ${endMinutes}:${endSeconds.toString().padStart(2, '0')}`,
    totalSegments: filteredTranscript.length,
    analysisDuration: ANALYSIS_LIMIT_MINUTES
  };
}

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
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (cacheAge < maxAge) {
        if (cached.claims && cached.claims.length > 0) {
          storeDetectedLiesForDownload(cached.claims, videoId);
        }
        return cached;
      } else {
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
      version: '2.1'
    };
    
    await chrome.storage.local.set({
      [`analysis_${videoId}`]: cacheData
    });
    
    storeDetectedLiesForDownload(lies, videoId);
    
    chrome.runtime.sendMessage({
      type: 'cacheUpdated',
      videoId: videoId,
      totalClaims: cacheData.claims.length
    });
    
  } catch (error) {
    console.error('Error saving analysis to cache:', error);
  }
}

// Function to store detected lies for download
function storeDetectedLiesForDownload(lies, videoId) {
  const severityBreakdown = {
    high: lies.filter(l => l.severity === 'high').length,
    medium: lies.filter(l => l.severity === 'medium').length,
    low: lies.filter(l => l.severity === 'low').length
  };
  
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
    }
  };
}

// Function to clean old cache entries
async function cleanOldCache() {
  try {
    const allData = await chrome.storage.local.get(null);
    const analysisKeys = Object.keys(allData).filter(key => key.startsWith('analysis_'));
    
    if (analysisKeys.length > 50) {
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

// System prompt for lie detection
function buildSystemPrompt(analysisDuration) {
  return `You are a fact-checking expert. Analyze this ${analysisDuration}-minute YouTube transcript and identify false or misleading claims.

DETECTION CRITERIA:
- Only flag factual claims, not opinions or predictions
- Require very high confidence (90%+) before flagging
- Focus on clear, verifiable false claims with strong evidence
- Be specific about what makes each claim problematic
- Consider context and intent
- Err on the side of caution to avoid false positives

PRIORITY AREAS:
- Health & Medical misinformation
- Science & Technology false claims
- Financial scams or misleading advice
- Political misinformation
- Conspiracy theories without evidence
- Safety-related false information

TIMESTAMP INSTRUCTIONS:
- The transcript contains segments with precise timestamps
- When you identify a false claim, find the EXACT text in the transcript
- Use the timestamp where that specific false statement begins
- Be precise - match the exact wording from the transcript
- Timestamps should be in MM:SS format (e.g., "2:34")

DURATION ESTIMATION:
- Estimate how long each lie takes to be fully stated
- Simple false statements: 5-10 seconds
- Complex lies with elaboration: 10-20 seconds
- Extended false narratives: 15-30 seconds
- Maximum duration: 30 seconds

RESPONSE FORMAT:
Respond with a JSON object containing an array of claims. Each claim should have:
- "timestamp": The exact timestamp from the transcript (e.g., "2:34")
- "timeInSeconds": Timestamp converted to seconds (e.g., 154)
- "duration": Estimated duration of the lie in seconds (5-30)
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

// Enhanced function to find precise timestamp for a claim
function findClaimTimestamp(claim, transcriptData) {
  const normalizedClaim = claim.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const claimWords = normalizedClaim.split(/\s+/).filter(word => word.length > 2);
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const segment of transcriptData.segmentTimestamps) {
    const segmentText = segment.text.toLowerCase();
    let score = 0;
    
    if (segmentText.includes(normalizedClaim)) {
      score = 100;
    } else {
      for (const word of claimWords) {
        const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
        if (wordRegex.test(segmentText)) {
          score += 5;
        }
      }
      
      if (score > 0) {
        const matchRatio = score / (claimWords.length * 5);
        score = score * (1 + matchRatio);
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = segment;
    }
  }
  
  if (bestMatch && bestScore > 10) {
    return Math.round(bestMatch.timestamp);
  } else {
    return Math.round(transcriptData.startTime);
  }
}

// Function to analyze lies in transcript
async function analyzeLies(transcriptData) {
  try {
    chrome.runtime.sendMessage({
      type: 'analysisProgress',
      stage: 'ai_processing',
      message: 'Sending transcript to AI for analysis...'
    });

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
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: `Please set your ${provider === 'openai' ? 'OpenAI' : 'Gemini'} API key in the extension popup.`
      });
      return null;
    }

    const systemPrompt = buildSystemPrompt(transcriptData.analysisDuration);
    
    const structuredTranscript = transcriptData.segmentTimestamps.map(segment => {
      return `[${segment.formattedTime}] ${segment.text}`;
    }).join('\n');
    
    const userContent = `TRANSCRIPT TO ANALYZE (${transcriptData.timeWindow}):

${structuredTranscript}

Analyze this transcript and identify any false or misleading claims. Use the exact timestamps shown in brackets [MM:SS]. Return only the JSON response as specified.`;
    
    chrome.runtime.sendMessage({
      type: 'analysisProgress',
      stage: 'ai_request',
      message: `Analyzing ${transcriptData.totalSegments} segments for lies...`
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
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedResult = JSON.parse(jsonMatch[0]);
        
        if (parsedResult.claims && Array.isArray(parsedResult.claims)) {
          parsedResult.claims = parsedResult.claims.map((claim, index) => {
            let finalTimeInSeconds;
            let finalTimestamp;
            let finalDuration = claim.duration || 12;
            
            if (claim.timestamp && typeof claim.timestamp === 'string') {
              const timestampParts = claim.timestamp.split(':');
              if (timestampParts.length === 2) {
                const minutes = parseInt(timestampParts[0], 10);
                const seconds = parseInt(timestampParts[1], 10);
                finalTimeInSeconds = minutes * 60 + seconds;
                finalTimestamp = claim.timestamp;
              } else {
                finalTimeInSeconds = findClaimTimestamp(claim.claim, transcriptData);
                finalTimestamp = formatSecondsToTimestamp(finalTimeInSeconds);
              }
            } else if (claim.timeInSeconds && !isNaN(claim.timeInSeconds)) {
              finalTimeInSeconds = Math.round(claim.timeInSeconds);
              finalTimestamp = formatSecondsToTimestamp(finalTimeInSeconds);
            } else {
              finalTimeInSeconds = findClaimTimestamp(claim.claim, transcriptData);
              finalTimestamp = formatSecondsToTimestamp(finalTimeInSeconds);
            }
            
            finalTimeInSeconds = Math.max(transcriptData.startTime, Math.min(finalTimeInSeconds, transcriptData.endTime));
            finalTimestamp = formatSecondsToTimestamp(finalTimeInSeconds);
            
            if (claim.duration && claim.duration >= 5 && claim.duration <= 30) {
              finalDuration = Math.round(claim.duration);
            } else {
              const claimLength = claim.claim.length;
              const wordCount = claim.claim.split(/\s+/).length;
              
              if (claimLength < 50 || wordCount < 8) {
                finalDuration = 8;
              } else if (claimLength < 100 || wordCount < 15) {
                finalDuration = 12;
              } else if (claimLength < 200 || wordCount < 25) {
                finalDuration = 18;
              } else {
                finalDuration = 25;
              }
              
              if (claim.severity === 'high') {
                finalDuration += 5;
              }
              
              finalDuration = Math.max(5, Math.min(finalDuration, 30));
            }
            
            const adjustedConfidence = Math.max(0.85, claim.confidence || 0.85);
            
            return {
              ...claim,
              timestamp: finalTimestamp,
              timeInSeconds: finalTimeInSeconds,
              duration: finalDuration,
              confidence: adjustedConfidence,
              severity: claim.severity || 'medium'
            };
          });
          
          // Filter out lies with confidence below 85%
          parsedResult.claims = parsedResult.claims.filter(claim => claim.confidence >= 0.85);
          
          // Sort by timestamp
          parsedResult.claims.sort((a, b) => a.timeInSeconds - b.timeInSeconds);
        }
        
        return parsedResult;
      } else {
        return { claims: [], rawContent: content };
      }
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      return { claims: [], rawContent: content, parseError: parseError.message };
    }
    
  } catch (error) {
    console.error('Error analyzing lies:', error);
    try {
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: `Error analyzing lies: ${error.message}`
      });
    } catch (msgError) {
      console.error('Error sending message:', msgError);
    }
    return null;
  }
}

// Function to update session stats
async function updateSessionStats(newLies = []) {
  try {
    const stats = await chrome.storage.local.get(['sessionStats']);
    const currentStats = stats.sessionStats || {
      videosAnalyzed: 0,
      liesDetected: 0,
      highSeverity: 0,
      timeSaved: 0
    };
    
    currentStats.videosAnalyzed += 1;
    currentStats.liesDetected += newLies.length;
    currentStats.highSeverity += newLies.filter(c => c.severity === 'high').length;
    
    const actualTimeSaved = newLies.reduce((total, lie) => {
      return total + (lie.duration || 10);
    }, 0);
    
    currentStats.timeSaved += actualTimeSaved;
    
    await chrome.storage.local.set({ sessionStats: currentStats });
    
    chrome.runtime.sendMessage({ type: 'STATS_UPDATE' });
    
  } catch (error) {
    console.error('Error updating session stats:', error);
  }
}

// Main function to process video
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

    storeDetectedLiesForDownload([], videoId);

    chrome.runtime.sendMessage({
      type: 'startAnalysis',
      videoId: videoId
    });

    chrome.runtime.sendMessage({
      type: 'analysisProgress',
      stage: 'cache_check',
      message: 'Checking for cached analysis...'
    });

    const cachedAnalysis = await getCachedAnalysis(videoId);
    if (cachedAnalysis) {
      chrome.runtime.sendMessage({
        type: 'analysisProgress',
        stage: 'cache_found',
        message: 'Loading cached analysis results...'
      });
      
      if (cachedAnalysis.claims && cachedAnalysis.claims.length > 0) {
        chrome.runtime.sendMessage({
          type: 'liesUpdate',
          claims: cachedAnalysis.claims,
          isComplete: true
        });
        
        const settings = await chrome.storage.sync.get(['detectionMode']);
        if (settings.detectionMode === 'skip') {
          currentVideoLies = cachedAnalysis.claims;
          startSkipModeMonitoring();
        }
      }
      
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: cachedAnalysis.analysis + '\n\nAnalysis loaded from cache!'
      });
      return;
    }

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

    const analysis = await analyzeLies(transcriptData);
    
    let allLies = [];
    if (analysis && analysis.claims && analysis.claims.length > 0) {
      allLies = analysis.claims;
    }

    storeDetectedLiesForDownload(allLies, videoId);

    chrome.runtime.sendMessage({
      type: 'liesUpdate',
      claims: allLies,
      totalClaims: allLies.length,
      isComplete: true
    });

    let finalAnalysis;
    if (allLies.length === 0) {
      finalAnalysis = `✅ Lie detection complete!\n\nAnalyzed ${transcriptData.analysisDuration} minutes of content (${transcriptData.totalSegments} segments).\nNo lies detected in this video.\n\nThis content appears to be factually accurate based on our strict detection criteria.`;
    } else {
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
      
      finalAnalysis = `🚨 LIES DETECTED! 🚨\n\nAnalyzed ${transcriptData.analysisDuration} minutes of content (${transcriptData.totalSegments} segments).\nFound ${allLies.length} lies with ${avgConfidence}% average confidence.\nHigh severity: ${highSeverity}\n\n⚠️ WARNING: This content contains false information that could be harmful if believed.\n\n${liesText}`;
    }

    await saveAnalysisToCache(videoId, finalAnalysis, allLies);
    await updateSessionStats(allLies);
    await cleanOldCache();

    chrome.runtime.sendMessage({
      type: 'analysisResult',
      data: finalAnalysis
    });

    const detectionSettings = await chrome.storage.sync.get(['detectionMode']);
    if (detectionSettings.detectionMode === 'skip' && allLies.length > 0) {
      currentVideoLies = allLies;
      startSkipModeMonitoring();
    }

  } catch (error) {
    console.error('Error in processVideo:', error);
    try {
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: `Error processing video: ${error.message}`
      });
    } catch (msgError) {
      console.error('Error sending message:', msgError);
    }
  }
}

// Video control functions
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

function jumpToVideoTimestamp(seconds) {
  try {
    const video = document.querySelector('video');
    if (video) {
      const targetTime = Math.max(0, Math.min(seconds, video.duration || seconds));
      video.currentTime = targetTime;
      
      const url = new URL(window.location.href);
      url.searchParams.set('t', Math.floor(targetTime) + 's');
      window.history.replaceState({}, '', url.toString());
      
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error jumping to timestamp:', error);
    return false;
  }
}

// Skip Mode Variables and Functions
let currentVideoLies = [];
let skipModeActive = false;
let skipModeInterval = null;
let skippedLiesInSession = new Set();

function createLieId(lie) {
  return `${lie.timeInSeconds}_${lie.claim.substring(0, 50)}`;
}

function startSkipModeMonitoring() {
  if (skipModeActive) {
    return;
  }
  
  if (!currentVideoLies || currentVideoLies.length === 0) {
    return;
  }
  
  skipModeActive = true;
  skippedLiesInSession.clear();
  
  if (skipModeInterval) {
    clearInterval(skipModeInterval);
  }
  
  skipModeInterval = setInterval(() => {
    checkAndSkipLies();
  }, 250);
}

function stopSkipModeMonitoring() {
  if (!skipModeActive) {
    return;
  }
  
  skipModeActive = false;
  
  if (skipModeInterval) {
    clearInterval(skipModeInterval);
    skipModeInterval = null;
  }
}

function checkAndSkipLies() {
  try {
    const video = document.querySelector('video');
    if (!video) {
      return;
    }
    
    const currentTime = video.currentTime;
    const isPlaying = !video.paused && !video.ended && video.readyState > 2;
    
    if (!isPlaying) {
      return;
    }
    
    for (const lie of currentVideoLies) {
      const lieStart = lie.timeInSeconds;
      const lieDuration = lie.duration || 10;
      const lieEnd = lieStart + lieDuration;
      const lieId = createLieId(lie);
      
      if (currentTime >= lieStart && currentTime < lieEnd) {
        if (skippedLiesInSession.has(lieId)) {
          continue;
        }
        
        skippedLiesInSession.add(lieId);
        
        const skipToTime = lieEnd + 1;
        video.currentTime = skipToTime;
        
        const url = new URL(window.location.href);
        url.searchParams.set('t', Math.floor(skipToTime) + 's');
        window.history.replaceState({}, '', url.toString());
        
        showSkipNotification(lie, lieDuration);
        
        break;
      }
    }
    
  } catch (error) {
    console.error('Error in checkAndSkipLies:', error);
  }
}

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

function updateDetectionMode(mode) {
  if (mode === 'skip') {
    if (currentVideoLies && currentVideoLies.length > 0) {
      startSkipModeMonitoring();
    }
  } else {
    stopSkipModeMonitoring();
  }
}

// Message listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'startAnalysis') {
    processVideo();
    sendResponse({ success: true });
  } else if (message.type === 'getCurrentTimestamp') {
    const timestamp = getCurrentVideoTimestamp();
    sendResponse({ timestamp: timestamp });
  } else if (message.type === 'jumpToTimestamp') {
    const success = jumpToVideoTimestamp(message.timestamp);
    sendResponse({ success: success });
  } else if (message.type === 'updateDetectionMode') {
    updateDetectionMode(message.mode);
    sendResponse({ success: true });
  }
  return true;
});

function isYouTubeVideoPage() {
  return window.location.href.includes('youtube.com/watch');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'checkPageStatus') {
    sendResponse({ 
      isVideoPage: isYouTubeVideoPage(),
      videoTitle: document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim() || 'Unknown Video'
    });
  }
  return true;
});

// Handle page navigation
function handlePageNavigation() {
  const currentVideoId = new URLSearchParams(window.location.href.split('?')[1]).get('v');
  
  if (currentVideoId !== lastVideoId) {
    stopSkipModeMonitoring();
    currentVideoLies = [];
    skippedLiesInSession.clear();
    lastVideoId = currentVideoId;
    
    window.LieBlockerDetectedLies = null;
  }
}

let lastVideoId = null;

let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    handlePageNavigation();
  }
}).observe(document, { subtree: true, childList: true });

handlePageNavigation();