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
    
    // Return the transcript segments directly since they already have timestamps
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

// Function to get cached analysis results from Supabase
async function getCachedAnalysis(videoId) {
  try {
    // Import Supabase client
    const { db } = await import('./lib/supabase.js');
    
    // Get video analysis from Supabase
    const videoStats = await db.getVideoStats(videoId);
    
    if (videoStats && videoStats.analysis) {
      console.log('📊 Found cached analysis in Supabase:', videoStats);
      
      // Transform Supabase data to match expected format
      const cached = {
        analysis: `✅ Analysis loaded from Supabase!\n\nFound ${videoStats.totalLies} lies in this video.`,
        claims: videoStats.lies.map(lie => ({
          timestamp: formatSecondsToTimestamp(lie.timestamp_seconds),
          timeInSeconds: lie.timestamp_seconds,
          duration: lie.duration_seconds,
          claim: lie.claim_text,
          explanation: lie.explanation,
          confidence: lie.confidence,
          severity: lie.severity
        })),
        timestamp: new Date(videoStats.analysis.created_at).getTime(),
        videoId: videoId,
        version: videoStats.analysis.analysis_version
      };
      
      // Create LieBlockerDetectedLies object from cached data
      if (cached.claims && cached.claims.length > 0) {
        storeDetectedLiesForDownload(cached.claims, videoId);
      }
      
      return cached;
    }
    
    return null;
  } catch (error) {
    console.error('Error retrieving cached analysis from Supabase:', error);
    return null;
  }
}

// Function to save analysis results to Supabase
async function saveAnalysisToSupabase(videoId, analysisText, lies = [], videoTitle = '', channelName = '') {
  try {
    // Import Supabase client
    const { db } = await import('./lib/supabase.js');
    
    console.log('💾 Saving analysis to Supabase...');
    
    // 1. Create or update video record
    const videoData = {
      video_id: videoId,
      title: videoTitle,
      channel_name: channelName,
      duration: null // We could get this from the video element if needed
    };
    
    const video = await db.upsertVideo(videoData);
    console.log('📹 Video record created/updated:', video);
    
    // 2. Create video analysis record
    const analysisData = {
      video_id: video.id,
      analysis_version: '2.1',
      total_lies_detected: lies.length,
      analysis_duration_minutes: 20, // Get from settings if needed
      confidence_threshold: 0.85
    };
    
    const analysis = await db.createVideoAnalysis(analysisData);
    console.log('📊 Analysis record created:', analysis);
    
    // 3. Create detected lies records
    if (lies.length > 0) {
      const liesData = lies.map(lie => ({
        analysis_id: analysis.id,
        timestamp_seconds: lie.timeInSeconds,
        duration_seconds: lie.duration,
        claim_text: lie.claim,
        explanation: lie.explanation,
        confidence: lie.confidence,
        severity: lie.severity,
        category: lie.category || 'other'
      }));
      
      const savedLies = await db.createDetectedLies(liesData);
      console.log('🚨 Lies records created:', savedLies.length);
    }
    
    // Store detected lies for download
    storeDetectedLiesForDownload(lies, videoId);
    
    // Notify popup of cache update
    chrome.runtime.sendMessage({
      type: 'cacheUpdated',
      videoId: videoId,
      totalClaims: lies.length
    });
    
    console.log('✅ Successfully saved analysis to Supabase');
    
  } catch (error) {
    console.error('❌ Error saving analysis to Supabase:', error);
    // Fallback to local storage if Supabase fails
    await saveAnalysisToCache(videoId, analysisText, lies);
  }
}

// Keep local cache as fallback
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

// Simplified system prompt function with improved lie detection criteria and configurable duration
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
- Estimate how long each lie takes to be fully stated based on the claim's complexity
- Consider the actual length and complexity of the false statement
- Simple false statements: 5-10 seconds
- Complex lies with elaboration: 10-20 seconds
- Extended false narratives: 15-30 seconds
- Maximum duration: 30 seconds
- Base your estimate on the actual content and speaking pace

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

// NEW: Enhanced function to find precise timestamp and duration using n-gram fallback
function findClaimStartAndEnd(claimText, transcriptData) {
  // Clean and normalize the claim text for better matching
  const normalizedClaim = claimText.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const fullText = transcriptData.text.toLowerCase();
  
  // PRIORITY 1: Try exact phrase match in full text
  const exactMatchIndex = fullText.indexOf(normalizedClaim);
  if (exactMatchIndex !== -1) {
    const matchEndIndex = exactMatchIndex + normalizedClaim.length;
    
    // Use character-to-segment mapping to find start and end segments
    const startSegmentIndex = transcriptData.charToSegmentIndexMap.get(exactMatchIndex);
    const endSegmentIndex = transcriptData.charToSegmentIndexMap.get(Math.min(matchEndIndex - 1, fullText.length - 1));
    
    if (startSegmentIndex !== undefined && endSegmentIndex !== undefined) {
      const startSegment = transcriptData.segmentTimestamps[startSegmentIndex];
      const endSegment = transcriptData.segmentTimestamps[endSegmentIndex];
      
      const startInSeconds = startSegment.timestamp;
      const endInSeconds = endSegment.timestamp + (endSegment.duration || 5);
      const duration = Math.max(5, Math.min(endInSeconds - startInSeconds, 30));
      
      return {
        startInSeconds: Math.round(startInSeconds),
        endInSeconds: Math.round(endInSeconds),
        duration: Math.round(duration)
      };
    }
  }
  
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
    const estimatedDuration = Math.max(8, Math.min(claimText.length / 10, 25)); // Estimate based on text length
    const endInSeconds = startInSeconds + estimatedDuration;
    
    return {
      startInSeconds: Math.round(startInSeconds),
      endInSeconds: Math.round(endInSeconds),
      duration: Math.round(estimatedDuration)
    };
  }
  
  // Final fallback: use transcript start with default duration
  return {
    startInSeconds: Math.round(transcriptData.startTime),
    endInSeconds: Math.round(transcriptData.startTime + 12),
    duration: 12
  };
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
    
    // Enhanced JSON parsing with better error handling
    try {
      // Clean the content to ensure valid JSON
      let cleanContent = content.trim();
      
      // Remove any markdown code blocks
      cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // Fix common JSON issues
      cleanContent = cleanContent.replace(/\\"/g, '"'); // Fix escaped quotes
      cleanContent = cleanContent.replace(/"\s*:\s*"/g, '": "'); // Fix spacing around colons
      
      // Try to extract JSON from the response
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedResult = JSON.parse(jsonMatch[0]);
        
        // Enhanced post-processing for accurate timestamps and durations
        if (parsedResult.claims && Array.isArray(parsedResult.claims)) {
          parsedResult.claims = parsedResult.claims.map((claim, index) => {
            // Use the new findClaimStartAndEnd function for precise timestamp and duration
            const { startInSeconds, endInSeconds, duration } = findClaimStartAndEnd(claim.claim, transcriptData);
            
            // Apply 2-second offset to start slightly before the lie
            const TIMESTAMP_OFFSET_SECONDS = 2;
            const finalTimeInSeconds = Math.max(transcriptData.startTime, startInSeconds - TIMESTAMP_OFFSET_SECONDS);
            const finalTimestamp = formatSecondsToTimestamp(finalTimeInSeconds);
            
            // Ensure timestamp is within bounds
            const boundedTimeInSeconds = Math.max(transcriptData.startTime, Math.min(finalTimeInSeconds, transcriptData.endTime));
            const boundedTimestamp = formatSecondsToTimestamp(boundedTimeInSeconds);
            
            // Ensure minimum confidence of 85%
            const adjustedConfidence = Math.max(0.85, claim.confidence || 0.85);
            
            return {
              ...claim,
              timestamp: boundedTimestamp,
              timeInSeconds: boundedTimeInSeconds,
              duration: duration,
              confidence: adjustedConfidence,
              severity: claim.severity || 'medium'
            };
          });
          
          // Filter out lies with confidence below 85%
          const highConfidenceLies = parsedResult.claims.filter(claim => claim.confidence >= 0.85);
          
          parsedResult.claims = highConfidenceLies;
          
          // Sort by timestamp for logical order
          parsedResult.claims.sort((a, b) => a.timeInSeconds - b.timeInSeconds);
        }
        
        return parsedResult;
      } else {
        console.warn('No JSON found in AI response');
        return { claims: [], rawContent: content };
      }
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.log('Raw AI response:', content);
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

// Function to update session stats with improved time saved calculation
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
    
    // Calculate actual time saved based on lie durations
    const actualTimeSaved = newLies.reduce((total, lie) => {
      return total + (lie.duration || 10); // Use actual duration or default to 10 seconds
    }, 0);
    
    currentStats.timeSaved += actualTimeSaved;
    
    await chrome.storage.local.set({ sessionStats: currentStats });
    
    // Notify popup of stats update
    chrome.runtime.sendMessage({ type: 'STATS_UPDATE' });
    
  } catch (error) {
    console.error('Error updating session stats:', error);
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

    // Get video title and channel name for Supabase
    const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim() || '';
    const channelName = document.querySelector('#text.ytd-channel-name a')?.textContent?.trim() || '';

    // Initialize empty LieBlockerDetectedLies object immediately
    storeDetectedLiesForDownload([], videoId);

    // Notify background script that analysis is starting
    chrome.runtime.sendMessage({
      type: 'startAnalysis',
      videoId: videoId
    });

    // Check for cached analysis first (now from Supabase)
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
      
      // Send cached lies for real-time display
      if (cachedAnalysis.claims && cachedAnalysis.claims.length > 0) {
        chrome.runtime.sendMessage({
          type: 'liesUpdate',
          claims: cachedAnalysis.claims,
          isComplete: true
        });
        
        // Start skip mode monitoring if skip mode is enabled
        const settings = await chrome.storage.sync.get(['detectionMode']);
        if (settings.detectionMode === 'skip') {
          currentVideoLies = cachedAnalysis.claims;
          startSkipModeMonitoring();
        }
      }
      
      // Display cache results
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: cachedAnalysis.analysis + '\n\nAnalysis loaded from Supabase!'
      });
      return;
    }

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
      totalClaims: allLies.length,
      isComplete: true
    });

    // Prepare final analysis with enhanced reporting
    let finalAnalysis;
    if (allLies.length === 0) {
      finalAnalysis = `✅ Lie detection complete!\n\nAnalyzed ${transcriptData.analysisDuration} minutes of content (${transcriptData.totalSegments} segments) with precision timestamp mapping.\nNo lies detected in this video.\n\nThis content appears to be factually accurate based on our strict detection criteria.`;
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
      
      finalAnalysis = `🚨 LIES DETECTED! 🚨\n\nAnalyzed ${transcriptData.analysisDuration} minutes of content (${transcriptData.totalSegments} segments) with enhanced precision.\nFound ${allLies.length} lies with ${avgConfidence}% average confidence.\nHigh severity: ${highSeverity}\n\n⚠️ WARNING: This content contains false information that could be harmful if believed.\n\n${liesText}`;
    }

    // Save final analysis to Supabase (with fallback to local cache)
    await saveAnalysisToSupabase(videoId, finalAnalysis, allLies, videoTitle, channelName);
    
    // Update session stats with improved time calculation
    await updateSessionStats(allLies);
    
    // Clean old cache entries
    await cleanOldCache();

    chrome.runtime.sendMessage({
      type: 'analysisResult',
      data: finalAnalysis
    });

    // Start skip mode monitoring if skip mode is enabled and lies were found
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
      const lieDuration = lie.duration || 10;
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
        
        console.log(`✅ Skip mode: Successfully skipped to ${skipToTime}s (after ${lieDuration}s lie)`);
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
    if (currentVideoLies && currentVideoLies.length > 0) {
      startSkipModeMonitoring();
    }
  } else {
    stopSkipModeMonitoring();
  }
}

// Listen for messages from popup
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

// Check if we're on a YouTube video page
function isYouTubeVideoPage() {
  return window.location.href.includes('youtube.com/watch');
}

// Send page status to popup when it opens
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'checkPageStatus') {
    sendResponse({ 
      isVideoPage: isYouTubeVideoPage(),
      videoTitle: document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim() || 'Unknown Video'
    });
  }
  return true;
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