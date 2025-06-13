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

// Function to prepare full transcript for analysis (limited to 20 minutes)
function prepareFullTranscript(transcript) {
  const DEMO_LIMIT_MINUTES = 20; // DEMO LIMIT: Only analyze first 20 minutes
  
  if (!transcript || transcript.length === 0) {
    return null;
  }
  
  // Sort transcript by start time to ensure proper ordering
  const sortedTranscript = [...transcript].sort((a, b) => a.start - b.start);
  
  // Apply demo limit - only analyze first 20 minutes
  const limitedDuration = DEMO_LIMIT_MINUTES * 60; // 20 minutes in seconds
  const filteredTranscript = sortedTranscript.filter(segment => 
    segment.start < limitedDuration
  );
  
  if (filteredTranscript.length === 0) {
    return null;
  }
  
  console.log(`📊 Preparing full transcript analysis for ${DEMO_LIMIT_MINUTES} minutes`);
  console.log(`📊 Processing ${filteredTranscript.length} transcript segments`);
  
  // Build the full text with precise timestamp mapping
  let fullText = '';
  let segmentTimestamps = [];
  let wordToTimestampMap = new Map(); // Map words to their timestamps
  
  for (const segment of filteredTranscript) {
    const segmentText = segment.text.trim();
    if (segmentText) {
      const words = segmentText.split(/\s+/);
      const segmentStartPos = fullText.length;
      
      // Add space if not first segment
      if (fullText) {
        fullText += ' ';
      }
      
      // Add the segment text
      fullText += segmentText;
      
      // Create detailed word mapping for precise timestamp matching
      let wordStartPos = segmentStartPos + (fullText.length > segmentText.length ? 1 : 0);
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordEndPos = wordStartPos + word.length;
        
        // Map each word position to its timestamp
        for (let pos = wordStartPos; pos < wordEndPos; pos++) {
          wordToTimestampMap.set(pos, segment.start);
        }
        
        // Move to next word position (including space)
        wordStartPos = wordEndPos + 1;
      }
      
      segmentTimestamps.push({
        text: segmentText,
        timestamp: segment.start,
        startPos: segmentStartPos,
        endPos: fullText.length,
        words: words.map(word => word.toLowerCase().replace(/[^\w]/g, ''))
      });
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
    wordToTimestampMap: wordToTimestampMap,
    timeWindow: `0:00 - ${endMinutes}:${endSeconds.toString().padStart(2, '0')}`,
    totalSegments: filteredTranscript.length
  };
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

// Enhanced system prompt function with improved lie detection criteria
function buildSystemPrompt(sensitivity) {
  const baseSensitivity = {
    conservative: {
      threshold: 'extremely high confidence (95%+)',
      focus: 'only the most egregious and demonstrably false claims with overwhelming evidence',
      description: 'Be extremely selective and only flag claims that are demonstrably false with overwhelming evidence and pose significant harm potential',
      examples: 'medical misinformation that could cause harm, completely fabricated historical events, dangerous conspiracy theories with no factual basis'
    },
    balanced: {
      threshold: 'very high confidence (85%+)',
      focus: 'clearly false claims with strong evidence and significant impact',
      description: 'Flag claims that are clearly false with strong evidence and have potential for significant misinformation impact',
      examples: 'false scientific claims, incorrect financial advice, misleading health information, fabricated news events'
    },
    aggressive: {
      threshold: 'high confidence (75%+)',
      focus: 'false or highly misleading claims with substantial evidence',
      description: 'Flag claims that are false or highly misleading with substantial evidence against them',
      examples: 'misleading statistics, exaggerated claims, selective presentation of facts, unsubstantiated assertions'
    }
  };

  const config = baseSensitivity[sensitivity] || baseSensitivity.balanced;

  return `You are an expert fact-checker and misinformation detection specialist. Your mission is to identify ${config.focus} with ${config.threshold}.

CORE MISSION: ${config.description}

DETECTION CRITERIA (STRICT):
1. FACTUAL ACCURACY: Only flag claims that are objectively, verifiably false
2. EVIDENCE REQUIREMENT: Must have strong, credible evidence contradicting the claim
3. HARM POTENTIAL: Prioritize claims that could cause significant harm if believed
4. CONFIDENCE THRESHOLD: Require ${config.threshold} before flagging anything
5. CONTEXT AWARENESS: Consider speaker intent, audience, and presentation context

PRIORITY CATEGORIES:
- Health & Medical: False treatments, dangerous remedies, vaccine misinformation
- Science & Technology: Debunked theories, impossible claims, fabricated research
- Financial: Investment scams, false economic data, misleading financial advice
- Politics & Current Events: Fabricated news, false statistics, conspiracy theories
- Safety & Security: Dangerous instructions, false emergency information

EXAMPLES OF FLAGGABLE CONTENT (${sensitivity} threshold):
${config.examples}

WHAT NOT TO FLAG:
- Opinions, personal beliefs, or subjective statements
- Predictions about future events (unless claiming certainty about unknowable futures)
- Hyperbole, metaphors, or obvious exaggerations for effect
- Disputed topics where experts disagree
- Statements that are technically true but misleading (unless extremely harmful)
- Religious, philosophical, or ideological beliefs
- Jokes, satire, or clearly entertainment content

TIMESTAMP PRECISION REQUIREMENTS:
- Analyze the complete 20-minute transcript with precise word-level mapping
- When identifying a lie, find the EXACT moment the false statement begins
- Use the provided word-to-timestamp mapping for surgical precision
- Provide timestamps in MM:SS format (e.g., "7:23")
- Include timeInSeconds as total seconds from video start
- Estimate duration based on how long the false claim is elaborated upon
- Default duration: 8-15 seconds for simple claims, 15-30 seconds for complex lies

RESPONSE FORMAT (JSON ONLY):
{
  "claims": [
    {
      "timestamp": "MM:SS format when lie STARTS",
      "timeInSeconds": total_seconds_from_start,
      "duration": estimated_duration_in_seconds,
      "claim": "Exact quote of the false statement",
      "explanation": "Concise fact-check (max 2 sentences)",
      "confidence": confidence_score_0.75_to_1.0,
      "severity": "critical",
      "category": "health|science|financial|political|safety|other"
    }
  ]
}

QUALITY ASSURANCE:
- Double-check each flagged claim against established facts
- Ensure timestamps correspond to when the lie actually begins
- Verify confidence scores match the evidence strength
- Confirm each claim meets the ${config.threshold} threshold
- If uncertain, DO NOT flag - false positives harm credibility

Remember: Your role is to protect people from harmful misinformation while respecting legitimate discourse. Be precise, be confident, and be helpful.`;
}

// Enhanced function to find precise timestamp for a claim using word-level mapping
function findClaimTimestamp(claim, transcriptData) {
  console.log(`🔍 Finding precise timestamp for claim: "${claim}"`);
  
  // Clean and normalize the claim text
  const normalizedClaim = claim.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Extract key phrases (3+ word sequences) and individual words
  const claimWords = normalizedClaim.split(/\s+/).filter(word => word.length > 2);
  const claimPhrases = [];
  
  // Generate 3-word phrases for better matching
  for (let i = 0; i <= claimWords.length - 3; i++) {
    claimPhrases.push(claimWords.slice(i, i + 3).join(' '));
  }
  
  console.log(`🔍 Key phrases: ${claimPhrases.join(', ')}`);
  console.log(`🔍 Key words: ${claimWords.join(', ')}`);
  
  let bestMatch = transcriptData.startTime;
  let bestScore = 0;
  let bestSegment = null;
  
  // First, try to find phrase matches (more accurate)
  for (const segment of transcriptData.segmentTimestamps) {
    const segmentText = segment.text.toLowerCase();
    let score = 0;
    
    // Check for phrase matches (higher weight)
    for (const phrase of claimPhrases) {
      if (segmentText.includes(phrase)) {
        score += 10; // High score for phrase matches
        console.log(`🎯 Found phrase "${phrase}" in segment at ${segment.timestamp}s`);
      }
    }
    
    // Check for individual word matches
    for (const word of claimWords) {
      const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
      if (wordRegex.test(segmentText)) {
        score += 2; // Lower score for individual words
      }
    }
    
    // Bonus for higher word density
    if (score > 0) {
      const matchRatio = score / (claimWords.length * 2);
      score = score * (1 + matchRatio);
    }
    
    console.log(`🔍 Segment "${segment.text.substring(0, 50)}..." at ${segment.timestamp}s: score ${score}`);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = segment.timestamp;
      bestSegment = segment;
    }
  }
  
  // If we found a good match, try to get more precise timing within the segment
  if (bestScore > 5 && bestSegment) {
    console.log(`🎯 Best match in segment: "${bestSegment.text}" at ${bestMatch}s (score: ${bestScore})`);
    
    // Try to find the exact position within the segment
    const segmentText = bestSegment.text.toLowerCase();
    let earliestMatch = bestMatch;
    
    for (const phrase of claimPhrases) {
      const phraseIndex = segmentText.indexOf(phrase);
      if (phraseIndex !== -1) {
        // Estimate timestamp within segment based on character position
        const segmentDuration = 5; // Assume average 5 seconds per segment
        const relativePosition = phraseIndex / segmentText.length;
        const estimatedOffset = relativePosition * segmentDuration;
        const preciseTimestamp = bestMatch + estimatedOffset;
        
        if (preciseTimestamp < earliestMatch || earliestMatch === bestMatch) {
          earliestMatch = preciseTimestamp;
        }
        
        console.log(`🎯 Found phrase "${phrase}" at position ${phraseIndex}, estimated timestamp: ${preciseTimestamp}s`);
      }
    }
    
    bestMatch = earliestMatch;
  } else {
    console.log(`⚠️ No good match found (score: ${bestScore}), using transcript start: ${bestMatch}s`);
  }
  
  return Math.round(bestMatch);
}

// Function to analyze lies in full transcript with enhanced processing
async function analyzeLies(transcriptData, sensitivity = 'balanced') {
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

    console.log('Analyzing lies with sensitivity:', sensitivity);
    console.log('Time window:', transcriptData.timeWindow);
    console.log(`Using ${provider} model:`, model);
    
    const systemPrompt = buildSystemPrompt(sensitivity);
    
    // Enhanced user content with better structure for AI analysis
    const userContent = `TRANSCRIPT ANALYSIS REQUEST

Time Window: ${transcriptData.timeWindow}
Total Segments: ${transcriptData.totalSegments}
Content Type: YouTube Video Transcript

TRANSCRIPT TEXT:
${transcriptData.text}

ANALYSIS INSTRUCTIONS:
1. Read the entire transcript carefully
2. Identify any factually incorrect statements that meet the ${sensitivity} threshold
3. For each lie found, provide the exact timestamp when it begins
4. Focus on harmful misinformation that could mislead viewers
5. Ignore opinions, predictions, and subjective statements
6. Return results in the specified JSON format only

Remember: Only flag claims you are highly confident are factually incorrect with strong evidence.`;
    
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
          temperature: 0.1, // Low temperature for more consistent, factual responses
          max_tokens: 2000 // Sufficient for detailed analysis
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
            temperature: 0.1,
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
        
        // Enhanced post-processing for accurate timestamps
        if (parsedResult.claims && Array.isArray(parsedResult.claims)) {
          console.log(`🔍 Processing ${parsedResult.claims.length} detected lies for timestamp accuracy`);
          
          parsedResult.claims = parsedResult.claims.map((claim, index) => {
            let finalTimeInSeconds;
            let finalTimestamp;
            let finalDuration = claim.duration || 12; // Default 12 seconds
            
            console.log(`\n🎯 Processing lie ${index + 1}: "${claim.claim}"`);
            
            // Enhanced timestamp finding with multiple strategies
            if (claim.timeInSeconds && claim.timeInSeconds >= transcriptData.startTime && claim.timeInSeconds <= transcriptData.endTime) {
              // AI provided a valid timestamp within bounds
              finalTimeInSeconds = Math.round(claim.timeInSeconds);
              console.log(`✅ Using AI timestamp: ${finalTimeInSeconds}s (within bounds)`);
            } else {
              // Find the best timestamp using enhanced matching
              console.log(`🔍 AI timestamp invalid or missing, finding precise match...`);
              finalTimeInSeconds = findClaimTimestamp(claim.claim, transcriptData);
            }
            
            // Ensure timestamp is within bounds
            finalTimeInSeconds = Math.max(transcriptData.startTime, Math.min(finalTimeInSeconds, transcriptData.endTime));
            
            // Convert to MM:SS format
            const minutes = Math.floor(finalTimeInSeconds / 60);
            const seconds = finalTimeInSeconds % 60;
            finalTimestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Validate and adjust duration
            if (finalDuration < 5) finalDuration = 8; // Minimum 8 seconds
            if (finalDuration > 45) finalDuration = 30; // Maximum 30 seconds
            
            console.log(`🎯 Final lie ${index + 1} details:`);
            console.log(`   - Timestamp: ${finalTimestamp} (${finalTimeInSeconds}s)`);
            console.log(`   - Duration: ${finalDuration}s`);
            console.log(`   - Confidence: ${Math.round((claim.confidence || 0.8) * 100)}%`);
            console.log(`   - Claim: "${claim.claim.substring(0, 100)}..."`);
            
            return {
              ...claim,
              timestamp: finalTimestamp,
              timeInSeconds: finalTimeInSeconds,
              duration: finalDuration,
              severity: 'critical',
              confidence: Math.max(0.75, claim.confidence || 0.8), // Ensure minimum confidence
              category: claim.category || 'other'
            };
          });
          
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
      
      // Display cached results
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
    const transcriptData = prepareFullTranscript(transcript);
    
    if (!transcriptData) {
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
      type: 'analysisProgress',
      stage: 'analysis_start',
      message: `Starting enhanced lie detection with ${sensitivity} threshold...`
    });

    // Analyze the full transcript for lies with enhanced processing
    const analysis = await analyzeLies(transcriptData, sensitivity);
    
    let allLies = [];
    if (analysis && analysis.claims && analysis.claims.length > 0) {
      allLies = analysis.claims.map(claim => ({
        ...claim,
        severity: 'critical' // Ensure all detected lies are marked as critical
      }));
      
      console.log(`✅ Analysis complete: Found ${allLies.length} lies with enhanced timestamp precision`);
    } else {
      console.log('✅ Analysis complete: No lies detected in this video');
    }

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
      finalAnalysis = `✅ Enhanced lie detection complete!\n\nAnalyzed 20 minutes of content (${transcriptData.totalSegments} segments) with precision timestamp mapping.\nNo lies were identified in this video.\n\nThis content appears to be factually accurate based on our enhanced detection criteria.`;
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
          other: '🚨'
        };
        
        return `${index + 1}. ${categoryEmoji[claim.category] || '🚨'} ${claim.timestamp} (${claim.duration}s)\n🚫 Lie: ${claim.claim}\n🎯 Confidence: ${Math.round(claim.confidence * 100)}%\n💡 ${claim.explanation}`;
      }).join('\n\n');
      
      const avgConfidence = Math.round(allLies.reduce((sum, c) => sum + c.confidence, 0) / allLies.length * 100);
      const categories = [...new Set(allLies.map(c => c.category))];
      
      finalAnalysis = `🚨 LIES DETECTED! 🚨\n\nAnalyzed 20 minutes of content (${transcriptData.totalSegments} segments) with enhanced precision.\nFound ${allLies.length} lies with ${avgConfidence}% average confidence.\nCategories: ${categories.join(', ')}\n\n⚠️ WARNING: This content contains high-confidence false information that could be harmful if believed.\n\n${liesText}`;
    }

    // Save final analysis to cache
    await saveAnalysisToCache(videoId, finalAnalysis, allLies);
    
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