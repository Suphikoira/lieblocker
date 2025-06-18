// Enhanced popup script with robust connection handling and error recovery
(function() {
  'use strict';
  
  console.log('🚀 LieBlocker popup script loaded');
  
  // Connection state management
  let connectionState = {
    isConnected: false,
    lastError: null,
    retryCount: 0,
    maxRetries: 3
  };
  
  // UI state management
  let uiState = {
    currentTab: 'overview',
    isAnalyzing: false,
    currentVideoLies: [],
    settings: {
      aiProvider: 'openai',
      openaiModel: 'gpt-4.1-mini',
      geminiModel: 'gemini-2.0-flash-exp',
      apiKey: '',
      analysisDuration: 20,
      autoSkipEnabled: false
    }
  };
  
  // Enhanced connection testing with retry logic
  async function testConnection() {
    try {
      connectionState.retryCount++;
      console.log(`🔌 Testing connection (attempt ${connectionState.retryCount}/${connectionState.maxRetries})`);
      
      // Test if we can get the current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        throw new Error('No active tab found');
      }
      
      const tab = tabs[0];
      if (!tab.url || !tab.url.includes('youtube.com')) {
        throw new Error('Not on YouTube');
      }
      
      // Test background script connection
      const response = await chrome.runtime.sendMessage({ type: 'getAnalysisState' });
      if (!response) {
        throw new Error('Background script not responding');
      }
      
      connectionState.isConnected = true;
      connectionState.lastError = null;
      connectionState.retryCount = 0;
      
      console.log('✅ Connection test successful');
      return { success: true, tab };
      
    } catch (error) {
      console.error(`❌ Connection test failed (attempt ${connectionState.retryCount}):`, error);
      connectionState.isConnected = false;
      connectionState.lastError = error.message;
      
      if (connectionState.retryCount < connectionState.maxRetries) {
        console.log(`🔄 Retrying connection in 1 second...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await testConnection();
      }
      
      return { success: false, error: error.message };
    }
  }
  
  // Enhanced message sending with error handling and retries
  async function sendMessageSafely(message, options = {}) {
    const { retries = 2, timeout = 10000, target = 'background' } = options;
    
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        console.log(`📤 Sending message (attempt ${attempt}):`, message);
        
        let response;
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Message timeout')), timeout);
        });
        
        if (target === 'background') {
          const messagePromise = chrome.runtime.sendMessage(message);
          response = await Promise.race([messagePromise, timeoutPromise]);
        } else if (target === 'content') {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tabs || tabs.length === 0) {
            throw new Error('No active tab for content script message');
          }
          
          const messagePromise = chrome.tabs.sendMessage(tabs[0].id, message);
          response = await Promise.race([messagePromise, timeoutPromise]);
        }
        
        console.log('📥 Message response:', response);
        return response;
        
      } catch (error) {
        console.error(`❌ Message send failed (attempt ${attempt}):`, error);
        
        if (attempt <= retries) {
          console.log(`🔄 Retrying message in ${attempt * 500}ms...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 500));
          
          // Test connection before retry
          const connectionTest = await testConnection();
          if (!connectionTest.success) {
            throw new Error(`Connection failed: ${connectionTest.error}`);
          }
        } else {
          throw error;
        }
      }
    }
  }
  
  // Enhanced notification system
  function showNotification(message, type = 'info', duration = 4000) {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
      notification.classList.add('removing');
      setTimeout(() => notification.remove(), 300);
    });
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    
    notification.innerHTML = `
      <span class="notification-icon">${icons[type] || icons.info}</span>
      <div class="notification-content">${message}</div>
      <button class="notification-close">×</button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after duration
    const autoRemove = setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('removing');
        setTimeout(() => notification.remove(), 300);
      }
    }, duration);
    
    // Manual close
    notification.querySelector('.notification-close').addEventListener('click', () => {
      clearTimeout(autoRemove);
      notification.classList.add('removing');
      setTimeout(() => notification.remove(), 300);
    });
  }
  
  // Enhanced video analysis with better error handling
  async function analyzeCurrentVideo() {
    if (uiState.isAnalyzing) {
      showNotification('Analysis already in progress', 'warning');
      return;
    }
    
    try {
      uiState.isAnalyzing = true;
      updateAnalyzeButton();
      
      // Test connection first
      const connectionTest = await testConnection();
      if (!connectionTest.success) {
        throw new Error(`Connection failed: ${connectionTest.error}`);
      }
      
      const tab = connectionTest.tab;
      const videoId = extractVideoId(tab.url);
      
      if (!videoId) {
        throw new Error('Could not extract video ID from URL');
      }
      
      console.log('🎬 Starting analysis for video:', videoId);
      
      // Check if we have API key
      if (!uiState.settings.apiKey) {
        throw new Error('API key not configured. Please add your API key in Settings.');
      }
      
      // Start analysis
      showNotification('Starting video analysis...', 'info');
      
      const startResponse = await sendMessageSafely({
        type: 'startAnalysis',
        videoId: videoId,
        settings: uiState.settings
      }, { retries: 3, timeout: 15000 });
      
      if (!startResponse || !startResponse.success) {
        throw new Error(startResponse?.error || 'Failed to start analysis');
      }
      
      // Monitor analysis progress
      monitorAnalysisProgress();
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      uiState.isAnalyzing = false;
      updateAnalyzeButton();
      
      let errorMessage = error.message;
      if (errorMessage.includes('Extension context invalidated')) {
        errorMessage = 'Extension was reloaded. Please refresh the page and try again.';
      } else if (errorMessage.includes('Could not establish connection')) {
        errorMessage = 'Connection lost. Please refresh the page and try again.';
      }
      
      showNotification(errorMessage, 'error', 6000);
    }
  }
  
  // Enhanced progress monitoring
  function monitorAnalysisProgress() {
    const progressInterval = setInterval(async () => {
      try {
        const state = await sendMessageSafely({ type: 'getAnalysisState' }, { retries: 1, timeout: 5000 });
        
        if (!state) {
          console.warn('⚠️ No analysis state received');
          return;
        }
        
        updateAnalysisStatus(state);
        
        if (!state.isRunning) {
          clearInterval(progressInterval);
          uiState.isAnalyzing = false;
          updateAnalyzeButton();
          
          if (state.error) {
            showNotification(`Analysis failed: ${state.error}`, 'error');
          } else if (state.stage === 'complete') {
            showNotification('Analysis completed successfully!', 'success');
            await loadCurrentVideoLies();
          }
        }
        
      } catch (error) {
        console.error('❌ Progress monitoring error:', error);
        
        if (error.message.includes('Extension context invalidated') || 
            error.message.includes('Could not establish connection')) {
          clearInterval(progressInterval);
          uiState.isAnalyzing = false;
          updateAnalyzeButton();
          showNotification('Connection lost. Please refresh the page.', 'error');
        }
      }
    }, 2000);
    
    // Safety timeout
    setTimeout(() => {
      clearInterval(progressInterval);
      if (uiState.isAnalyzing) {
        uiState.isAnalyzing = false;
        updateAnalyzeButton();
        showNotification('Analysis timeout. Please try again.', 'warning');
      }
    }, 300000); // 5 minutes
  }
  
  // Enhanced video lies loading with error recovery
  async function loadCurrentVideoLies() {
    try {
      const connectionTest = await testConnection();
      if (!connectionTest.success) {
        console.warn('⚠️ Cannot load video lies - connection failed:', connectionTest.error);
        return;
      }
      
      const tab = connectionTest.tab;
      const videoId = extractVideoId(tab.url);
      
      if (!videoId) {
        console.warn('⚠️ Cannot load video lies - no video ID');
        return;
      }
      
      console.log('📋 Loading lies for video:', videoId);
      
      const response = await sendMessageSafely({
        type: 'getCurrentVideoLies',
        videoId: videoId
      }, { retries: 2, timeout: 10000 });
      
      if (response && response.success && response.lies) {
        uiState.currentVideoLies = response.lies;
        updateLiesDisplay();
        updateLiesCount();
        console.log(`✅ Loaded ${response.lies.length} lies for current video`);
      } else {
        console.log('📋 No lies found for current video');
        uiState.currentVideoLies = [];
        updateLiesDisplay();
        updateLiesCount();
      }
      
    } catch (error) {
      console.error('❌ Error loading video lies:', error);
      
      if (!error.message.includes('Extension context invalidated')) {
        // Only show error if it's not a context invalidation (which is expected on reload)
        showNotification('Could not load video data', 'warning', 3000);
      }
    }
  }
  
  // Utility functions
  function extractVideoId(url) {
    if (!url) return null;
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
  }
  
  function updateAnalyzeButton() {
    const button = document.getElementById('analyze-current');
    if (!button) return;
    
    if (uiState.isAnalyzing) {
      button.textContent = 'Analyzing...';
      button.disabled = true;
      button.classList.add('loading');
    } else {
      button.textContent = 'Analyze Current Video';
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
  
  function updateAnalysisStatus(state) {
    const statusElement = document.getElementById('analysis-status');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    
    if (!statusElement || !statusDot || !statusText) return;
    
    if (state.isRunning) {
      statusElement.style.display = 'flex';
      statusDot.className = 'status-indicator warning';
      statusText.textContent = state.progress || 'Analyzing...';
    } else if (state.error) {
      statusElement.style.display = 'flex';
      statusDot.className = 'status-indicator';
      statusText.textContent = `Error: ${state.error}`;
    } else {
      statusElement.style.display = 'none';
    }
  }
  
  function updateLiesCount() {
    const countElement = document.getElementById('lies-count');
    if (countElement) {
      countElement.textContent = uiState.currentVideoLies.length;
    }
  }
  
  function updateLiesDisplay() {
    const liesList = document.getElementById('lies-list');
    const noLiesMessage = document.getElementById('no-lies-message');
    
    if (!liesList || !noLiesMessage) return;
    
    if (uiState.currentVideoLies.length === 0) {
      liesList.style.display = 'none';
      noLiesMessage.style.display = 'block';
      return;
    }
    
    liesList.style.display = 'block';
    noLiesMessage.style.display = 'none';
    
    liesList.innerHTML = uiState.currentVideoLies.map((lie, index) => {
      const minutes = Math.floor(lie.timestamp_seconds / 60);
      const seconds = lie.timestamp_seconds % 60;
      const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      return `
        <div class="lie-item clickable-lie-item" data-timestamp="${lie.timestamp_seconds}" data-lie-index="${index}">
          <div class="lie-header">
            <span class="lie-number">#${index + 1}</span>
            <span class="lie-timestamp">${timestamp}</span>
          </div>
          <div class="lie-text">${lie.claim_text}</div>
          <div class="lie-explanation">${lie.explanation}</div>
          <div class="lie-meta">
            <span class="lie-confidence">${Math.round(lie.confidence * 100)}% confidence</span>
            <span class="lie-severity ${lie.severity}">${lie.severity}</span>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers for lie items
    liesList.querySelectorAll('.clickable-lie-item').forEach(item => {
      item.addEventListener('click', async () => {
        const timestamp = parseInt(item.dataset.timestamp);
        const lieIndex = parseInt(item.dataset.lieIndex);
        const lie = uiState.currentVideoLies[lieIndex];
        
        try {
          await sendMessageSafely({
            type: 'skipToTime',
            time: timestamp,
            lie: lie,
            videoId: extractVideoId((await chrome.tabs.query({ active: true, currentWindow: true }))[0].url)
          }, { target: 'content', retries: 2 });
          
          showNotification(`Jumped to ${Math.floor(timestamp / 60)}:${(timestamp % 60).toString().padStart(2, '0')}`, 'success', 2000);
        } catch (error) {
          console.error('❌ Error jumping to timestamp:', error);
          showNotification('Could not jump to timestamp', 'error');
        }
      });
    });
  }
  
  // Settings management
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'aiProvider', 'openaiModel', 'geminiModel', 'apiKey', 
        'analysisDuration', 'autoSkipEnabled'
      ]);
      
      uiState.settings = {
        aiProvider: result.aiProvider || 'openai',
        openaiModel: result.openaiModel || 'gpt-4.1-mini',
        geminiModel: result.geminiModel || 'gemini-2.0-flash-exp',
        apiKey: result.apiKey || '',
        analysisDuration: result.analysisDuration || 20,
        autoSkipEnabled: result.autoSkipEnabled || false
      };
      
      updateSettingsUI();
      
    } catch (error) {
      console.error('❌ Error loading settings:', error);
    }
  }
  
  async function saveSettings() {
    try {
      await chrome.storage.sync.set(uiState.settings);
      console.log('✅ Settings saved');
    } catch (error) {
      console.error('❌ Error saving settings:', error);
      showNotification('Failed to save settings', 'error');
    }
  }
  
  function updateSettingsUI() {
    // Update all form elements with current settings
    const elements = {
      'ai-provider': uiState.settings.aiProvider,
      'openai-model': uiState.settings.openaiModel,
      'gemini-model': uiState.settings.geminiModel,
      'api-key': uiState.settings.apiKey,
      'analysis-duration': uiState.settings.analysisDuration
    };
    
    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.value = value;
      }
    });
    
    // Update duration display
    const durationDisplay = document.getElementById('duration-display');
    if (durationDisplay) {
      durationDisplay.textContent = `${uiState.settings.analysisDuration} min`;
    }
    
    // Update model selection visibility
    const openaiModels = document.getElementById('openai-models');
    const geminiModels = document.getElementById('gemini-models');
    
    if (openaiModels && geminiModels) {
      if (uiState.settings.aiProvider === 'openai') {
        openaiModels.classList.remove('hidden');
        geminiModels.classList.add('hidden');
      } else {
        openaiModels.classList.add('hidden');
        geminiModels.classList.remove('hidden');
      }
    }
    
    // Update skip toggle
    const skipToggle = document.getElementById('skip-lies-toggle');
    if (skipToggle) {
      skipToggle.classList.toggle('active', uiState.settings.autoSkipEnabled);
    }
  }
  
  // Tab management
  function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
    
    uiState.currentTab = tabName;
    
    // Load data for specific tabs
    if (tabName === 'lies') {
      loadCurrentVideoLies();
    }
  }
  
  // Initialize popup
  async function initializePopup() {
    try {
      console.log('🚀 Initializing popup...');
      
      // Test connection first
      const connectionTest = await testConnection();
      if (!connectionTest.success) {
        showNotification(`Connection failed: ${connectionTest.error}`, 'error', 8000);
      }
      
      // Load settings
      await loadSettings();
      
      // Load current video lies
      await loadCurrentVideoLies();
      
      // Set up event listeners
      setupEventListeners();
      
      console.log('✅ Popup initialized successfully');
      
    } catch (error) {
      console.error('❌ Popup initialization failed:', error);
      showNotification('Failed to initialize extension', 'error');
    }
  }
  
  function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // Analyze button
    const analyzeButton = document.getElementById('analyze-current');
    if (analyzeButton) {
      analyzeButton.addEventListener('click', analyzeCurrentVideo);
    }
    
    // Skip toggle
    const skipToggle = document.getElementById('skip-lies-toggle');
    if (skipToggle) {
      skipToggle.addEventListener('click', () => {
        uiState.settings.autoSkipEnabled = !uiState.settings.autoSkipEnabled;
        skipToggle.classList.toggle('active', uiState.settings.autoSkipEnabled);
        saveSettings();
      });
    }
    
    // Settings form elements
    const settingsElements = [
      'ai-provider', 'openai-model', 'gemini-model', 'api-key', 'analysis-duration'
    ];
    
    settingsElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', (e) => {
          const key = id.replace('-', '');
          if (key === 'analysisduration') {
            uiState.settings.analysisDuration = parseInt(e.target.value);
            document.getElementById('duration-display').textContent = `${e.target.value} min`;
          } else if (key === 'aiprovider') {
            uiState.settings.aiProvider = e.target.value;
            updateSettingsUI(); // Update model selection visibility
          } else if (key === 'openaimodel') {
            uiState.settings.openaiModel = e.target.value;
          } else if (key === 'geminimodel') {
            uiState.settings.geminiModel = e.target.value;
          } else if (key === 'apikey') {
            uiState.settings.apiKey = e.target.value;
          }
          
          saveSettings();
        });
      }
    });
    
    // Clear cache button
    const clearCacheButton = document.getElementById('clear-cache');
    if (clearCacheButton) {
      clearCacheButton.addEventListener('click', async () => {
        try {
          await sendMessageSafely({ type: 'clearAnalysisState' });
          showNotification('Cache cleared successfully', 'success');
        } catch (error) {
          console.error('❌ Error clearing cache:', error);
          showNotification('Failed to clear cache', 'error');
        }
      });
    }
  }
  
  // Listen for background messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (message.type === 'liesUpdate') {
        uiState.currentVideoLies = message.claims || [];
        updateLiesDisplay();
        updateLiesCount();
      } else if (message.type === 'analysisProgress') {
        updateAnalysisStatus(message);
      }
      
      sendResponse({ success: true });
    } catch (error) {
      console.error('❌ Error handling background message:', error);
      sendResponse({ success: false, error: error.message });
    }
  });
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePopup);
  } else {
    initializePopup();
  }
  
})();