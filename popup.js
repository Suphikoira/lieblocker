// Enhanced popup script with better error handling and communication
(function() {
  'use strict';
  
  console.log('🚀 LieBlocker popup loaded');
  
  // Global state
  let currentTab = 'overview';
  let currentVideoLies = [];
  let analysisInProgress = false;
  let backgroundState = null;
  
  // Initialize popup
  document.addEventListener('DOMContentLoaded', initialize);
  
  async function initialize() {
    console.log('🎬 Initializing popup');
    
    try {
      // Set up tab switching
      setupTabSwitching();
      
      // Set up event listeners
      setupEventListeners();
      
      // Load settings
      await loadSettings();
      
      // Load current state from background
      await loadBackgroundState();
      
      // Load session statistics
      await loadSessionStats();
      
      // Load current video lies
      await loadCurrentVideoLies();
      
      // Update UI
      updateUI();
      
      console.log('✅ Popup initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing popup:', error);
      showNotification('Failed to initialize popup', 'error');
    }
  }
  
  function setupTabSwitching() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        tabContents.forEach(content => {
          content.classList.remove('active');
          if (content.id === `${targetTab}-tab`) {
            content.classList.add('active');
          }
        });
        
        currentTab = targetTab;
        
        // Load tab-specific data
        if (targetTab === 'lies') {
          loadCurrentVideoLies();
        } else if (targetTab === 'settings') {
          loadSettings();
        }
      });
    });
  }
  
  function setupEventListeners() {
    // Analyze button
    const analyzeBtn = document.getElementById('analyze-current');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', analyzeCurrentVideo);
    }
    
    // Skip lies toggle
    const skipToggle = document.getElementById('skip-lies-toggle');
    if (skipToggle) {
      skipToggle.addEventListener('click', toggleSkipLies);
    }
    
    // Settings
    setupSettingsListeners();
    
    // Lies circle click
    const liesCircle = document.getElementById('lies-circle');
    if (liesCircle) {
      liesCircle.addEventListener('click', () => {
        switchToTab('lies');
      });
    }
  }
  
  function setupSettingsListeners() {
    // AI Provider change
    const aiProviderSelect = document.getElementById('ai-provider');
    if (aiProviderSelect) {
      aiProviderSelect.addEventListener('change', handleAIProviderChange);
    }
    
    // API Key input
    const apiKeyInput = document.getElementById('api-key');
    if (apiKeyInput) {
      apiKeyInput.addEventListener('input', debounce(saveSettings, 1000));
      apiKeyInput.addEventListener('blur', saveSettings);
    }
    
    // Analysis duration
    const durationSlider = document.getElementById('analysis-duration');
    if (durationSlider) {
      durationSlider.addEventListener('input', updateDurationDisplay);
      durationSlider.addEventListener('change', saveSettings);
    }
    
    // Model selects
    const openaiModelSelect = document.getElementById('openai-model');
    const geminiModelSelect = document.getElementById('gemini-model');
    
    if (openaiModelSelect) {
      openaiModelSelect.addEventListener('change', saveSettings);
    }
    
    if (geminiModelSelect) {
      geminiModelSelect.addEventListener('change', saveSettings);
    }
    
    // Clear cache button
    const clearCacheBtn = document.getElementById('clear-cache');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', clearCache);
    }
    
    // Export settings button
    const exportBtn = document.getElementById('export-settings');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportSettings);
    }
  }
  
  async function analyzeCurrentVideo() {
    if (analysisInProgress) {
      showNotification('Analysis already in progress', 'warning');
      return;
    }
    
    try {
      console.log('🔍 Starting video analysis...');
      analysisInProgress = true;
      
      // Update UI to show analysis in progress
      updateAnalysisUI(true);
      
      // Get current active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        throw new Error('No active tab found');
      }
      
      const tab = tabs[0];
      
      // Check if we're on YouTube
      if (!tab.url || !tab.url.includes('youtube.com/watch')) {
        throw new Error('Please navigate to a YouTube video first');
      }
      
      // Send message to content script with timeout handling
      const response = await sendMessageWithTimeout(tab.id, {
        type: 'analyzeVideo'
      }, 300000); // 5 minute timeout
      
      if (!response) {
        throw new Error('No response from content script');
      }
      
      if (!response.success) {
        throw new Error(response.error || 'Analysis failed');
      }
      
      console.log('✅ Analysis completed successfully');
      
      if (response.cached) {
        showNotification('Analysis loaded from cache', 'success');
      } else {
        showNotification('Analysis completed successfully', 'success');
      }
      
      // Update session stats
      await updateSessionStats('videosAnalyzed', 1);
      
      // Reload current video lies
      await loadCurrentVideoLies();
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      showNotification(`Analysis failed: ${error.message}`, 'error');
    } finally {
      analysisInProgress = false;
      updateAnalysisUI(false);
    }
  }
  
  async function sendMessageWithTimeout(tabId, message, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Message timeout - content script may not be loaded'));
      }, timeout);
      
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          clearTimeout(timeoutId);
          
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          resolve(response);
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
  
  function updateAnalysisUI(inProgress) {
    const analyzeBtn = document.getElementById('analyze-current');
    const statusDiv = document.getElementById('analysis-status');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    
    if (analyzeBtn) {
      analyzeBtn.disabled = inProgress;
      analyzeBtn.textContent = inProgress ? 'Analyzing...' : 'Analyze Current Video';
      
      if (inProgress) {
        analyzeBtn.classList.add('loading');
      } else {
        analyzeBtn.classList.remove('loading');
      }
    }
    
    if (statusDiv && statusDot && statusText) {
      if (inProgress) {
        statusDiv.style.display = 'flex';
        statusDot.className = 'status-indicator warning';
        statusText.textContent = 'Analysis in progress...';
      } else {
        statusDiv.style.display = 'none';
      }
    }
  }
  
  async function toggleSkipLies() {
    const toggle = document.getElementById('skip-lies-toggle');
    const isEnabled = toggle.classList.contains('active');
    const newState = !isEnabled;
    
    try {
      // Update UI immediately
      if (newState) {
        toggle.classList.add('active');
      } else {
        toggle.classList.remove('active');
      }
      
      // Save setting
      await chrome.storage.local.set({ skipLiesEnabled: newState });
      
      // Notify content script
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        try {
          await sendMessageWithTimeout(tabs[0].id, {
            type: 'skipLiesToggle',
            enabled: newState
          }, 5000);
        } catch (error) {
          console.warn('Could not notify content script about skip toggle:', error);
        }
      }
      
      showNotification(
        newState ? 'Auto-skip enabled' : 'Auto-skip disabled',
        'success'
      );
      
    } catch (error) {
      console.error('❌ Error toggling skip lies:', error);
      
      // Revert UI on error
      if (newState) {
        toggle.classList.remove('active');
      } else {
        toggle.classList.add('active');
      }
      
      showNotification('Failed to toggle skip setting', 'error');
    }
  }
  
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        'aiProvider',
        'openaiModel',
        'geminiModel',
        'apiKey',
        'analysisDuration',
        'skipLiesEnabled'
      ]);
      
      // AI Provider
      const aiProviderSelect = document.getElementById('ai-provider');
      if (aiProviderSelect) {
        aiProviderSelect.value = result.aiProvider || 'openai';
        handleAIProviderChange(); // Update model visibility
      }
      
      // Models
      const openaiModelSelect = document.getElementById('openai-model');
      const geminiModelSelect = document.getElementById('gemini-model');
      
      if (openaiModelSelect) {
        openaiModelSelect.value = result.openaiModel || 'gpt-4o-mini';
      }
      
      if (geminiModelSelect) {
        geminiModelSelect.value = result.geminiModel || 'gemini-2.0-flash-exp';
      }
      
      // API Key
      const apiKeyInput = document.getElementById('api-key');
      if (apiKeyInput) {
        apiKeyInput.value = result.apiKey || '';
      }
      
      // Analysis Duration
      const durationSlider = document.getElementById('analysis-duration');
      if (durationSlider) {
        durationSlider.value = result.analysisDuration || 20;
        updateDurationDisplay();
      }
      
      // Skip Lies Toggle
      const skipToggle = document.getElementById('skip-lies-toggle');
      if (skipToggle) {
        if (result.skipLiesEnabled) {
          skipToggle.classList.add('active');
        } else {
          skipToggle.classList.remove('active');
        }
      }
      
    } catch (error) {
      console.error('❌ Error loading settings:', error);
    }
  }
  
  function handleAIProviderChange() {
    const aiProvider = document.getElementById('ai-provider')?.value;
    const openaiModels = document.getElementById('openai-models');
    const geminiModels = document.getElementById('gemini-models');
    
    if (openaiModels && geminiModels) {
      if (aiProvider === 'openai') {
        openaiModels.classList.remove('hidden');
        geminiModels.classList.add('hidden');
      } else {
        openaiModels.classList.add('hidden');
        geminiModels.classList.remove('hidden');
      }
    }
    
    // Save the setting
    saveSettings();
  }
  
  function updateDurationDisplay() {
    const slider = document.getElementById('analysis-duration');
    const display = document.getElementById('duration-display');
    
    if (slider && display) {
      const value = slider.value;
      display.textContent = `${value} min`;
    }
  }
  
  async function saveSettings() {
    try {
      const settings = {
        aiProvider: document.getElementById('ai-provider')?.value || 'openai',
        openaiModel: document.getElementById('openai-model')?.value || 'gpt-4o-mini',
        geminiModel: document.getElementById('gemini-model')?.value || 'gemini-2.0-flash-exp',
        apiKey: document.getElementById('api-key')?.value || '',
        analysisDuration: parseInt(document.getElementById('analysis-duration')?.value) || 20
      };
      
      await chrome.storage.local.set(settings);
      
      // Show success message briefly
      const apiKeyInput = document.getElementById('api-key');
      const successMsg = document.getElementById('api-key-success');
      const errorMsg = document.getElementById('api-key-error');
      
      if (successMsg && errorMsg) {
        errorMsg.style.display = 'none';
        successMsg.textContent = 'Settings saved';
        successMsg.style.display = 'block';
        
        setTimeout(() => {
          successMsg.style.display = 'none';
        }, 2000);
      }
      
    } catch (error) {
      console.error('❌ Error saving settings:', error);
      
      const errorMsg = document.getElementById('api-key-error');
      if (errorMsg) {
        errorMsg.textContent = 'Failed to save settings';
        errorMsg.style.display = 'block';
      }
    }
  }
  
  async function loadBackgroundState() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'getAnalysisState' }, resolve);
      });
      
      if (response) {
        backgroundState = response;
        console.log('📋 Background state loaded:', backgroundState);
      }
    } catch (error) {
      console.error('❌ Error loading background state:', error);
    }
  }
  
  async function loadSessionStats() {
    try {
      const result = await chrome.storage.local.get(['sessionStats']);
      const stats = result.sessionStats || {
        videosAnalyzed: 0,
        liesDetected: 0,
        timeSaved: 0
      };
      
      // Update UI
      const videosAnalyzedEl = document.getElementById('videos-analyzed');
      const liesDetectedEl = document.getElementById('lies-detected');
      const timeSavedEl = document.getElementById('time-saved');
      
      if (videosAnalyzedEl) videosAnalyzedEl.textContent = stats.videosAnalyzed;
      if (liesDetectedEl) liesDetectedEl.textContent = stats.liesDetected;
      if (timeSavedEl) {
        const minutes = Math.floor(stats.timeSaved / 60);
        const seconds = stats.timeSaved % 60;
        timeSavedEl.textContent = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      }
      
    } catch (error) {
      console.error('❌ Error loading session stats:', error);
    }
  }
  
  async function loadCurrentVideoLies() {
    try {
      // Get current tab to extract video ID
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) return;
      
      const tab = tabs[0];
      if (!tab.url || !tab.url.includes('youtube.com/watch')) return;
      
      const urlParams = new URLSearchParams(new URL(tab.url).search);
      const videoId = urlParams.get('v');
      
      if (!videoId) return;
      
      // Get lies from background script
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'getCurrentVideoLies',
          videoId: videoId
        }, resolve);
      });
      
      if (response && response.success && response.lies) {
        currentVideoLies = response.lies;
        console.log('📋 Current video lies loaded:', currentVideoLies.length);
      } else {
        currentVideoLies = [];
      }
      
      updateLiesUI();
      
    } catch (error) {
      console.error('❌ Error loading current video lies:', error);
      currentVideoLies = [];
      updateLiesUI();
    }
  }
  
  function updateLiesUI() {
    // Update lies count
    const liesCountEl = document.getElementById('lies-count');
    if (liesCountEl) {
      liesCountEl.textContent = currentVideoLies.length;
    }
    
    // Update lies circle color based on count
    const liesCircle = document.getElementById('lies-circle');
    if (liesCircle) {
      if (currentVideoLies.length === 0) {
        liesCircle.style.background = 'linear-gradient(135deg, #34a853 0%, #137333 100%)';
      } else if (currentVideoLies.length <= 3) {
        liesCircle.style.background = 'linear-gradient(135deg, #fbbc04 0%, #ea8600 100%)';
      } else {
        liesCircle.style.background = 'linear-gradient(135deg, #ea4335 0%, #d33b2c 100%)';
      }
    }
    
    // Update lies list
    updateLiesList();
  }
  
  function updateLiesList() {
    const liesList = document.getElementById('lies-list');
    const noLiesMessage = document.getElementById('no-lies-message');
    
    if (!liesList || !noLiesMessage) return;
    
    if (currentVideoLies.length === 0) {
      liesList.style.display = 'none';
      noLiesMessage.style.display = 'block';
      return;
    }
    
    liesList.style.display = 'block';
    noLiesMessage.style.display = 'none';
    
    // Sort lies by timestamp
    const sortedLies = [...currentVideoLies].sort((a, b) => 
      (a.timestamp_seconds || 0) - (b.timestamp_seconds || 0)
    );
    
    liesList.innerHTML = sortedLies.map((lie, index) => {
      const timestamp = formatTimestamp(lie.timestamp_seconds || 0);
      const duration = lie.duration_seconds || 10;
      
      return `
        <div class="lie-item clickable-lie-item" data-timestamp="${lie.timestamp_seconds || 0}">
          <div class="lie-timestamp-badge">
            <span class="timestamp-icon">⏰</span>
            <span class="timestamp-value">${timestamp}</span>
            <div class="duration-info">${duration}s</div>
          </div>
          
          <div class="lie-text">
            <span class="lie-number">#${index + 1}</span>
            ${lie.claim_text || 'No claim text available'}
          </div>
          
          <div class="lie-explanation">
            ${lie.explanation || 'No explanation available'}
          </div>
          
          <div class="lie-meta">
            <span class="lie-confidence">
              Confidence: ${Math.round((lie.confidence || 0) * 100)}%
            </span>
            <span class="lie-severity-badge ${lie.severity || 'medium'}">
              ${lie.severity || 'medium'}
            </span>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers for timestamp jumping
    const lieItems = liesList.querySelectorAll('.clickable-lie-item');
    lieItems.forEach(item => {
      item.addEventListener('click', async () => {
        const timestamp = parseInt(item.dataset.timestamp);
        if (timestamp >= 0) {
          await jumpToTimestamp(timestamp);
        }
      });
    });
  }
  
  function formatTimestamp(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  
  async function jumpToTimestamp(timestamp) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) return;
      
      await sendMessageWithTimeout(tabs[0].id, {
        type: 'jumpToTimestamp',
        timestamp: timestamp
      }, 5000);
      
      showNotification(`Jumped to ${formatTimestamp(timestamp)}`, 'success');
      
    } catch (error) {
      console.error('❌ Error jumping to timestamp:', error);
      showNotification('Failed to jump to timestamp', 'error');
    }
  }
  
  function switchToTab(tabName) {
    const tab = document.querySelector(`[data-tab="${tabName}"]`);
    if (tab) {
      tab.click();
    }
  }
  
  async function updateSessionStats(statName, increment) {
    try {
      const result = await chrome.storage.local.get(['sessionStats']);
      const stats = result.sessionStats || {
        videosAnalyzed: 0,
        liesDetected: 0,
        timeSaved: 0
      };
      
      stats[statName] = (stats[statName] || 0) + increment;
      
      await chrome.storage.local.set({ sessionStats: stats });
      
      // Reload stats display
      await loadSessionStats();
      
    } catch (error) {
      console.error('❌ Error updating session stats:', error);
    }
  }
  
  async function clearCache() {
    try {
      // Clear analysis cache
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(allData).filter(key => 
        key.startsWith('analysis_') || 
        key.startsWith('currentVideoLies_') ||
        key === 'backgroundAnalysisState'
      );
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
      
      // Clear background state
      chrome.runtime.sendMessage({ type: 'clearAnalysisState' });
      
      showNotification(`Cleared ${keysToRemove.length} cached items`, 'success');
      
      // Reload current video lies
      await loadCurrentVideoLies();
      
    } catch (error) {
      console.error('❌ Error clearing cache:', error);
      showNotification('Failed to clear cache', 'error');
    }
  }
  
  async function exportSettings() {
    try {
      const settings = await chrome.storage.local.get([
        'aiProvider',
        'openaiModel', 
        'geminiModel',
        'analysisDuration',
        'skipLiesEnabled'
      ]);
      
      // Remove sensitive data
      delete settings.apiKey;
      
      const dataStr = JSON.stringify(settings, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'lieblocker-settings.json';
      link.click();
      
      URL.revokeObjectURL(url);
      
      showNotification('Settings exported successfully', 'success');
      
    } catch (error) {
      console.error('❌ Error exporting settings:', error);
      showNotification('Failed to export settings', 'error');
    }
  }
  
  function updateUI() {
    updateLiesUI();
    
    // Update analysis status based on background state
    if (backgroundState && backgroundState.isRunning) {
      updateAnalysisUI(true);
    }
  }
  
  function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
      notification.remove();
    });
    
    // Create notification
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
      <span class="notification-content">${message}</span>
      <button class="notification-close">×</button>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Add close handler
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      notification.classList.add('removing');
      setTimeout(() => notification.remove(), 300);
    });
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('removing');
        setTimeout(() => notification.remove(), 300);
      }
    }, 5000);
  }
  
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  // Listen for background messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Popup received message:', message.type);
    
    if (message.type === 'analysisProgress') {
      const statusText = document.getElementById('status-text');
      if (statusText) {
        statusText.textContent = message.message || 'Processing...';
      }
    } else if (message.type === 'liesUpdate') {
      if (message.claims) {
        currentVideoLies = message.claims;
        updateLiesUI();
        
        if (message.isComplete) {
          updateSessionStats('liesDetected', message.claims.length);
        }
      }
    } else if (message.type === 'analysisResult') {
      const messageText = typeof message.data === 'string' ? message.data : 
                         typeof message.data === 'object' && message.data.message ? message.data.message :
                         'Analysis completed';
      
      if (messageText.includes('Error')) {
        showNotification(messageText, 'error');
      } else if (messageText.includes('complete') || messageText.includes('cache')) {
        showNotification(messageText, 'success');
      }
    } else if (message.type === 'lieSkipped') {
      // Update time saved when lies are skipped
      updateSessionStats('timeSaved', message.duration || 10);
    }
    
    sendResponse({ success: true });
  });
  
})();