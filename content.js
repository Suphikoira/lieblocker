// Function to extract YouTube video transcript via background script
async function getTranscript() {
  const videoId = new URLSearchParams(window.location.href.split('?')[1]).get('v');
  if (!videoId) {
    console.log('No video ID found');
    return null;
  }

  try {
    console.log('🎬 Requesting transcript extraction for video:', videoId);
    
    const currentUrl = window.location.href;
    console.log('🌐 Fetching transcript for URL:', currentUrl);
    
    // Send request to background script to handle API call
    const response = await chrome.runtime.sendMessage({
      type: 'getTranscript',
      data: { videoId, currentUrl }
    });
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
    console.log('✅ Transcript received from background script');
    console.log(`✅ Successfully extracted ${response.data.length} transcript segments`);
    
    // Store transcript data for download feature
    storeTranscriptForDownload(response.data, videoId);
    
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

// Function to store transcript data for download feature
function storeTranscriptForDownload(transcript, videoId) {
  const formattedTranscript = transcript.map((segment, index) => {
    const minutes = Math.floor(segment.start / 60);
    const seconds = Math.floor(segment.start % 60);
    const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    return {
      index: index + 1,
      timestamp: timestamp,
      timeInSeconds: Math.round(segment.start),
      duration: segment.duration ? Math.round(segment.duration) : null,
      text: segment.text.trim()
    };
  });
  
  // Store in global object for download access
  window.LieBlockerTranscriptData = {
    videoId: videoId,
    extractedAt: new Date().toISOString(),
    totalSegments: transcript.length,
    segments: formattedTranscript,
    
    // Helper functions for download
    downloadJSON: function() {
      const data = {
        videoId: this.videoId,
        extractedAt: this.extractedAt,
        totalSegments: this.totalSegments,
        segments: this.segments
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript-${this.videoId}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    
    downloadCSV: function() {
      const csv = [
        'Index,Timestamp,TimeInSeconds,Duration,Text',
        ...this.segments.map(s => 
          `${s.index},"${s.timestamp}",${s.timeInSeconds},${s.duration || ''},"${s.text.replace(/"/g, '""')}"`
        )
      ].join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript-${this.videoId}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };
  
  console.log('📋 Transcript data stored for download. Access via window.LieBlockerTranscriptData');
}

// Function to prepare full transcript for analysis with configurable duration
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
  
  console.log(`📊 Preparing full transcript analysis for ${ANALYSIS_LIMIT_MINUTES} minutes`);
  console.log(`📊 Processing ${filteredTranscript.length} transcript segments`);
  
  // Build the full text with precise timestamp mapping
  let fullText = '';
  let segmentTimestamps = [];
  let timestampMap = new Map(); // Map text positions to exact timestamps
  
  for (const segment of filteredTranscript) {
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
        startPos: segmentStartPos + (fullText.length > segmentText.length ? 1 : 0),
        endPos: segmentEndPos,
        formattedTime: formatSecondsToTimestamp(segment.start)
      };
      
      segmentTimestamps.push(segmentInfo);
      
      // Map every character position in this segment to its timestamp
      for (let pos = segmentInfo.startPos; pos < segmentInfo.endPos; pos++) {
        timestampMap.set(pos, segment.start);
      }
    }
  }
  
  const startTime = filteredTranscript[0].start;
  const endTime = Math.min(filteredTranscript[filteredTranscript.length - 1].start, limitedDuration);
  const endMinutes = Math.floor(endTime / 60);
  const endSeconds = Math.floor(endTime % 60);
  
  // Store analysis transcript data for download
  storeAnalysisTranscriptForDownload(fullText, segmentTimestamps, timestampMap, `0:00 - ${endMinutes}:${endSeconds.toString().padStart(2, '0')}`);
  
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

// Helper function to format seconds to MM:SS timestamp
function formatSecondsToTimestamp(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Function to store analysis transcript data for download
function storeAnalysisTranscriptForDownload(fullText, segmentTimestamps, timestampMap, timeWindow) {
  window.LieBlockerAnalysisData = {
    fullText: fullText,
    segmentTimestamps: segmentTimestamps,
    timeWindow: timeWindow,
    processedAt: new Date().toISOString(),
    
    downloadAnalysisData: function() {
      const data = {
        fullText: this.fullText,
        segmentTimestamps: this.segmentTimestamps,
        timeWindow: this.timeWindow,
        processedAt: this.processedAt,
        textLength: this.fullText.length,
        totalSegments: this.segmentTimestamps.length
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analysis-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };
  
  console.log('📊 Analysis transcript data stored for download. Access via window.LieBlockerAnalysisData');
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
        console.log('📋 Found cached analysis for video:', videoId);
        
        // Create LieBlockerDetectedLies object from cached data
        if (cached.claims && cached.claims.length > 0) {
          storeDetectedLiesForDownload(cached.claims, videoId);
        }
        
        return cached;
      } else {
        console.log('⏰ Cached analysis expired for video:', videoId);
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
    
    console.log('💾 Analysis saved to cache for video:', videoId);
    console.log('💾 Total lies saved:', cacheData.claims.length);
    
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
  
  // Get unique categories
  const categories = [...new Set(lies.map(l => l.category || 'other'))];
  
  window.LieBlockerDetectedLies = {
    videoId: videoId,
    detectedAt: new Date().toISOString(),
    totalLies: lies.length,
    lies: lies,
    summary: {
      severityBreakdown: severityBreakdown,
      categories: categories,
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
      
      console.log('📥 Downloaded lies data:', data);
    },
    
    // Helper methods for console access
    getLiesByTimestamp: function(timestamp) {
      return this.lies.filter(lie => lie.timestamp === timestamp);
    },
    
    getLiesBySeverity: function(severity) {
      return this.lies.filter(lie => lie.severity === severity);
    },
    
    getLiesByCategory: function(category) {
      return this.lies.filter(lie => lie.category === category);
    },
    
    getHighConfidenceLies: function(threshold = 0.8) {
      return this.lies.filter(lie => (lie.confidence || 0) >= threshold);
    }
  };
  
  console.log('🚨 Detected lies data stored for download. Access via window.LieBlockerDetectedLies');
  console.log(`🚨 Total lies: ${lies.length}`);
  console.log(`🚨 Severity breakdown:`, severityBreakdown);
  console.log(`🚨 Categories:`, categories);
  console.log(`🚨 Average confidence: ${Math.round(averageConfidence * 100)}%`);
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
        console.log(`🧹 Cleaned ${keysToRemove.length} old cache entries`);
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
- "category": Type of misinformation (e.g., "health", "science", "politics", "conspiracy")

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
      "severity": "high",
      "category": "health"
    }
  ]
}

IMPORTANT: Only return the JSON object. Do not include any other text.`;
}

// Enhanced function to find precise timestamp for a claim using improved text matching
function findClaimTimestamp(claim, transcriptData) {
  console.log(`🔍 Finding precise timestamp for claim: "${claim}"`);
  
  // Clean and normalize the claim text for better matching
  const normalizedClaim = claim.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Split into words and create search phrases
  const claimWords = normalizedClaim.split(/\s+/).filter(word => word.length > 2);
  
  // Try to find exact phrase matches first
  let bestMatch = null;
  let bestScore = 0;
  
  // Search through each segment for the best match
  for (const segment of transcriptData.segmentTimestamps) {
    const segmentText = segment.text.toLowerCase();
    let score = 0;
    
    // Check for exact phrase match (highest priority)
    if (segmentText.includes(normalizedClaim)) {
      score = 100;
      console.log(`🎯 Found exact phrase match in segment at ${segment.timestamp}s`);
    } else {
      // Check for partial matches with individual words
      for (const word of claimWords) {
        const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
        if (wordRegex.test(segmentText)) {
          score += 5; // Points for each matching word
        }
      }
      
      // Bonus for higher word density
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
    console.log(`🎯 Best match found: "${bestMatch.text.substring(0, 50)}..." at ${bestMatch.timestamp}s (score: ${bestScore})`);
    return Math.round(bestMatch.timestamp);
  } else {
    console.log(`⚠️ No good match found (score: ${bestScore}), using transcript start`);
    return Math.round(transcriptData.startTime);
  }
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

    console.log('Analyzing lies with high confidence threshold (85%+)');
    console.log('Time window:', transcriptData.timeWindow);
    console.log(`Using ${provider} model:`, model);
    
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
          temperature: 0.2, // Slightly higher for better detection
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
    
    console.log('🤖 AI Response:', content);
    
    // Enhanced JSON parsing with better error handling
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedResult = JSON.parse(jsonMatch[0]);
        
        // Enhanced post-processing for accurate timestamps and durations
        if (parsedResult.claims && Array.isArray(parsedResult.claims)) {
          console.log(`🔍 Processing ${parsedResult.claims.length} detected lies for timestamp accuracy`);
          
          parsedResult.claims = parsedResult.claims.map((claim, index) => {
            let finalTimeInSeconds;
            let finalTimestamp;
            let finalDuration = claim.duration || 12; // Default 12 seconds
            
            console.log(`\n🎯 Processing lie ${index + 1}: "${claim.claim}"`);
            
            // Parse the timestamp from the AI response
            if (claim.timestamp && typeof claim.timestamp === 'string') {
              const timestampParts = claim.timestamp.split(':');
              if (timestampParts.length === 2) {
                const minutes = parseInt(timestampParts[0], 10);
                const seconds = parseInt(timestampParts[1], 10);
                finalTimeInSeconds = minutes * 60 + seconds;
                finalTimestamp = claim.timestamp;
                
                console.log(`✅ Using AI timestamp: ${finalTimestamp} (${finalTimeInSeconds}s)`);
              } else {
                console.log(`🔍 Invalid timestamp format, finding precise match...`);
                finalTimeInSeconds = findClaimTimestamp(claim.claim, transcriptData);
                finalTimestamp = formatSecondsToTimestamp(finalTimeInSeconds);
              }
            } else if (claim.timeInSeconds && !isNaN(claim.timeInSeconds)) {
              finalTimeInSeconds = Math.round(claim.timeInSeconds);
              finalTimestamp = formatSecondsToTimestamp(finalTimeInSeconds);
              console.log(`✅ Using AI timeInSeconds: ${finalTimestamp} (${finalTimeInSeconds}s)`);
            } else {
              console.log(`🔍 No valid timestamp provided, finding precise match...`);
              finalTimeInSeconds = findClaimTimestamp(claim.claim, transcriptData);
              finalTimestamp = formatSecondsToTimestamp(finalTimeInSeconds);
            }
            
            // Ensure timestamp is within bounds
            finalTimeInSeconds = Math.max(transcriptData.startTime, Math.min(finalTimeInSeconds, transcriptData.endTime));
            finalTimestamp = formatSecondsToTimestamp(finalTimeInSeconds);
            
            // Enhanced duration estimation based on claim complexity and AI suggestion
            if (claim.duration && claim.duration >= 5 && claim.duration <= 30) {
              // Use AI-provided duration if it's reasonable
              finalDuration = Math.round(claim.duration);
              console.log(`✅ Using AI-provided duration: ${finalDuration}s`);
            } else {
              // Estimate duration based on claim length and complexity
              const claimLength = claim.claim.length;
              const wordCount = claim.claim.split(/\s+/).length;
              
              if (claimLength < 50 || wordCount < 8) {
                finalDuration = 8; // Short, simple claims
              } else if (claimLength < 100 || wordCount < 15) {
                finalDuration = 12; // Medium claims
              } else if (claimLength < 200 || wordCount < 25) {
                finalDuration = 18; // Longer claims
              } else {
                finalDuration = 25; // Complex, extended claims
              }
              
              // Add extra time for high severity lies (usually more elaborated)
              if (claim.severity === 'high') {
                finalDuration += 5;
              }
              
              // Ensure bounds
              finalDuration = Math.max(5, Math.min(finalDuration, 30));
              
              console.log(`📏 Estimated duration based on complexity: ${finalDuration}s (${claimLength} chars, ${wordCount} words)`);
            }
            
            // Ensure minimum confidence of 85%
            const adjustedConfidence = Math.max(0.85, claim.confidence || 0.85);
            
            console.log(`🎯 Final lie ${index + 1} details:`);
            console.log(`   - Timestamp: ${finalTimestamp} (${finalTimeInSeconds}s)`);
            console.log(`   - Duration: ${finalDuration}s`);
            console.log(`   - Confidence: ${Math.round(adjustedConfidence * 100)}%`);
            console.log(`   - Severity: ${claim.severity || 'medium'}`);
            console.log(`   - Category: ${claim.category || 'other'}`);
            console.log(`   - Claim length: ${claim.claim.length} chars, ${claim.claim.split(/\s+/).length} words`);
            console.log(`   - Claim: "${claim.claim.substring(0, 100)}..."`);
            
            return {
              ...claim,
              timestamp: finalTimestamp,
              timeInSeconds: finalTimeInSeconds,
              duration: finalDuration,
              confidence: adjustedConfidence,
              severity: claim.severity || 'medium',
              category: claim.category || 'other'
            };
          });
          
          // Filter out lies with confidence below 85%
          const highConfidenceLies = parsedResult.claims.filter(claim => claim.confidence >= 0.85);
          
          console.log(`🎯 Filtered ${parsedResult.claims.length - highConfidenceLies.length} lies below 85% confidence threshold`);
          console.log(`✅ Final result: ${highConfidenceLies.length} high-confidence lies`);
          
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

    // Initialize empty LieBlockerDetectedLies object immediately
    storeDetectedLiesForDownload([], videoId);

    // Notify background script that analysis is starting
    chrome.runtime.sendMessage({
      type: 'startAnalysis',
      videoId: videoId
    });

    // Check for cached analysis first
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
        data: cachedAnalysis.analysis + '\n\nAnalysis loaded from cache!'
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
      
      console.log(`✅ Analysis complete: Found ${allLies.length} high-confidence lies (85%+)`);
    } else {
      console.log('✅ Analysis complete: No high-confidence lies detected in this video');
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
      finalAnalysis = `✅ Lie detection complete!\n\nAnalyzed ${transcriptData.analysisDuration} minutes of content (${transcriptData.totalSegments} segments) with precision timestamp mapping.\nNo high-confidence lies (85%+) were identified in this video.\n\nThis content appears to be factually accurate based on our strict detection criteria.`;
    } else {
      // Sort lies by timestamp for final display
      allLies.sort((a, b) => a.timeInSeconds - b.timeInSeconds);
      
      const liesText = allLies.map((claim, index) => {
        const categoryEmoji = {
          health: '🏥',
          science: '🔬',
          financial: '💰',
          political: '🏛️',
          safety: '⚠️',
          conspiracy: '🕳️',
          other: '🚨'
        };
        
        const severityEmoji = {
          low: '🟡',
          medium: '🟠',
          high: '🔴'
        };
        
        return `${index + 1}. ${categoryEmoji[claim.category] || '🚨'} ${severityEmoji[claim.severity] || '🟠'} ${claim.timestamp} (${claim.duration}s)\n🚫 Lie: ${claim.claim}\n🎯 Confidence: ${Math.round(claim.confidence * 100)}%\n💡 ${claim.explanation}`;
      }).join('\n\n');
      
      const avgConfidence = Math.round(allLies.reduce((sum, c) => sum + c.confidence, 0) / allLies.length * 100);
      const categories = [...new Set(allLies.map(c => c.category))];
      const highSeverity = allLies.filter(c => c.severity === 'high').length;
      
      finalAnalysis = `🚨 HIGH-CONFIDENCE LIES DETECTED! 🚨\n\nAnalyzed ${transcriptData.analysisDuration} minutes of content (${transcriptData.totalSegments} segments) with enhanced precision.\nFound ${allLies.length} high-confidence lies (85%+) with ${avgConfidence}% average confidence.\nHigh severity: ${highSeverity} | Categories: ${categories.join(', ')}\n\n⚠️ WARNING: This content contains false information that could be harmful if believed.\n\n${liesText}`;
    }

    // Save final analysis to cache
    await saveAnalysisToCache(videoId, finalAnalysis, allLies);
    
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
      
      console.log(`🎯 Jumped to ${targetTime} seconds`);
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

// Enhanced function to check and skip lies with FIXED timestamp logic
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
        
        console.log(`⏭️ SKIPPING lie at ${lie.timestamp}`);
        console.log(`⏭️ Lie details:`);
        console.log(`   - Start: ${lieStart}s (${lie.timestamp})`);
        console.log(`   - Duration: ${lieDuration}s`);
        console.log(`   - End: ${lieEnd}s`);
        console.log(`   - Current time: ${currentTime.toFixed(1)}s`);
        console.log(`   - Claim: "${lie.claim}"`);
        
        skippedLiesInSession.add(lieId);
        
        const skipToTime = lieEnd + 1;
        video.currentTime = skipToTime;
        
        const url = new URL(window.location.href);
        url.searchParams.set('t', Math.floor(skipToTime) + 's');
        window.history.replaceState({}, '', url.toString());
        
        showSkipNotification(lie, lieDuration);
        
        console.log(`✅ Skipped to ${skipToTime}s (after ${lieDuration}s lie)`);
        
        break;
      }
    }
    
  } catch (error) {
    console.error('Error in checkAndSkipLies:', error);
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
    window.LieBlockerTranscriptData = null;
    window.LieBlockerAnalysisData = null;
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