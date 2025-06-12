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
    
    // Export transcript to console for debugging and feedback
    exportTranscriptToConsole(response.data, videoId);
    
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

// Function to export transcript to console for debugging and feedback
function exportTranscriptToConsole(transcript, videoId) {
  console.log('\n🎯 ===== TRANSCRIPT EXPORT FOR DEBUGGING =====');
  console.log(`📹 Video ID: ${videoId}`);
  console.log(`📊 Total Segments: ${transcript.length}`);
  console.log('📝 Use this data to verify timestamps and provide feedback\n');
  
  // Create a formatted transcript object for easy inspection
  const formattedTranscript = transcript.map((segment, index) => {
    const minutes = Math.floor(segment.start / 60);
    const seconds = Math.floor(segment.start % 60);
    const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    return {
      index: index + 1,
      timestamp: timestamp,
      timeInSeconds: Math.round(segment.start),
      duration: segment.duration ? Math.round(segment.duration) : 'unknown',
      text: segment.text.trim(),
      // Helper for finding specific content
      words: segment.text.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    };
  });
  
  // Export to global window object for easy access
  window.LieBlockerTranscript = {
    videoId: videoId,
    segments: formattedTranscript,
    totalSegments: transcript.length,
    
    // Helper functions for debugging
    findByText: function(searchText) {
      const search = searchText.toLowerCase();
      return this.segments.filter(segment => 
        segment.text.toLowerCase().includes(search)
      );
    },
    
    findByTimestamp: function(timestamp) {
      if (typeof timestamp === 'string') {
        const parts = timestamp.split(':');
        const seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        return this.segments.find(segment => 
          Math.abs(segment.timeInSeconds - seconds) <= 2
        );
      }
      return this.segments.find(segment => 
        Math.abs(segment.timeInSeconds - timestamp) <= 2
      );
    },
    
    getSegmentRange: function(startTime, endTime) {
      return this.segments.filter(segment => 
        segment.timeInSeconds >= startTime && segment.timeInSeconds <= endTime
      );
    },
    
    exportCSV: function() {
      const csv = [
        'Index,Timestamp,TimeInSeconds,Duration,Text',
        ...this.segments.map(s => 
          `${s.index},"${s.timestamp}",${s.timeInSeconds},${s.duration},"${s.text.replace(/"/g, '""')}"`
        )
      ].join('\n');
      
      console.log('📄 CSV Export:\n', csv);
      return csv;
    },
    
    exportJSON: function() {
      const json = JSON.stringify(this.segments, null, 2);
      console.log('📄 JSON Export:\n', json);
      return json;
    }
  };
  
  // Log the transcript in a readable format
  console.log('📋 TRANSCRIPT SEGMENTS:');
  console.log('Format: [Index] Timestamp (TimeInSeconds) - Text');
  console.log('─'.repeat(80));
  
  formattedTranscript.slice(0, 10).forEach(segment => {
    console.log(`[${segment.index.toString().padStart(3, ' ')}] ${segment.timestamp} (${segment.timeInSeconds}s) - ${segment.text.substring(0, 100)}${segment.text.length > 100 ? '...' : ''}`);
  });
  
  if (formattedTranscript.length > 10) {
    console.log(`... and ${formattedTranscript.length - 10} more segments`);
  }
  
  console.log('─'.repeat(80));
  console.log('\n🔧 DEBUGGING COMMANDS:');
  console.log('• Access full transcript: window.LieBlockerTranscript');
  console.log('• Find text: window.LieBlockerTranscript.findByText("search term")');
  console.log('• Find by time: window.LieBlockerTranscript.findByTimestamp("5:30")');
  console.log('• Get range: window.LieBlockerTranscript.getSegmentRange(300, 600)');
  console.log('• Export CSV: window.LieBlockerTranscript.exportCSV()');
  console.log('• Export JSON: window.LieBlockerTranscript.exportJSON()');
  console.log('\n📝 FEEDBACK INSTRUCTIONS:');
  console.log('1. Find the lie in the transcript using the search functions');
  console.log('2. Note the exact timestamp where the lie begins');
  console.log('3. Compare with the detected timestamp in the extension');
  console.log('4. Report discrepancies for timestamp accuracy improvements');
  console.log('\n🎯 ============================================\n');
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
  
  // Export the filtered transcript for analysis debugging
  console.log('\n🎯 ===== ANALYSIS TRANSCRIPT (20 MIN LIMIT) =====');
  console.log(`📊 Filtered to ${filteredTranscript.length} segments (first 20 minutes)`);
  
  // Build the full text with precise timestamp mapping
  let fullText = '';
  let segmentTimestamps = [];
  let wordToTimestampMap = new Map(); // Map character positions to timestamps
  
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
      
      // Map every character position in this segment to its timestamp
      const actualStartPos = segmentStartPos + (fullText.length > segmentText.length ? 1 : 0);
      for (let pos = actualStartPos; pos < fullText.length; pos++) {
        wordToTimestampMap.set(pos, segment.start);
      }
      
      segmentTimestamps.push({
        text: segmentText,
        timestamp: segment.start,
        startPos: actualStartPos,
        endPos: fullText.length,
        words: segmentText.split(/\s+/).map(word => word.toLowerCase().replace(/[^\w]/g, ''))
      });
    }
  }
  
  const startTime = filteredTranscript[0].start;
  const endTime = Math.min(filteredTranscript[filteredTranscript.length - 1].start, limitedDuration);
  const endMinutes = Math.floor(endTime / 60);
  const endSeconds = Math.floor(endTime % 60);
  
  // Export analysis transcript to console
  window.LieBlockerAnalysisTranscript = {
    fullText: fullText,
    segmentTimestamps: segmentTimestamps,
    wordToTimestampMap: wordToTimestampMap,
    timeWindow: `0:00 - ${endMinutes}:${endSeconds.toString().padStart(2, '0')}`,
    
    // Helper function to find text position and corresponding timestamp
    findTextPosition: function(searchText) {
      const position = this.fullText.toLowerCase().indexOf(searchText.toLowerCase());
      if (position === -1) return null;
      
      const timestamp = this.wordToTimestampMap.get(position);
      const minutes = Math.floor(timestamp / 60);
      const seconds = Math.floor(timestamp % 60);
      
      return {
        position: position,
        timestamp: timestamp,
        formattedTime: `${minutes}:${seconds.toString().padStart(2, '0')}`,
        context: this.fullText.substring(Math.max(0, position - 50), position + 100)
      };
    },
    
    // Helper to validate detected lie timestamps
    validateLieTimestamp: function(claim, detectedTimestamp) {
      const textPosition = this.findTextPosition(claim);
      if (!textPosition) {
        console.log(`❌ Could not find claim "${claim}" in transcript`);
        return false;
      }
      
      const timeDiff = Math.abs(textPosition.timestamp - detectedTimestamp);
      console.log(`🔍 Timestamp Validation:`);
      console.log(`   Claim: "${claim}"`);
      console.log(`   Expected: ${textPosition.formattedTime} (${textPosition.timestamp}s)`);
      console.log(`   Detected: ${Math.floor(detectedTimestamp / 60)}:${(detectedTimestamp % 60).toString().padStart(2, '0')} (${detectedTimestamp}s)`);
      console.log(`   Difference: ${timeDiff.toFixed(1)}s`);
      console.log(`   Context: "${textPosition.context}"`);
      
      return timeDiff <= 10; // Allow 10 second tolerance
    }
  };
  
  console.log('📝 Full analysis text length:', fullText.length, 'characters');
  console.log('🔧 Access analysis transcript: window.LieBlockerAnalysisTranscript');
  console.log('🔧 Find text position: window.LieBlockerAnalysisTranscript.findTextPosition("search text")');
  console.log('🔧 Validate timestamp: window.LieBlockerAnalysisTranscript.validateLieTimestamp("claim", timestampInSeconds)');
  console.log('🎯 ===============================================\n');
  
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
    
    // Export detected lies for debugging
    if (lies.length > 0) {
      console.log('\n🚨 ===== DETECTED LIES FOR VALIDATION =====');
      lies.forEach((lie, index) => {
        console.log(`\n🚨 Lie ${index + 1}:`);
        console.log(`   Timestamp: ${lie.timestamp} (${lie.timeInSeconds}s)`);
        console.log(`   Duration: ${lie.duration}s`);
        console.log(`   Claim: "${lie.claim}"`);
        console.log(`   Confidence: ${Math.round(lie.confidence * 100)}%`);
        console.log(`   Category: ${lie.category}`);
        
        // Validate timestamp if analysis transcript is available
        if (window.LieBlockerAnalysisTranscript) {
          window.LieBlockerAnalysisTranscript.validateLieTimestamp(lie.claim, lie.timeInSeconds);
        }
      });
      console.log('\n🎯 ========================================\n');
    }
    
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

// Enhanced system prompt function with improved timestamp instructions
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

CRITICAL TIMESTAMP INSTRUCTIONS:
⚠️ DO NOT GENERATE OR CALCULATE TIMESTAMPS - ONLY USE EXACT QUOTES ⚠️

When you identify a lie:
1. Quote the EXACT text of the false statement as it appears in the transcript
2. Do NOT provide timestamp, timeInSeconds, or duration fields
3. The system will automatically map your quoted text to the correct timestamp from the original transcript
4. Focus on accuracy of the quoted claim text - timestamps will be handled automatically

RESPONSE FORMAT (JSON ONLY):
{
  "claims": [
    {
      "claim": "EXACT quote of the false statement as it appears in transcript",
      "explanation": "Concise fact-check (max 2 sentences)",
      "confidence": confidence_score_0.75_to_1.0,
      "severity": "critical",
      "category": "health|science|financial|political|safety|other"
    }
  ]
}

JSON FORMATTING RULES:
- Use double quotes for all JSON strings
- For quotes inside claim text, use single quotes or escape properly
- Example: "claim": "He said 'vaccines are dangerous' which is false"
- Keep explanations under 150 characters to avoid parsing issues
- Ensure proper JSON structure with no trailing commas

IMPORTANT: 
- Do NOT include timestamp, timeInSeconds, or duration fields
- Only include the exact quoted text in the "claim" field
- The system will automatically find the precise timestamp from the original transcript
- Focus on identifying false statements with exact quotes

QUALITY ASSURANCE:
- Double-check each flagged claim against established facts
- Ensure quoted text exactly matches what appears in the transcript
- Verify confidence scores match the evidence strength
- Confirm each claim meets the ${config.threshold} threshold
- If uncertain, DO NOT flag - false positives harm credibility

Remember: Your role is to protect people from harmful misinformation while respecting legitimate discourse. Be precise with quotes, be confident in your fact-checking, and let the system handle timestamp mapping.`;
}

// Enhanced function to find precise timestamp using original transcript data
function findClaimTimestampFromOriginal(claim, transcriptData) {
  console.log(`🔍 Finding original transcript timestamp for claim: "${claim}"`);
  
  // Clean and normalize the claim text for better matching
  const normalizedClaim = claim.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Try different matching strategies
  const strategies = [
    // Strategy 1: Exact phrase match
    (segment) => {
      const segmentText = segment.text.toLowerCase();
      return segmentText.includes(normalizedClaim) ? 100 : 0;
    },
    
    // Strategy 2: Partial phrase match (50+ characters)
    (segment) => {
      if (normalizedClaim.length < 50) return 0;
      const segmentText = segment.text.toLowerCase();
      const partialClaim = normalizedClaim.substring(0, 50);
      return segmentText.includes(partialClaim) ? 80 : 0;
    },
    
    // Strategy 3: Word sequence match (5+ consecutive words)
    (segment) => {
      const claimWords = normalizedClaim.split(/\s+/);
      if (claimWords.length < 5) return 0;
      
      const segmentText = segment.text.toLowerCase();
      for (let i = 0; i <= claimWords.length - 5; i++) {
        const wordSequence = claimWords.slice(i, i + 5).join(' ');
        if (segmentText.includes(wordSequence)) {
          return 60;
        }
      }
      return 0;
    },
    
    // Strategy 4: Key word density match
    (segment) => {
      const claimWords = normalizedClaim.split(/\s+/).filter(w => w.length > 3);
      const segmentText = segment.text.toLowerCase();
      
      let matches = 0;
      for (const word of claimWords) {
        if (segmentText.includes(word)) {
          matches++;
        }
      }
      
      const density = matches / claimWords.length;
      return density > 0.6 ? density * 40 : 0;
    }
  ];
  
  let bestMatch = null;
  let bestScore = 0;
  
  // Try each strategy on all segments
  for (const segment of transcriptData.segmentTimestamps) {
    for (const strategy of strategies) {
      const score = strategy(segment);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = segment;
      }
    }
  }
  
  if (bestMatch && bestScore >= 40) {
    console.log(`🎯 Found match with score ${bestScore}: "${bestMatch.text.substring(0, 100)}..." at ${bestMatch.timestamp}s`);
    return bestMatch.timestamp;
  } else {
    console.log(`⚠️ No good match found (best score: ${bestScore}), using transcript start`);
    return transcriptData.startTime;
  }
}

// Function to safely parse AI JSON response with proper error handling
function safeParseAIResponse(content) {
  console.log('🔍 Parsing AI response...');
  
  try {
    // First, try to find JSON block in the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON block found in AI response');
      return { claims: [], rawContent: content, parseError: 'No JSON found' };
    }
    
    let jsonString = jsonMatch[0];
    console.log('📝 Raw JSON string length:', jsonString.length);
    
    // Simple cleanup without problematic regex
    jsonString = jsonString
      // Remove trailing commas before closing braces/brackets
      .replace(/,(\s*[}\]])/g, '$1')
      // Fix common newline issues
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      // Fix multiple spaces
      .replace(/\s+/g, ' ');
    
    console.log('📝 Cleaned JSON string for parsing');
    
    // Try to parse the cleaned JSON
    const parsedResult = JSON.parse(jsonString);
    console.log('✅ Successfully parsed JSON response');
    
    return parsedResult;
    
  } catch (parseError) {
    console.error('❌ JSON parsing failed:', parseError.message);
    console.log('📝 Raw content that failed to parse:', content.substring(0, 500));
    
    // Return empty claims array with error info
    return { 
      claims: [], 
      rawContent: content, 
      parseError: parseError.message 
    };
  }
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
3. For each lie found, quote the EXACT text as it appears in the transcript
4. Do NOT provide timestamps - the system will map your quotes to precise timestamps
5. Focus on harmful misinformation that could mislead viewers
6. Ignore opinions, predictions, and subjective statements
7. Return results in the specified JSON format only

Remember: Only flag claims you are highly confident are factually incorrect with strong evidence. Quote the exact text - timestamps will be handled automatically.`;
    
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
      message: 'Processing AI response and mapping to original timestamps...'
    });

    const data = await response.json();
    let content;
    
    if (provider === 'openai') {
      content = data.choices[0].message.content;
    } else if (provider === 'gemini') {
      content = data.candidates[0].content.parts[0].text;
    }
    
    console.log('🤖 AI Response:', content);
    
    // Use the safe JSON parser
    const parsedResult = safeParseAIResponse(content);
    
    if (parsedResult.parseError) {
      console.error('Failed to parse AI response:', parsedResult.parseError);
      return { claims: [], rawContent: content };
    }
    
    // Enhanced post-processing using original transcript timestamps
    if (parsedResult.claims && Array.isArray(parsedResult.claims)) {
      console.log(`🔍 Processing ${parsedResult.claims.length} detected lies for original timestamp mapping`);
      
      parsedResult.claims = parsedResult.claims.map((claim, index) => {
        console.log(`\n🎯 Processing lie ${index + 1}: "${claim.claim}"`);
        
        // Find the timestamp from the original transcript using the exact claim text
        const originalTimestamp = findClaimTimestampFromOriginal(claim.claim, transcriptData);
        
        // Convert to MM:SS format
        const minutes = Math.floor(originalTimestamp / 60);
        const seconds = originalTimestamp % 60;
        const formattedTimestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Estimate duration based on claim length (8-25 seconds)
        const claimLength = claim.claim.length;
        let estimatedDuration;
        if (claimLength < 100) {
          estimatedDuration = 8;
        } else if (claimLength < 200) {
          estimatedDuration = 12;
        } else if (claimLength < 300) {
          estimatedDuration = 18;
        } else {
          estimatedDuration = 25;
        }
        
        console.log(`🎯 Final lie ${index + 1} details:`);
        console.log(`   - Original Timestamp: ${formattedTimestamp} (${originalTimestamp}s)`);
        console.log(`   - Estimated Duration: ${estimatedDuration}s`);
        console.log(`   - Confidence: ${Math.round((claim.confidence || 0.8) * 100)}%`);
        console.log(`   - Claim: "${claim.claim.substring(0, 100)}..."`);
        
        return {
          ...claim,
          timestamp: formattedTimestamp,
          timeInSeconds: Math.round(originalTimestamp),
          duration: estimatedDuration,
          severity: 'critical',
          confidence: Math.max(0.75, claim.confidence || 0.8), // Ensure minimum confidence
          category: claim.category || 'other'
        };
      });
      
      // Sort by timestamp for logical order
      parsedResult.claims.sort((a, b) => a.timeInSeconds - b.timeInSeconds);
    }
    
    return parsedResult;
    
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
      message: 'Preparing transcript with original timestamp mapping...'
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
      
      console.log(`✅ Analysis complete: Found ${allLies.length} lies with original transcript timestamps`);
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
      finalAnalysis = `✅ Enhanced lie detection complete!\n\nAnalyzed 20 minutes of content (${transcriptData.totalSegments} segments) with original timestamp precision.\nNo lies were identified in this video.\n\nThis content appears to be factually accurate based on our enhanced detection criteria.`;
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
      
      finalAnalysis = `🚨 LIES DETECTED! 🚨\n\nAnalyzed 20 minutes of content (${transcriptData.totalSegments} segments) with original timestamp precision.\nFound ${allLies.length} lies with ${avgConfidence}% average confidence.\nCategories: ${categories.join(', ')}\n\n⚠️ WARNING: This content contains high-confidence false information that could be harmful if believed.\n\n${liesText}`;
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