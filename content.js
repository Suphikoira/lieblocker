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

// Enhanced function to create 5-minute chunks with context preservation
function create5MinuteChunks(transcript) {
  const chunks = [];
  const CHUNK_DURATION = 300; // 5 minutes = 300 seconds per chunk
  const CONTEXT_OVERLAP = 30; // 30 seconds of overlap for context preservation
  const DEMO_LIMIT_MINUTES = 20; // DEMO LIMIT: Only analyze first 20 minutes (4 chunks)
  
  if (!transcript || transcript.length === 0) {
    return chunks;
  }
  
  // Sort transcript by start time to ensure proper ordering
  const sortedTranscript = [...transcript].sort((a, b) => a.start - b.start);
  
  // Get the total duration but apply demo limit
  const lastSegment = sortedTranscript[sortedTranscript.length - 1];
  const totalDuration = lastSegment.start + (lastSegment.duration || 5);
  
  // Apply demo limit - only analyze first 20 minutes
  const limitedDuration = Math.min(totalDuration, DEMO_LIMIT_MINUTES * 60);
  const actualChunks = Math.ceil(limitedDuration / CHUNK_DURATION);
  
  console.log(`📊 Creating 5-minute chunks for ${actualChunks} chunks of content (DEMO LIMIT: 20 minutes max)`);
  console.log(`📊 Original video duration: ${Math.ceil(totalDuration / 60)} minutes, analyzing: ${Math.ceil(limitedDuration / 60)} minutes`);
  
  // Create chunks every 5 minutes (limited to 20 minutes)
  for (let startTime = 0; startTime < limitedDuration; startTime += CHUNK_DURATION) {
    const endTime = Math.min(startTime + CHUNK_DURATION, limitedDuration);
    const contextStartTime = Math.max(0, startTime - CONTEXT_OVERLAP);
    const contextEndTime = Math.min(endTime + CONTEXT_OVERLAP, limitedDuration);
    
    // Get segments for this time window (with context)
    const contextSegments = sortedTranscript.filter(segment => 
      segment.start >= contextStartTime && segment.start < contextEndTime
    );
    
    // Get main segments (without context overlap)
    const mainSegments = sortedTranscript.filter(segment => 
      segment.start >= startTime && segment.start < endTime
    );
    
    if (mainSegments.length === 0) {
      continue; // Skip empty chunks
    }
    
    // Build the text with context markers
    let chunkText = '';
    let mainText = '';
    let segmentTimestamps = [];
    
    // Add context before (if any)
    const beforeContext = contextSegments.filter(s => s.start < startTime);
    if (beforeContext.length > 0) {
      const contextText = beforeContext.map(s => s.text).join(' ');
      chunkText += `[Context: ${contextText}] `;
    }
    
    // Add main content with detailed timestamp tracking
    for (const segment of mainSegments) {
      const segmentText = segment.text.trim();
      if (segmentText) {
        mainText += (mainText ? ' ' : '') + segmentText;
        segmentTimestamps.push({
          text: segmentText,
          timestamp: segment.start,
          isMain: true,
          words: segmentText.split(' ').map(word => word.toLowerCase())
        });
      }
    }
    
    chunkText += mainText;
    
    // Add context after (if any)
    const afterContext = contextSegments.filter(s => s.start >= endTime);
    if (afterContext.length > 0) {
      const contextText = afterContext.map(s => s.text).join(' ');
      chunkText += ` [Context: ${contextText}]`;
    }
    
    // Create chunk with enhanced metadata
    const chunkStartTime = mainSegments[0].start;
    const chunkEndTime = mainSegments[mainSegments.length - 1].start;
    const startMinutes = Math.floor(chunkStartTime / 60);
    const startSeconds = Math.floor(chunkStartTime % 60);
    const endMinutes = Math.floor(chunkEndTime / 60);
    const endSeconds = Math.floor(chunkEndTime % 60);
    
    chunks.push({
      text: chunkText.trim(),
      mainText: mainText.trim(), // Text without context markers
      startTimestamp: `${startMinutes}:${startSeconds.toString().padStart(2, '0')}`,
      endTimestamp: `${endMinutes}:${endSeconds.toString().padStart(2, '0')}`,
      startTime: chunkStartTime,
      endTime: chunkEndTime,
      segmentTimestamps: segmentTimestamps,
      chunkIndex: chunks.length + 1,
      timeWindow: `${startMinutes}:${startSeconds.toString().padStart(2, '0')} - ${endMinutes}:${endSeconds.toString().padStart(2, '0')}`,
      hasContext: beforeContext.length > 0 || afterContext.length > 0
    });
  }
  
  console.log(`✅ Created ${chunks.length} 5-minute chunks with context preservation (DEMO LIMITED to ${actualChunks} chunks)`);
  return chunks;
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

// Function to save analysis results to cache with incremental updates
async function saveAnalysisToCache(videoId, analysisText, lies = [], isIncremental = false) {
  try {
    let cacheData;
    
    if (isIncremental) {
      // Get existing cache and append new data
      const existing = await getCachedAnalysis(videoId);
      if (existing) {
        cacheData = {
          ...existing,
          analysis: existing.analysis + '\n\n' + analysisText,
          claims: [...(existing.claims || []), ...lies],
          lastUpdated: Date.now()
        };
      } else {
        cacheData = {
          analysis: analysisText,
          claims: lies,
          timestamp: Date.now(),
          videoId: videoId,
          processed: Date.now(),
          version: '2.1',
          lastUpdated: Date.now()
        };
      }
    } else {
      cacheData = {
        analysis: analysisText,
        claims: lies,
        timestamp: Date.now(),
        videoId: videoId,
        processed: Date.now(),
        version: '2.1',
        lastUpdated: Date.now()
      };
    }
    
    await chrome.storage.local.set({
      [`analysis_${videoId}`]: cacheData
    });
    
    console.log('💾 Analysis saved to cache for video:', videoId);
    console.log('💾 Total lies saved:', cacheData.claims.length);
    
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

// Enhanced system prompt function focused on lies detection with 5-minute chunks
function buildSystemPrompt(sensitivity) {
  const baseSensitivity = {
    conservative: {
      threshold: 'extremely high confidence (95%+)',
      focus: 'only the most egregious and demonstrably false claims with overwhelming evidence',
      description: 'Be extremely selective and only flag claims that are demonstrably false with overwhelming evidence and pose significant harm potential'
    },
    balanced: {
      threshold: 'very high confidence (85%+)',
      focus: 'clearly false claims with strong evidence and significant impact',
      description: 'Flag claims that are clearly false with strong evidence and have potential for significant misinformation impact'
    },
    aggressive: {
      threshold: 'high confidence (75%+)',
      focus: 'false or highly misleading claims with substantial evidence',
      description: 'Flag claims that are false or highly misleading with substantial evidence against them'
    }
  };

  const config = baseSensitivity[sensitivity] || baseSensitivity.balanced;

  return `You are an expert fact-checker specializing in detecting LIES in video content. Your mission is to identify ${config.focus} with ${config.threshold}.

${config.description}.

LIES DETECTION CRITERIA:
- ONLY flag claims that are factually incorrect with strong evidence
- Focus on claims that could cause significant harm if believed
- Prioritize claims about health, safety, science, politics, or financial advice
- Ignore opinions, predictions, or subjective statements
- Require ${config.threshold} before flagging anything
- Consider the potential impact and reach of the misinformation

5-MINUTE CHUNK ANALYSIS INSTRUCTIONS:
- You are analyzing approximately 5 minutes of video content at a time
- Context from adjacent chunks is provided in [Context: ...] markers - use this for understanding but don't fact-check context content
- Focus your fact-checking on the main content (outside context markers)
- The content represents a continuous conversation/presentation, so consider the flow of ideas
- Each chunk covers a substantial portion of content, allowing for comprehensive analysis

TIMESTAMP AND DURATION INSTRUCTIONS:
- You will receive text with a time window (e.g., "5:30 - 10:30" for a 5-minute chunk)
- When you identify a lie, provide the EXACT timestamp when the lie BEGINS
- ALWAYS provide "timestamp" (MM:SS format), "timeInSeconds" (total seconds), and "duration" (seconds) for each lie
- Duration should reflect how long the false claim is being made (typically 5-30 seconds)
- Be PRECISE with timestamps - they must correspond to when the lie STARTS being spoken
- The timestamp should be the START of the lie, not the middle or end

RESPONSE FORMAT:
Respond with a JSON object containing an array of lies. Each lie should have:
- "timestamp": The exact timestamp when the lie STARTS (e.g., "7:34")
- "timeInSeconds": Timestamp converted to seconds (e.g., 454)
- "duration": How long the lie lasts in seconds (e.g., 15)
- "claim": The specific false statement (be precise and quote directly)
- "explanation": Brief fact-check explaining why this is false (1 sentence max)
- "confidence": Your confidence level (0.75-1.0 for lies only)
- "severity": Always "critical" for flagged content

GUIDELINES:
- Only flag factual claims that are demonstrably false
- Require ${config.threshold} before flagging
- Focus on verifiable facts vs. speculation
- Consider the context and speaker's intent
- Prioritize claims with high harm potential
- Use the provided segment timestamps for accurate timing
- Don't fact-check content within [Context: ...] markers
- If no lies are found, return an empty claims array
- Keep explanations brief and factual
- ENSURE timestamps and durations are accurate to when the lie STARTS being spoken

Example response:
{
  "claims": [
    {
      "timestamp": "7:23",
      "timeInSeconds": 443,
      "duration": 12,
      "claim": "Vaccines contain microchips that track your location",
      "explanation": "Vaccines contain biological components to stimulate immunity, not electronic devices.",
      "confidence": 0.98,
      "severity": "critical"
    }
  ]
}`;
}

// Enhanced function to find the best timestamp for a claim within a chunk
function findClaimTimestamp(claim, chunk) {
  console.log(`🔍 Finding timestamp for claim: "${claim}"`);
  console.log(`🔍 Chunk time window: ${chunk.timeWindow}`);
  
  // Extract key words from the claim (remove common words)
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those'];
  const claimWords = claim.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !commonWords.includes(word));
  
  console.log(`🔍 Key words from claim: ${claimWords.join(', ')}`);
  
  // Look for the claim text in the segment timestamps (main content only)
  let bestMatch = chunk.startTime;
  let bestScore = 0;
  let bestSegment = null;
  
  for (const segment of chunk.segmentTimestamps || []) {
    if (!segment.isMain) continue; // Skip context segments
    
    const segmentText = segment.text.toLowerCase();
    let score = 0;
    
    // Count matching words with weighted scoring
    for (const word of claimWords) {
      if (segmentText.includes(word)) {
        // Give higher score for exact word matches
        const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
        if (wordRegex.test(segmentText)) {
          score += 2; // Exact word match
        } else {
          score += 1; // Partial match
        }
      }
    }
    
    // Bonus for longer matches
    if (score > 0) {
      const matchRatio = score / claimWords.length;
      score = score * (1 + matchRatio);
    }
    
    console.log(`🔍 Segment "${segment.text}" at ${segment.timestamp}s: score ${score}`);
    
    // If this segment has more matching words, use its timestamp
    if (score > bestScore) {
      bestScore = score;
      bestMatch = segment.timestamp;
      bestSegment = segment;
    }
  }
  
  // If no good match found, use the start of the chunk (not middle)
  if (bestScore === 0) {
    bestMatch = chunk.startTime;
    console.log(`🔍 No good match found, using chunk start: ${bestMatch}s`);
  } else {
    console.log(`🔍 Best match found in segment: "${bestSegment.text}" at ${bestMatch}s (score: ${bestScore})`);
  }
  
  return Math.round(bestMatch);
}

// Function to analyze lies in text with enhanced 5-minute chunk processing
async function analyzeLies(text, timeWindow, sensitivity = 'balanced', chunk = null) {
  try {
    // Get AI provider and model settings
    const settings = await chrome.storage.sync.get(['aiProvider', 'openaiModel', 'geminiModel']);
    const provider = settings.aiProvider || 'openai';
    
    let model;
    if (provider === 'openai') {
      model = settings.openaiModel || 'gpt-4.1-mini'; // Default to GPT-4.1 Mini
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

    console.log('Analyzing lies with sensitivity:', sensitivity);
    console.log('Time window:', timeWindow);
    console.log(`Using ${provider} model:`, model);
    
    const systemPrompt = buildSystemPrompt(sensitivity);
    const userContent = `Time Window: ${timeWindow}\n\nTranscript: ${text}`;
    
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
          }]
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
          }]
        })
      });
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    let content;
    
    if (provider === 'openai') {
      content = data.choices[0].message.content;
    } else if (provider === 'gemini') {
      content = data.candidates[0].content.parts[0].text;
    }
    
    // Try to parse JSON response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedResult = JSON.parse(jsonMatch[0]);
        
        // Post-process lies to ensure accurate timestamps and durations
        if (parsedResult.claims && chunk) {
          parsedResult.claims = parsedResult.claims.map(claim => {
            let finalTimeInSeconds;
            let finalTimestamp;
            let finalDuration = claim.duration || 10; // Default 10 seconds if not provided
            
            // CRITICAL FIX: Ensure we use the START timestamp, not adjusted by duration
            if (claim.timeInSeconds && claim.timeInSeconds > 0) {
              // Check if the AI timestamp is within the chunk bounds
              if (claim.timeInSeconds >= chunk.startTime && claim.timeInSeconds <= chunk.endTime) {
                finalTimeInSeconds = Math.round(claim.timeInSeconds);
                console.log(`✅ AI provided valid timestamp: ${finalTimeInSeconds}s (within chunk bounds ${chunk.startTime}-${chunk.endTime}s)`);
              } else {
                console.log(`⚠️ AI timestamp ${claim.timeInSeconds}s outside chunk bounds (${chunk.startTime}-${chunk.endTime}s), finding better match`);
                finalTimeInSeconds = findClaimTimestamp(claim.claim, chunk);
              }
            } else {
              // AI didn't provide a good timestamp, find it ourselves
              console.log(`⚠️ AI didn't provide valid timestamp, finding match for: "${claim.claim}"`);
              finalTimeInSeconds = findClaimTimestamp(claim.claim, chunk);
            }
            
            // Convert seconds to MM:SS format
            const minutes = Math.floor(finalTimeInSeconds / 60);
            const seconds = finalTimeInSeconds % 60;
            finalTimestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            console.log(`🎯 Final lie details:`);
            console.log(`   - Timestamp: ${finalTimestamp} (${finalTimeInSeconds}s)`);
            console.log(`   - Duration: ${finalDuration}s`);
            console.log(`   - Claim: "${claim.claim}"`);
            
            return {
              ...claim,
              timestamp: finalTimestamp,
              timeInSeconds: finalTimeInSeconds,
              duration: finalDuration,
              severity: 'critical', // Ensure all flagged content is marked as critical
              chunkAnalyzed: chunk.chunkIndex // Track which chunk this came from
            };
          });
        }
        
        return parsedResult;
      }
    } catch (parseError) {
      console.warn('Could not parse JSON response, returning raw content');
    }
    
    return { claims: [], rawContent: content };
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
    currentStats.highSeverity += newLies.filter(c => c.severity === 'critical').length;
    currentStats.timeSaved += Math.floor(newLies.length * 0.5); // Estimate time saved
    
    await chrome.storage.local.set({ sessionStats: currentStats });
    
    // Notify popup of stats update
    chrome.runtime.sendMessage({ type: 'STATS_UPDATE' });
    
  } catch (error) {
    console.error('Error updating session stats:', error);
  }
}

// Enhanced main function to process video with 5-minute chunk lies detection
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

    // Notify background script that analysis is starting
    chrome.runtime.sendMessage({
      type: 'startAnalysis',
      videoId: videoId
    });

    // Check for cached analysis first
    chrome.runtime.sendMessage({
      type: 'analysisResult',
      data: 'Checking for cached analysis...'
    });

    const cachedAnalysis = await getCachedAnalysis(videoId);
    if (cachedAnalysis) {
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: 'Loading cached analysis results...'
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
      
      // Display cached results
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: cachedAnalysis.analysis + '\n\nAnalysis loaded from cache!'
      });
      return;
    }

    // No cache found, proceed with fresh analysis
    chrome.runtime.sendMessage({
      type: 'analysisResult',
      data: 'Extracting video transcript using Supadata API...'
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
      type: 'analysisResult',
      data: 'Creating 5-minute analysis chunks with context preservation...'
    });

    // Create 5-minute chunks with context preservation
    const chunks = create5MinuteChunks(transcript);
    
    if (chunks.length === 0) {
      chrome.runtime.sendMessage({
        type: 'analysisResult',
        data: 'No analyzable content found in transcript.'
      });
      return;
    }
    
    // Get sensitivity setting
    const settings = await chrome.storage.sync.get(['globalSensitivity']);
    const sensitivity = settings.globalSensitivity || 'balanced';
    
    chrome.runtime.sendMessage({
      type: 'analysisResult',
      data: `🚨 Starting 5-minute chunk lies detection of ${chunks.length} chunks with ${sensitivity} threshold...`
    });

    // Analyze each 5-minute chunk for lies
    let allLies = [];
    let processedChunks = 0;
    
    for (const [index, chunk] of chunks.entries()) {
      try {
        const currentChunk = index + 1;
        chrome.runtime.sendMessage({
          type: 'analysisResult',
          data: `🕐 Analyzing chunk ${currentChunk}/${chunks.length} for lies (${chunk.timeWindow})...`
        });

        const analysis = await analyzeLies(chunk.text, chunk.timeWindow, sensitivity, chunk);
        processedChunks++;
        
        if (analysis && analysis.claims && analysis.claims.length > 0) {
          // Ensure each lie has proper timestamp data
          const processedLies = analysis.claims.map(claim => {
            console.log(`🚨 Lie timestamp: ${claim.timestamp} (${claim.timeInSeconds}s) duration: ${claim.duration}s in chunk ${currentChunk}`);
            
            return {
              ...claim,
              chunkAnalyzed: currentChunk,
              severity: 'critical' // Ensure all detected lies are marked as critical
            };
          });
          
          allLies.push(...processedLies);
          
          // Send real-time lies update to popup
          chrome.runtime.sendMessage({
            type: 'liesUpdate',
            claims: allLies, // Send all lies so far
            totalClaims: allLies.length,
            processedChunks: processedChunks,
            totalChunks: chunks.length,
            isComplete: false
          });
          
          // Save incremental progress to cache
          await saveAnalysisToCache(videoId, '', processedLies, true);
          
          // Send intermediate results with real-time updates
          const liesText = processedLies.map(claim => 
            `🚨 ${claim.timestamp} - Duration: ${claim.duration}s\n🚫 Lie: ${claim.claim}\n🎯 Confidence: ${Math.round(claim.confidence * 100)}%\n💡 ${claim.explanation}`
          ).join('\n\n');
          
          chrome.runtime.sendMessage({
            type: 'analysisResult',
            data: `🚨 LIES DETECTED - Chunk ${currentChunk} 🚨\n${liesText}\n`
          });
        } else {
          // No lies found in this chunk
          chrome.runtime.sendMessage({
            type: 'analysisResult',
            data: `✅ Chunk ${currentChunk} analyzed - no lies detected`
          });
        }
        
        // Brief pause between API calls to avoid rate limiting
        if (index < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`Error processing chunk ${index + 1}:`, error);
        chrome.runtime.sendMessage({
          type: 'analysisResult',
          data: `⚠️ Error analyzing chunk ${index + 1}: ${error.message}`
        });
      }
    }

    // Prepare final analysis
    let finalAnalysis;
    if (allLies.length === 0) {
      finalAnalysis = `✅ 5-minute chunk lies detection complete!\n\nAnalyzed ${processedChunks} chunks of content (20 minutes total).\nNo lies were identified in this video.\n\nThis content appears to be factually accurate based on our high-confidence detection criteria.`;
    } else {
      // Sort lies by timestamp for final display
      allLies.sort((a, b) => a.timeInSeconds - b.timeInSeconds);
      
      const liesText = allLies.map((claim, index) => 
        `${index + 1}. 🚨 ${claim.timestamp} (${claim.duration}s)\n🚫 Lie: ${claim.claim}\n🎯 Confidence: ${Math.round(claim.confidence * 100)}%\n💡 ${claim.explanation}`
      ).join('\n\n');
      
      const avgConfidence = Math.round(allLies.reduce((sum, c) => sum + c.confidence, 0) / allLies.length * 100);
      
      finalAnalysis = `🚨 LIES DETECTED! 🚨\n\nAnalyzed ${processedChunks} chunks of content (20 minutes total).\nFound ${allLies.length} lies with ${avgConfidence}% average confidence.\n\n⚠️ WARNING: This content contains high-confidence false information that could be harmful if believed.\n\n${liesText}`;
    }

    // Send final lies update
    chrome.runtime.sendMessage({
      type: 'liesUpdate',
      claims: allLies,
      totalClaims: allLies.length,
      processedChunks: processedChunks,
      totalChunks: chunks.length,
      isComplete: true
    });

    // Save final analysis to cache
    await saveAnalysisToCache(videoId, finalAnalysis, allLies, false);
    
    // Update session stats
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
let skippedLiesInSession = new Set(); // Track skipped lies by their unique identifier

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
  skippedLiesInSession.clear(); // Reset skipped lies for new session
  console.log('🚀 Skip mode monitoring started with', currentVideoLies.length, 'lies to monitor');
  
  // Clear any existing interval
  if (skipModeInterval) {
    clearInterval(skipModeInterval);
  }
  
  // Check every 250ms for better accuracy
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
    
    // Only skip if video is actually playing
    if (!isPlaying) {
      return;
    }
    
    // Check if current time falls within any lie segment
    for (const lie of currentVideoLies) {
      const lieStart = lie.timeInSeconds; // This is the START of the lie
      const lieDuration = lie.duration || 10; // Default 10 seconds if no duration
      const lieEnd = lieStart + lieDuration; // This is the END of the lie
      const lieId = createLieId(lie);
      
      // CRITICAL FIX: Check if we're currently in a lie segment
      // The lie starts at lieStart and ends at lieEnd
      if (currentTime >= lieStart && currentTime < lieEnd) {
        // Check if we've already skipped this lie in this session
        if (skippedLiesInSession.has(lieId)) {
          // Already skipped this lie, don't skip again
          continue;
        }
        
        console.log(`⏭️ SKIPPING lie at ${lie.timestamp}`);
        console.log(`⏭️ Lie details:`);
        console.log(`   - Start: ${lieStart}s (${lie.timestamp})`);
        console.log(`   - Duration: ${lieDuration}s`);
        console.log(`   - End: ${lieEnd}s`);
        console.log(`   - Current time: ${currentTime.toFixed(1)}s`);
        console.log(`   - Claim: "${lie.claim}"`);
        
        // Mark this lie as skipped
        skippedLiesInSession.add(lieId);
        
        // Jump to the end of the lie segment (AFTER the lie finishes)
        const skipToTime = lieEnd + 1; // Add 1 second buffer
        video.currentTime = skipToTime;
        
        // Update URL to reflect new timestamp
        const url = new URL(window.location.href);
        url.searchParams.set('t', Math.floor(skipToTime) + 's');
        window.history.replaceState({}, '', url.toString());
        
        // Show notification about the skip
        showSkipNotification(lie, lieDuration);
        
        console.log(`✅ Skipped to ${skipToTime}s (after ${lieDuration}s lie)`);
        
        // Only skip one lie at a time
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
    // Create notification element
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
    
    // Add CSS animation
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
    
    // Remove notification after 3 seconds
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
    // Start skip mode if we have lies
    if (currentVideoLies && currentVideoLies.length > 0) {
      startSkipModeMonitoring();
    }
  } else {
    // Stop skip mode
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
  // Reset skip mode state when navigating to a new video
  const currentVideoId = new URLSearchParams(window.location.href.split('?')[1]).get('v');
  
  if (currentVideoId !== lastVideoId) {
    console.log('🔄 New video detected, resetting skip mode state');
    stopSkipModeMonitoring();
    currentVideoLies = [];
    skippedLiesInSession.clear();
    lastVideoId = currentVideoId;
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