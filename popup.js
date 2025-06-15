// Enhanced LieBlocker Popup Script focused on Full Video Analysis
console.log('LieBlocker full video analysis popup loaded');

// Global state
let currentStats = {
  videosAnalyzed: 0,
  liesDetected: 0,
  highSeverity: 0,
  timeSaved: 0
};

let feedbackStats = {
  helpful: 0,
  incorrect: 0,
  report: 0
};

// Store current video lies for real-time updates
let currentVideoLies = [];
let isAnalysisRunning = false;
let currentVideoId = null;
let currentAnalysisStage = 'idle';

// AI model configurations with GPT-4.1 Mini as default
const aiModels = {
  openai: {
    'gpt-4.1-mini': {
      name: 'GPT-4.1 Mini',
      description: 'Compact version with good accuracy (Default)'
    },
    'gpt-4.1-nano': {
      name: 'GPT-4.1 Nano',
      description: 'Lightweight and fast model for basic lie detection'
    },
    'o4-mini': {
      name: 'o4-mini',
      description: 'Optimized mini model for efficient processing'
    },
    'gpt-4.1': {
      name: 'GPT-4.1',
      description: 'Full GPT-4.1 model with enhanced reasoning capabilities'
    }
  },
  gemini: {
    'gemini-2.0-flash-exp': {
      name: 'Gemini 2.0 Flash Experimental',
      description: 'Experimental version with cutting-edge features'
    },
    'gemini-2.5-flash': {
      name: 'Gemini 2.5 Flash',
      description: 'Latest Gemini model with enhanced speed and accuracy'
    },
    'gemini-1.5-pro': {
      name: 'Gemini 1.5 Pro',
      description: 'Professional-grade model with high accuracy'
    }
  }
};

// Progress stage configurations for visual cues
const progressStages = {
  idle: { icon: '⏸️', message: 'Ready to analyze', color: '#6c757d' },
  cache_check: { icon: '🔍', message: 'Checking cache...', color: '#17a2b8' },
  cache_found: { icon: '📋', message: 'Loading cached results...', color: '#28a745' },
  transcript_extraction: { icon: '📝', message: 'Extracting transcript...', color: '#ffc107' },
  transcript_preparation: { icon: '⚙️', message: 'Preparing analysis...', color: '#fd7e14' },
  analysis_start: { icon: '🚨', message: 'Starting analysis...', color: '#dc3545' },
  ai_processing: { icon: '🤖', message: 'Processing...', color: '#6f42c1' },
  ai_request: { icon: '📡', message: 'Sending to AI...', color: '#e83e8c' },
  processing_response: { icon: '⚡', message: 'Processing response...', color: '#20c997' },
  complete: { icon: '✅', message: 'Analysis complete', color: '#28a745' },
  error: { icon: '❌', message: 'Analysis failed', color: '#dc3545' }
};

// NEW: Enhanced message sending with retry logic
async function sendMessageToContentScript(message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
        throw new Error('Not on a YouTube video page');
      }
      
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      console.warn(`Message attempt ${i + 1} failed:`, error.message);
      
      if (i === retries - 1) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

// NEW: Check if content script is ready
async function isContentScriptReady() {
  try {
    const response = await sendMessageToContentScript({ type: 'ping' }, 1);
    return response && response.ready;
  } catch (error) {
    return false;
  }
}

// NEW: Wait for content script to be ready
async function waitForContentScript(maxWait = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    if (await isContentScriptReady()) {
      console.log('✅ Content script is ready');
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.warn('⚠️ Content script not ready after timeout');
  return false;
}

// Initialize popup with immediate data loading
document.addEventListener('DOMContentLoaded', async () => {
  // Show loading state initially
  showLoadingState();
  
  try {
    // Load all data in parallel for faster initialization
    const [settingsResult, statsResult, feedbackResult, currentVideoResult, analysisStateResult] = await Promise.all([
      loadSettings(),
      loadStats(),
      loadFeedbackStats(),
      checkCurrentVideoImmediate(),
      checkAnalysisStateImmediate()
    ]);
    
    // Setup UI after data is loaded
    setupTabNavigation();
    setupEventListeners();
    setupRealTimeUpdates();
    setupDownloadLinks();
    setupAnalysisDurationSlider();
    setupSkipLiesToggle();
    
    // Hide loading state
    hideLoadingState();
    
  } catch (error) {
    console.error('Error initializing popup:', error);
    hideLoadingState();
    showNotification('Error loading extension data', 'error');
  }
});

function showLoadingState() {
  // Set initial loading values to prevent 0 flash
  updateStatElement('videos-analyzed', '...');
  updateStatElement('lies-detected', '...');
  updateStatElement('high-severity', '...');
  updateStatElement('time-saved', '...');
  
  const liesCountElement = document.getElementById('lies-count');
  if (liesCountElement) {
    liesCountElement.textContent = '...';
  }
  
  // Show initial progress state
  updateProgressIndicator('idle');
}

function hideLoadingState() {
  // Data should already be loaded by now, so this just ensures UI is ready
  console.log('Popup initialization complete');
}

function setupTabNavigation() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Update tab states
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update content states
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${targetTab}-tab`) {
          content.classList.add('active');
        }
      });
      
      // Load tab-specific data
      if (targetTab === 'lies') {
        renderLiesDetails(currentVideoLies);
      }
    });
  });
}

function setupSkipLiesToggle() {
  const skipToggle = document.getElementById('skip-lies-toggle');
  
  if (skipToggle) {
    // Load current setting
    chrome.storage.sync.get(['detectionMode']).then(settings => {
      const isSkipMode = settings.detectionMode === 'skip';
      skipToggle.classList.toggle('active', isSkipMode);
      console.log('🔧 Skip toggle initialized:', isSkipMode ? 'ON' : 'OFF');
    });
    
    // Handle toggle click
    skipToggle.addEventListener('click', async () => {
      const isCurrentlyActive = skipToggle.classList.contains('active');
      const newMode = isCurrentlyActive ? 'visual' : 'skip';
      
      console.log('🔧 Skip toggle clicked:', newMode);
      
      // Update toggle state
      skipToggle.classList.toggle('active', !isCurrentlyActive);
      
      // Save setting
      await chrome.storage.sync.set({ detectionMode: newMode });
      
      // Notify content script with retry logic
      try {
        await sendMessageToContentScript({ 
          type: 'updateDetectionMode', 
          mode: newMode 
        });
        console.log('✅ Detection mode updated successfully:', newMode);
      } catch (error) {
        console.error('Error updating detection mode:', error);
        showNotification('Could not update detection mode. Please refresh the page.', 'warning');
      }
      
      // Show notification
      const modeText = newMode === 'skip' ? 'Skip Lies Automatically' : 'Visual Warnings Only';
      showNotification(`Mode: ${modeText}`, 'success');
    });
  }
}

function setupAnalysisDurationSlider() {
  const durationSlider = document.getElementById('analysis-duration');
  const durationDisplay = document.getElementById('duration-display');
  
  if (durationSlider && durationDisplay) {
    // Update display when slider changes
    durationSlider.addEventListener('input', (e) => {
      const minutes = parseInt(e.target.value);
      durationDisplay.textContent = `${minutes} min`;
    });
    
    // Save setting when slider changes
    durationSlider.addEventListener('change', async (e) => {
      const minutes = parseInt(e.target.value);
      await chrome.storage.sync.set({ analysisDuration: minutes });
      showNotification(`Analysis duration set to ${minutes} minutes`, 'success');
    });
  }
}

async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get([
      'detectionMode', 'globalSensitivity', 'aiProvider', 'openaiModel', 'geminiModel', 'analysisDuration'
    ]);
    
    // Load analysis duration setting
    const analysisDurationSlider = document.getElementById('analysis-duration');
    const durationDisplay = document.getElementById('duration-display');
    if (analysisDurationSlider && durationDisplay) {
      const duration = settings.analysisDuration || 20; // Default to 20 minutes
      analysisDurationSlider.value = duration;
      durationDisplay.textContent = `${duration} min`;
    }
    
    // Load AI provider selection
    const aiProviderSelect = document.getElementById('ai-provider');
    if (aiProviderSelect && settings.aiProvider) {
      aiProviderSelect.value = settings.aiProvider;
      updateProviderUI(settings.aiProvider);
    } else if (aiProviderSelect) {
      // Set default to OpenAI
      const defaultProvider = 'openai';
      aiProviderSelect.value = defaultProvider;
      updateProviderUI(defaultProvider);
    }
    
    // Load OpenAI model selection with GPT-4.1 Mini as default
    const openaiModelSelect = document.getElementById('openai-model');
    if (openaiModelSelect && settings.openaiModel) {
      openaiModelSelect.value = settings.openaiModel;
    } else if (openaiModelSelect) {
      // Set default to GPT-4.1 Mini
      const defaultModel = 'gpt-4.1-mini';
      openaiModelSelect.value = defaultModel;
      // Save the default setting
      await chrome.storage.sync.set({ openaiModel: defaultModel });
    }
    
    // Load Gemini model selection
    const geminiModelSelect = document.getElementById('gemini-model');
    if (geminiModelSelect && settings.geminiModel) {
      geminiModelSelect.value = settings.geminiModel;
    } else if (geminiModelSelect) {
      // Set default to Gemini 2.0 Flash Experimental
      const defaultModel = 'gemini-2.0-flash-exp';
      geminiModelSelect.value = defaultModel;
    }
    
    // Load API keys for current provider and Supadata
    await loadApiKey(settings.aiProvider || 'openai');
    await loadSupadataToken();
    
    return true;
  } catch (error) {
    console.error('Error loading settings:', error);
    return false;
  }
}

function updateProviderUI(provider) {
  // Handle model selection visibility
  const openaiModels = document.getElementById('openai-models');
  const geminiModels = document.getElementById('gemini-models');
  
  if (openaiModels && geminiModels) {
    if (provider === 'openai') {
      openaiModels.classList.remove('hidden');
      geminiModels.classList.add('hidden');
    } else if (provider === 'gemini') {
      openaiModels.classList.add('hidden');
      geminiModels.classList.remove('hidden');
    }
  }
  
  // Update API key placeholder based on provider
  const apiKeyInput = document.getElementById('api-key');
  if (apiKeyInput) {
    const placeholders = {
      openai: 'Enter your OpenAI API key (sk-...)',
      gemini: 'Enter your Google Gemini API key'
    };
    apiKeyInput.placeholder = placeholders[provider] || 'Enter your API key...';
  }
}

async function loadApiKey(provider) {
  try {
    const result = await chrome.storage.local.get([`${provider}ApiKey`]);
    const apiKeyInput = document.getElementById('api-key');
    if (apiKeyInput && result[`${provider}ApiKey`]) {
      apiKeyInput.value = '••••••••••••••••'; // Masked display
      showApiStatus(true, 'API key configured');
    } else {
      apiKeyInput.value = '';
      showApiStatus(false, 'API key required');
    }
  } catch (error) {
    console.error('Error loading API key:', error);
    showApiStatus(false, 'Error loading API key');
  }
}

async function loadSupadataToken() {
  try {
    const result = await chrome.storage.local.get(['supadataToken']);
    const tokenInput = document.getElementById('supadata-token');
    if (tokenInput && result.supadataToken) {
      tokenInput.value = '••••••••••••••••'; // Masked display
      showSupadataStatus(true, 'Supadata token configured');
    } else {
      tokenInput.value = '';
      showSupadataStatus(false, 'Supadata token required');
    }
  } catch (error) {
    console.error('Error loading Supadata token:', error);
    showSupadataStatus(false, 'Error loading Supadata token');
  }
}

function showApiStatus(connected, message) {
  const statusElement = document.getElementById('analysis-status');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  
  if (statusElement && statusDot && statusText) {
    statusElement.style.display = 'flex';
    statusDot.className = `status-indicator ${connected ? 'connected' : 'warning'}`;
    statusText.textContent = message;
  }
}

function showSupadataStatus(connected, message) {
  const successElement = document.getElementById('supadata-token-success');
  const errorElement = document.getElementById('supadata-token-error');
  
  if (connected) {
    if (successElement) {
      successElement.textContent = message;
      successElement.style.display = 'block';
    }
    if (errorElement) {
      errorElement.style.display = 'none';
    }
  } else {
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
    if (successElement) {
      successElement.style.display = 'none';
    }
  }
}

// Enhanced progress indicator with visual cues
function updateProgressIndicator(stage, customMessage = null) {
  currentAnalysisStage = stage;
  const config = progressStages[stage] || progressStages.idle;
  
  const statusElement = document.getElementById('analysis-status');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  
  if (statusElement && statusDot && statusText) {
    statusElement.style.display = 'flex';
    
    // Update status dot with stage-specific color
    statusDot.className = 'status-indicator';
    statusDot.style.backgroundColor = config.color;
    
    // Add pulsing animation for active stages
    if (['transcript_extraction', 'ai_processing', 'ai_request', 'processing_response'].includes(stage)) {
      statusDot.style.animation = 'pulse 1.5s infinite';
    } else {
      statusDot.style.animation = 'none';
    }
    
    // Update status text with icon and message
    statusText.innerHTML = `${config.icon} ${customMessage || config.message}`;
  }
}

async function loadStats() {
  try {
    const stats = await chrome.storage.local.get([
      'sessionStats', 'totalStats'
    ]);
    
    const sessionStats = stats.sessionStats || {
      videosAnalyzed: 0,
      liesDetected: 0,
      highSeverity: 0,
      timeSaved: 0
    };
    
    // Update UI immediately with proper time formatting
    updateStatElement('videos-analyzed', sessionStats.videosAnalyzed);
    updateStatElement('lies-detected', sessionStats.liesDetected);
    updateStatElement('high-severity', sessionStats.highSeverity);
    
    // Format time saved properly
    const timeSaved = sessionStats.timeSaved || 0;
    if (timeSaved >= 60) {
      const minutes = Math.floor(timeSaved / 60);
      const seconds = timeSaved % 60;
      updateStatElement('time-saved', seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`);
    } else {
      updateStatElement('time-saved', `${timeSaved}s`);
    }
    
    currentStats = sessionStats;
    
    return true;
  } catch (error) {
    console.error('Error loading stats:', error);
    // Set defaults if loading fails
    updateStatElement('videos-analyzed', 0);
    updateStatElement('lies-detected', 0);
    updateStatElement('high-severity', 0);
    updateStatElement('time-saved', '0s');
    return false;
  }
}

async function loadFeedbackStats() {
  try {
    const feedbackData = await chrome.storage.local.get(['userFeedback']);
    const feedback = feedbackData.userFeedback || {};
    
    // Calculate feedback stats
    feedbackStats = {
      helpful: 0,
      incorrect: 0,
      report: 0
    };
    
    Object.values(feedback).forEach(item => {
      if (item.type === 'helpful') feedbackStats.helpful++;
      if (item.type === 'incorrect') feedbackStats.incorrect++;
      if (item.type === 'report') feedbackStats.report++;
    });
    
    updateFeedbackUI();
    
    return true;
  } catch (error) {
    console.error('Error loading feedback stats:', error);
    return false;
  }
}

function updateStatElement(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function updateFeedbackUI() {
  updateStatElement('feedback-helpful', feedbackStats.helpful || 0);
  updateStatElement('feedback-incorrect', feedbackStats.incorrect || 0);
  updateStatElement('feedback-reported', feedbackStats.report || 0);
}

function updateToggle(id, value) {
  const toggle = document.getElementById(id);
  if (toggle) {
    toggle.classList.toggle('active', value);
  }
}

function setupEventListeners() {
  // AI provider selection
  const aiProviderSelect = document.getElementById('ai-provider');
  if (aiProviderSelect) {
    aiProviderSelect.addEventListener('change', async (e) => {
      const provider = e.target.value;
      await chrome.storage.sync.set({ aiProvider: provider });
      updateProviderUI(provider);
      await loadApiKey(provider);
      showNotification('AI provider updated', 'success');
    });
  }
  
  // OpenAI model selection
  const openaiModelSelect = document.getElementById('openai-model');
  if (openaiModelSelect) {
    openaiModelSelect.addEventListener('change', async (e) => {
      const modelId = e.target.value;
      await chrome.storage.sync.set({ openaiModel: modelId });
      showNotification('OpenAI model updated', 'success');
    });
  }
  
  // Gemini model selection
  const geminiModelSelect = document.getElementById('gemini-model');
  if (geminiModelSelect) {
    geminiModelSelect.addEventListener('change', async (e) => {
      const modelId = e.target.value;
      await chrome.storage.sync.set({ geminiModel: modelId });
      showNotification('Gemini model updated', 'success');
    });
  }
  
  // Supadata token handling
  const supadataTokenInput = document.getElementById('supadata-token');
  if (supadataTokenInput) {
    supadataTokenInput.addEventListener('focus', () => {
      if (supadataTokenInput.value === '••••••••••••••••') {
        supadataTokenInput.value = '';
        supadataTokenInput.type = 'text';
      }
    });
    
    supadataTokenInput.addEventListener('blur', async () => {
      if (supadataTokenInput.value.trim()) {
        await saveSupadataToken();
      }
      supadataTokenInput.type = 'password';
    });
    
    supadataTokenInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        await saveSupadataToken();
        supadataTokenInput.blur();
      }
    });
  }
  
  // API Key handling
  const apiKeyInput = document.getElementById('api-key');
  if (apiKeyInput) {
    apiKeyInput.addEventListener('focus', () => {
      if (apiKeyInput.value === '••••••••••••••••') {
        apiKeyInput.value = '';
        apiKeyInput.type = 'text';
      }
    });
    
    apiKeyInput.addEventListener('blur', async () => {
      if (apiKeyInput.value.trim()) {
        await saveApiKey();
      }
      apiKeyInput.type = 'password';
    });
    
    apiKeyInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        await saveApiKey();
        apiKeyInput.blur();
      }
    });
  }
  
  // Lies circle click handler
  setupLiesCircleClickHandler();
  
  // Action buttons
  const analyzeCurrentBtn = document.getElementById('analyze-current');
  if (analyzeCurrentBtn) {
    analyzeCurrentBtn.addEventListener('click', analyzeCurrentVideo);
  }
  
  const clearCacheBtn = document.getElementById('clear-cache');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', clearCache);
  }
  
  const exportSettingsBtn = document.getElementById('export-settings');
  if (exportSettingsBtn) {
    exportSettingsBtn.addEventListener('click', exportSettings);
  }
  
  const settingsFileInput = document.getElementById('settings-file-input');
  if (settingsFileInput) {
    settingsFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        importSettings(file);
        e.target.value = ''; // Reset input
      }
    });
  }
}

function setupLiesCircleClickHandler() {
  const liesCircle = document.getElementById('lies-circle');
  if (liesCircle) {
    liesCircle.addEventListener('click', () => {
      // Switch to Lies tab
      document.querySelector('.tab[data-tab="lies"]').click();
      
      // Render current lies
      setTimeout(() => {
        renderLiesDetails(currentVideoLies);
      }, 100);
    });
  }
}

function setupDownloadLinks() {
  // Download lies data
  const downloadLiesData = document.getElementById('download-lies-data');
  if (downloadLiesData) {
    downloadLiesData.addEventListener('click', () => {
      if (window.LieBlockerDetectedLies) {
        window.LieBlockerDetectedLies.downloadLiesData();
        showNotification('Detected lies data downloaded', 'success');
      } else {
        showNotification('No lies data available. Analyze a video first.', 'warning');
      }
    });
  }
}

function updateDownloadLinksAvailability() {
  const downloadSection = document.getElementById('download-section');
  const liesDataBtn = document.getElementById('download-lies-data');
  
  // Check if any data is available
  const hasLiesData = !!window.LieBlockerDetectedLies;
  
  // Show download section if any data is available
  if (hasLiesData) {
    if (downloadSection) {
      downloadSection.style.display = 'block';
    }
  }
  
  // Update individual button states
  if (liesDataBtn) {
    liesDataBtn.classList.toggle('disabled', !hasLiesData);
  }
}

async function saveSupadataToken() {
  const tokenInput = document.getElementById('supadata-token');
  
  if (!tokenInput) return;
  
  const token = tokenInput.value.trim();
  
  if (!token) {
    showNotification('Please enter a Supadata token', 'error');
    return;
  }
  
  try {
    // Basic validation - check if it's not empty and has reasonable length
    if (token.length < 10) {
      showNotification('Invalid Supadata token format', 'error');
      return;
    }
    
    // Save Supadata token
    await chrome.storage.local.set({
      supadataToken: token
    });
    
    // Update UI
    tokenInput.value = '••••••••••••••••';
    showSupadataStatus(true, 'Supadata token saved');
    showNotification('Supadata token saved successfully', 'success');
    
  } catch (error) {
    console.error('Error saving Supadata token:', error);
    showNotification('Failed to save Supadata token', 'error');
  }
}

async function saveApiKey() {
  const apiKeyInput = document.getElementById('api-key');
  const aiProviderSelect = document.getElementById('ai-provider');
  
  if (!apiKeyInput || !aiProviderSelect) return;
  
  const apiKey = apiKeyInput.value.trim();
  const provider = aiProviderSelect.value;
  
  if (!apiKey) {
    showNotification('Please enter an API key', 'error');
    return;
  }
  
  try {
    // Basic validation based on provider
    if (provider === 'openai' && !apiKey.startsWith('sk-')) {
      showNotification('Invalid OpenAI API key format', 'error');
      return;
    }
    
    // Gemini API keys don't have a standard prefix, so we just check if it's not empty
    if (provider === 'gemini' && apiKey.length < 10) {
      showNotification('Invalid Gemini API key format', 'error');
      return;
    }
    
    // Save API key
    await chrome.storage.local.set({
      [`${provider}ApiKey`]: apiKey
    });
    
    // Update UI
    apiKeyInput.value = '••••••••••••••••';
    showApiStatus(true, 'API key saved');
    showNotification('API key saved successfully', 'success');
    
  } catch (error) {
    console.error('Error saving API key:', error);
    showNotification('Failed to save API key', 'error');
  }
}

async function analyzeCurrentVideo() {
  try {
    // First check if we're on a YouTube video page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
      showNotification('Please navigate to a YouTube video', 'error');
      return;
    }
    
    // Check if content script is ready
    const isReady = await waitForContentScript(3000);
    if (!isReady) {
      showNotification('Please refresh the page and try again', 'error');
      return;
    }
    
    // Check if Supadata token is configured
    const supadataResult = await chrome.storage.local.get(['supadataToken']);
    if (!supadataResult.supadataToken) {
      showNotification('Please configure your Supadata API token first', 'error');
      return;
    }
    
    // Check if AI API key is configured
    const provider = document.getElementById('ai-provider').value;
    const result = await chrome.storage.local.get([`${provider}ApiKey`]);
    
    if (!result[`${provider}ApiKey`]) {
      showNotification(`Please configure your ${provider === 'openai' ? 'OpenAI' : 'Gemini'} API key first`, 'error');
      return;
    }
    
    // Set analysis state
    isAnalysisRunning = true;
    currentVideoId = extractVideoId(tab.url);
    currentVideoLies = []; // Reset lies
    updateLiesIndicator([]); // Reset indicator
    
    // Update UI to show analysis is starting
    const analyzeBtn = document.getElementById('analyze-current');
    if (analyzeBtn) {
      analyzeBtn.textContent = 'Starting Analysis...';
      analyzeBtn.disabled = true;
      analyzeBtn.classList.add('loading');
    }
    
    updateProgressIndicator('analysis_start', 'Starting full video analysis...');
    
    // Send message to content script to start analysis with retry logic
    try {
      const response = await sendMessageToContentScript({ type: 'startAnalysis' });
      if (response && response.success) {
        showNotification('Full video analysis started! Watch for real-time progress updates.', 'info');
      } else {
        throw new Error('Analysis start failed');
      }
    } catch (error) {
      console.error('Error starting analysis:', error);
      showNotification('Could not start analysis. Please refresh the page and try again.', 'error');
      resetAnalysisUI();
    }
    
  } catch (error) {
    console.error('Error starting analysis:', error);
    showNotification('Failed to start analysis', 'error');
    resetAnalysisUI();
  }
}

function resetAnalysisUI() {
  isAnalysisRunning = false;
  const analyzeBtn = document.getElementById('analyze-current');
  if (analyzeBtn) {
    analyzeBtn.textContent = 'Analyze Current Video';
    analyzeBtn.disabled = false;
    analyzeBtn.classList.remove('loading');
  }
  updateProgressIndicator('idle');
}

// Immediate check for current video (synchronous where possible)
async function checkCurrentVideoImmediate() {
  try {
    // Query active tab to get current YouTube video
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url && tab.url.includes('youtube.com/watch')) {
      const videoId = extractVideoId(tab.url);
      if (videoId) {
        currentVideoId = videoId;
        await updateVideoStatsImmediate(videoId, tab.title);
        return true;
      }
    } else {
      updateLiesIndicator([]); // Clear lies indicator
      currentVideoLies = []; // Clear lies
      currentVideoId = null;
      return false;
    }
    
  } catch (error) {
    console.error('Error checking current video:', error);
    updateLiesIndicator([]); // Clear lies indicator
    currentVideoLies = []; // Clear lies
    currentVideoId = null;
    return false;
  }
}

// Legacy function for compatibility
async function checkCurrentVideo() {
  return await checkCurrentVideoImmediate();
}

function extractVideoId(url) {
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

// Immediate video stats update to prevent 0 flash
async function updateVideoStatsImmediate(videoId, title) {
  try {
    // Check if we have analysis for this video
    const cacheKey = `analysis_${videoId}`;
    const cached = await chrome.storage.local.get([cacheKey]);
    
    if (cached[cacheKey]) {
      const analysis = cached[cacheKey];
      console.log('📊 Cached analysis found:', analysis);
      
      // Handle different data structures - Better lies detection
      let liesCount = 0;
      let lies = [];
      
      // Check if analysis has claims array directly (new format)
      if (analysis.claims && Array.isArray(analysis.claims)) {
        lies = analysis.claims;
        liesCount = lies.length;
        console.log('📊 Using new format - Lies found:', liesCount);
      }
      // Check if analysis has nested analysis object with claims
      else if (analysis.analysis && typeof analysis.analysis === 'object' && analysis.analysis.claims) {
        lies = analysis.analysis.claims;
        liesCount = lies.length;
        console.log('📊 Using nested format - Lies found:', liesCount);
      }
      // Check if analysis is a string that contains lie information (legacy format)
      else if (typeof analysis.analysis === 'string') {
        // Parse the analysis string to count lies
        const analysisText = analysis.analysis;
        const liesMatches = analysisText.match(/🚨.*?Lie:/gi);
        liesCount = liesMatches ? liesMatches.length : 0;
        console.log('📊 Using legacy format - Parsed lies:', liesCount);
        
        // For legacy format, create mock lies for display
        lies = Array(liesCount).fill(null).map((_, i) => ({
          severity: 'high',
          claim: 'Legacy lie detected',
          explanation: 'This lie was detected in a previous analysis format',
          timestamp: '0:00',
          timeInSeconds: 0,
          confidence: 0.8,
          category: 'other'
        }));
      }
      
      console.log(`📊 Lies found: ${liesCount}`);
      
      // Store lies for filtering
      currentVideoLies = lies;
      
      // Update lies indicator immediately
      updateLiesIndicator(lies);
      
      updateProgressIndicator('complete', 'Analysis available');
    } else {
      updateProgressIndicator('idle', 'Not analyzed');
      updateLiesIndicator([]); // Clear lies indicator
      currentVideoLies = []; // Clear lies
    }
    
    // Update download links availability
    updateDownloadLinksAvailability();
    
  } catch (error) {
    console.error('Error updating video stats:', error);
    updateLiesIndicator([]); // Clear lies indicator
    currentVideoLies = []; // Clear lies
  }
}

function updateLiesIndicator(lies) {
  const liesCount = lies.length;
  const liesCountElement = document.getElementById('lies-count');
  const liesCircle = document.getElementById('lies-circle');
  
  if (liesCountElement) {
    liesCountElement.textContent = liesCount;
  }
  
  if (liesCircle) {
    if (liesCount > 0) {
      liesCircle.style.transform = 'scale(1.1)';
      liesCircle.style.boxShadow = '0 12px 35px rgba(160, 82, 45, 0.5)';
      liesCircle.style.animation = 'pulse 2s infinite';
    } else {
      liesCircle.style.transform = 'scale(1)';
      liesCircle.style.boxShadow = '0 8px 25px rgba(160, 82, 45, 0.4)';
      liesCircle.style.animation = 'none';
    }
  }
}

function renderLiesDetails(lies, filterSeverity = null) {
  const liesListElement = document.getElementById('lies-list');
  const noLiesElement = document.getElementById('no-lies-message');
  
  if (!liesListElement || !noLiesElement) return;
  
  console.log('🎯 Rendering lies details:', lies);
  
  if (!lies || lies.length === 0) {
    liesListElement.style.display = 'none';
    noLiesElement.style.display = 'block';
    
    let message = 'No lies detected for the current video.';
    if (isAnalysisRunning) {
      message = 'Analysis in progress... Lies will appear here instantly when detected.';
    }
    
    noLiesElement.textContent = message;
    return;
  }
  
  liesListElement.style.display = 'block';
  noLiesElement.style.display = 'none';
  
  // Sort lies by timestamp for better organization
  const sortedLies = [...lies].sort((a, b) => (a.timeInSeconds || 0) - (b.timeInSeconds || 0));
  
  liesListElement.innerHTML = sortedLies.map((lie, index) => {
    // Ensure we have valid timestamp data
    const timestamp = lie.timestamp || '0:00';
    const timeInSeconds = lie.timeInSeconds || parseTimestampToSeconds(timestamp);
    const duration = lie.duration || 10;
    
    return `
      <div class="lie-item clickable-lie-item" data-timestamp="${timeInSeconds}" data-timestamp-text="${timestamp}">
        <div class="lie-header">
          <span class="lie-number">🚨 ${index + 1}.</span>
          <span class="lie-timestamp">${timestamp} (${duration}s)</span>
        </div>
        <div class="lie-text">"${lie.claim || 'No lie text available'}"</div>
        <div class="lie-explanation">
          <strong>Fact-check:</strong> ${lie.explanation || 'No explanation available'}
        </div>
        <div class="lie-meta">
          <span class="lie-confidence">Confidence: ${Math.round((lie.confidence || 0) * 100)}%</span>
          <span class="lie-severity ${lie.severity || 'medium'}">${(lie.severity || 'medium').toUpperCase()}</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click event listeners to entire lie items after rendering
  setTimeout(() => {
    const lieItems = document.querySelectorAll('.clickable-lie-item');
    lieItems.forEach(element => {
      element.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const timeInSeconds = parseFloat(element.dataset.timestamp);
        const timestampText = element.dataset.timestampText;
        console.log(`🎯 Lie item clicked: ${timestampText} (${timeInSeconds}s)`);
        
        // Add visual feedback to the clicked item
        element.style.transform = 'scale(0.98)';
        element.style.background = 'linear-gradient(135deg, #8b5a3c 0%, #6d4c41 100%)';
        element.style.color = 'white';
        
        // Reset visual feedback after a short delay
        setTimeout(() => {
          element.style.transform = '';
          element.style.background = '';
          element.style.color = '';
        }, 200);
        
        jumpToTimestamp(timestampText, timeInSeconds);
      });
      
      // Add hover effect
      element.addEventListener('mouseenter', () => {
        element.style.cursor = 'pointer';
        element.style.transform = 'translateY(-2px)';
        element.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      });
      
      element.addEventListener('mouseleave', () => {
        element.style.transform = '';
        element.style.boxShadow = '';
      });
    });
  }, 100);
}

// Helper function to parse timestamp string to seconds
function parseTimestampToSeconds(timestamp) {
  if (!timestamp || typeof timestamp !== 'string') return 0;
  
  const parts = timestamp.split(':').map(part => parseInt(part, 10));
  
  if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // H:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  return 0;
}

// Enhanced function to jump to specific timestamp in YouTube video while keeping popup open
async function jumpToTimestamp(timestamp, timeInSeconds) {
  try {
    console.log(`🎯 Attempting to jump to lie timestamp: ${timestamp} (${timeInSeconds}s)`);
    
    // Get the active YouTube tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
      showNotification('Please navigate to a YouTube video', 'error');
      return;
    }
    
    // Validate timeInSeconds
    if (isNaN(timeInSeconds) || timeInSeconds < 0) {
      console.error('Invalid timestamp:', timeInSeconds);
      showNotification('Invalid timestamp', 'error');
      return;
    }
    
    console.log(`🎯 Sending jump message to tab ${tab.id}`);
    
    // Send message to content script to jump to timestamp with retry logic
    try {
      const response = await sendMessageToContentScript({ 
        type: 'jumpToTimestamp', 
        timestamp: timeInSeconds 
      });
      
      if (response && response.success) {
        console.log(`✅ Successfully jumped to lie at ${timestamp}`);
        
        // Show success notification with enhanced feedback
        showNotification(`🎯 Jumped to lie at ${timestamp}`, 'success', 2000);
        
        // DO NOT close popup - keep it open for seamless experience
        console.log('🎯 Popup remains open for continued lies review');
        
      } else {
        console.error('Failed to jump to timestamp:', response);
        showNotification('Failed to jump to timestamp', 'error');
      }
    } catch (error) {
      console.error('Error jumping to timestamp:', error);
      showNotification('Could not jump to timestamp. Please refresh the page and try again.', 'error');
    }
    
  } catch (error) {
    console.error('Error jumping to timestamp:', error);
    showNotification('Failed to jump to timestamp', 'error');
  }
}

// Make jumpToTimestamp globally available
window.jumpToTimestamp = jumpToTimestamp;

function formatTime(timestamp) {
  if (!timestamp) return 'unknown time';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMinutes = Math.floor((now - date) / 60000);
  
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

async function clearCache() {
  if (!confirm('Are you sure you want to clear all cached analysis data and session statistics? This cannot be undone.')) {
    return;
  }
  
  try {
    // Get all storage data
    const allData = await chrome.storage.local.get(null);
    
    // Find all analysis cache keys
    const analysisKeys = Object.keys(allData).filter(key => key.startsWith('analysis_'));
    
    // Also clear background analysis state and session statistics
    const backgroundStateKeys = ['backgroundAnalysisState', 'sessionStats', 'totalStats', 'userFeedback'];
    
    const keysToRemove = [...analysisKeys, ...backgroundStateKeys];
    
    if (keysToRemove.length > 0) {
      // Remove all cache entries, background state, and statistics
      await chrome.storage.local.remove(keysToRemove);
      
      // Clear background analysis state via message
      chrome.runtime.sendMessage({ type: 'clearAnalysisState' });
      
      // Reset local UI state
      isAnalysisRunning = false;
      currentVideoLies = [];
      
      // Reset statistics to zero IMMEDIATELY
      currentStats = {
        videosAnalyzed: 0,
        liesDetected: 0,
        highSeverity: 0,
        timeSaved: 0
      };
      
      feedbackStats = {
        helpful: 0,
        incorrect: 0,
        report: 0
      };
      
      // Update UI elements immediately with zero values
      resetAnalysisUI();
      updateLiesIndicator([]);
      
      // Update statistics display immediately
      updateStatElement('videos-analyzed', 0);
      updateStatElement('lies-detected', 0);
      updateStatElement('high-severity', 0);
      updateStatElement('time-saved', '0s');
      updateFeedbackUI();
      
      // Clear lies tab
      const liesListElement = document.getElementById('lies-list');
      const noLiesElement = document.getElementById('no-lies-message');
      if (liesListElement) liesListElement.style.display = 'none';
      if (noLiesElement) {
        noLiesElement.style.display = 'block';
        noLiesElement.textContent = 'No lies detected for the current video.';
      }
      
      // Clear download data and hide download section
      window.LieBlockerTranscriptData = null;
      window.LieBlockerAnalysisData = null;
      window.LieBlockerDetectedLies = null;
      updateDownloadLinksAvailability();
      
      showNotification(`Cleared ${analysisKeys.length} cached analyses and reset all statistics`, 'success');
      
      // Refresh current video display
      await checkCurrentVideo();
    } else {
      showNotification('No cached data found', 'warning');
    }
    
  } catch (error) {
    console.error('Error clearing cache:', error);
    showNotification('Failed to clear cache', 'error');
  }
}

// Enhanced notification system with better UX for lies
function showNotification(message, type = 'success', duration = 4000) {
  // Remove existing notifications
  const existing = document.querySelectorAll('.notification');
  existing.forEach(notif => {
    notif.classList.add('removing');
    setTimeout(() => notif.remove(), 300);
  });
  
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  // Create notification content
  const icon = getNotificationIcon(type);
  const content = document.createElement('div');
  content.className = 'notification-content';
  content.textContent = message;
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'notification-close';
  closeBtn.innerHTML = '×';
  closeBtn.onclick = () => {
    notification.classList.add('removing');
    setTimeout(() => notification.remove(), 300);
  };
  
  notification.appendChild(icon);
  notification.appendChild(content);
  notification.appendChild(closeBtn);
  
  document.body.appendChild(notification);
  
  // Auto-remove after duration
  setTimeout(() => {
    if (notification.parentNode) {
      notification.classList.add('removing');
      setTimeout(() => notification.remove(), 300);
    }
  }, duration);
}

function getNotificationIcon(type) {
  const icon = document.createElement('div');
  icon.className = 'notification-icon';
  
  switch (type) {
    case 'success':
      icon.textContent = '✅';
      break;
    case 'error':
      icon.textContent = '❌';
      break;
    case 'warning':
      icon.textContent = '⚠️';
      break;
    case 'info':
      icon.textContent = 'ℹ️';
      break;
    default:
      icon.textContent = '📢';
  }
  
  return icon;
}

// Settings import/export
async function exportSettings() {
  try {
    const settings = await chrome.storage.sync.get();
    const settingsBlob = new Blob([JSON.stringify(settings, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(settingsBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lieblocker-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showNotification('Settings exported successfully', 'success');
  } catch (error) {
    console.error('Error exporting settings:', error);
    showNotification('Failed to export settings', 'error');
  }
}

async function importSettings(file) {
  try {
    const text = await file.text();
    const settings = JSON.parse(text);
    
    // Validate settings structure
    if (typeof settings !== 'object') {
      throw new Error('Invalid settings format');
    }
    
    await chrome.storage.sync.set(settings);
    await loadSettings();
    showNotification('Settings imported successfully', 'success');
  } catch (error) {
    console.error('Error importing settings:', error);
    showNotification('Failed to import settings', 'error');
  }
}

// Immediate check analysis state on popup open
async function checkAnalysisStateImmediate() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getAnalysisState' });
    if (response && response.isRunning) {
      isAnalysisRunning = true;
      currentVideoLies = response.currentClaims || [];
      currentAnalysisStage = response.stage || 'analysis_start';
      
      showNotification('Full video analysis running in background...', 'info', 5000);
      updateProgressIndicator(currentAnalysisStage, 'Full video analysis in progress...');
      
      // Update button state
      const analyzeBtn = document.getElementById('analyze-current');
      if (analyzeBtn) {
        analyzeBtn.textContent = 'Analyzing...';
        analyzeBtn.disabled = true;
        analyzeBtn.classList.add('loading');
      }
      
      // Update lies indicator with current lies
      updateLiesIndicator(currentVideoLies);
      
      // If we're on the lies tab, show current lies
      const liesTab = document.querySelector('.tab[data-tab="lies"]');
      if (liesTab && liesTab.classList.contains('active')) {
        renderLiesDetails(currentVideoLies);
      }
      
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error checking analysis state:', error);
    return false;
  }
}

// Legacy function for compatibility
async function checkAnalysisState() {
  return await checkAnalysisStateImmediate();
}

// Setup real-time updates from background script
function setupRealTimeUpdates() {
  // Listen for real-time analysis updates
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Popup received message:', message.type);
    
    if (message.type === 'analysisResult') {
      handleAnalysisUpdate(message.data);
    }
    
    if (message.type === 'analysisProgress') {
      handleProgressUpdate(message);
    }
    
    if (message.type === 'liesUpdate') {
      handleLiesUpdate(message);
    }
    
    if (message.type === 'STATS_UPDATE') {
      loadStats();
    }
    
    if (message.type === 'FEEDBACK_UPDATE') {
      loadFeedbackStats();
    }
    
    if (message.type === 'cacheUpdated') {
      // Refresh video stats when cache is updated
      if (message.videoId === currentVideoId) {
        checkCurrentVideo();
      }
    }
    
    // NEW: Handle lie skip tracking for accurate stats
    if (message.type === 'lieSkipped') {
      handleLieSkipped(message);
    }
  });
}

// NEW: Handle lie skip tracking for accurate time saved calculation
function handleLieSkipped(message) {
  console.log('⏭️ Popup: Lie skipped event received:', message);
  
  // Update session stats with actual skipped time
  if (message.actualSkippedTime > 0) {
    currentStats.timeSaved += message.actualSkippedTime;
    
    // Update UI immediately
    const timeSaved = currentStats.timeSaved;
    if (timeSaved >= 60) {
      const minutes = Math.floor(timeSaved / 60);
      const seconds = timeSaved % 60;
      updateStatElement('time-saved', seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`);
    } else {
      updateStatElement('time-saved', `${timeSaved}s`);
    }
    
    // Save updated stats
    chrome.storage.local.set({ sessionStats: currentStats });
    
    // Show notification
    showNotification(`⏭️ Skipped ${message.actualSkippedTime}s lie! Total saved: ${timeSaved}s`, 'success', 2000);
  }
}

// Handle real-time progress updates with visual cues
function handleProgressUpdate(message) {
  console.log('📊 Progress update received:', message);
  
  updateProgressIndicator(message.stage, message.message);
  
  // Update button text based on stage
  const analyzeBtn = document.getElementById('analyze-current');
  if (analyzeBtn && isAnalysisRunning) {
    const stageTexts = {
      cache_check: 'Checking Cache...',
      transcript_extraction: 'Extracting Transcript...',
      transcript_preparation: 'Preparing Analysis...',
      analysis_start: 'Starting Analysis...',
      ai_processing: 'Processing...',
      ai_request: 'Sending to AI...',
      processing_response: 'Processing Response...'
    };
    
    analyzeBtn.textContent = stageTexts[message.stage] || 'Analyzing...';
  }
}

// Handle real-time analysis updates
function handleAnalysisUpdate(data) {
  console.log('📊 Analysis update received:', data);
  
  if (data.includes('Analysis complete') || data.includes('loaded from cache')) {
    // Analysis finished
    isAnalysisRunning = false;
    resetAnalysisUI();
    updateProgressIndicator('complete', 'Full video analysis complete');
    
    // Refresh the video stats and lies
    setTimeout(async () => {
      await checkCurrentVideo();
      await loadStats();
      
      // Update download links availability
      updateDownloadLinksAvailability();
      
      // If we're on the lies tab, refresh it
      const liesTab = document.querySelector('.tab[data-tab="lies"]');
      if (liesTab && liesTab.classList.contains('active')) {
        renderLiesDetails(currentVideoLies);
      }
    }, 1000);
    
    showNotification('Full video analysis complete! Check the Lies tab for results.', 'success');
  } else if (data.includes('Error')) {
    // Analysis error
    isAnalysisRunning = false;
    resetAnalysisUI();
    updateProgressIndicator('error', 'Analysis failed');
    showNotification('Analysis failed. Please try again.', 'error');
  }
}

// Handle real-time lies updates
function handleLiesUpdate(message) {
  console.log('🚨 Real-time lies update received:', message);
  
  if (message.claims && Array.isArray(message.claims)) {
    // Update current lies with new complete set
    currentVideoLies = message.claims;
    
    // Update lies indicator in real-time
    updateLiesIndicator(currentVideoLies);
    
    // If we're on the lies tab, update it immediately
    const liesTab = document.querySelector('.tab[data-tab="lies"]');
    if (liesTab && liesTab.classList.contains('active')) {
      renderLiesDetails(currentVideoLies);
    }
    
    // Show notification for detected lies
    if (currentVideoLies.length > 0 && !message.isComplete) {
      showNotification(`🚨 ${currentVideoLies.length} lies detected!`, 'warning', 3000);
    }
  }
  
  // Check if analysis is complete
  if (message.isComplete) {
    isAnalysisRunning = false;
    resetAnalysisUI();
    updateProgressIndicator('complete', `Full video analysis complete - ${currentVideoLies.length} lies found`);
    showNotification(`✅ Full video analysis complete! Found ${currentVideoLies.length} lies.`, 'success', 5000);
    
    // Update download links availability after analysis is complete
    setTimeout(() => {
      updateDownloadLinksAvailability();
    }, 1000);
  }
}

// Listen for real-time updates from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STATS_UPDATE') {
    loadStats();
  }
  
  if (message.type === 'FEEDBACK_UPDATE') {
    loadFeedbackStats();
  }
  
  if (message.type === 'analysisResult') {
    // Handle analysis results from background script
    handleAnalysisUpdate(message.data);
  }
  
  if (message.type === 'analysisProgress') {
    // Handle progress updates
    handleProgressUpdate(message);
  }
  
  if (message.type === 'liesUpdate') {
    // Handle real-time lies updates
    handleLiesUpdate(message);
  }
  
  if (message.type === 'lieSkipped') {
    // Handle lie skip tracking
    handleLieSkipped(message);
  }
});

// Add CSS for progress indicator animations
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
`;
document.head.appendChild(style);