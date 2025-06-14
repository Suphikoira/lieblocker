// Enhanced popup script with Supabase integration and comprehensive functionality
document.addEventListener('DOMContentLoaded', function() {
  // Initialize all components
  initializeTabs();
  initializeSettings();
  initializeSupabaseConfig();
  initializeAnalysisFeatures();
  initializeSessionStats();
  loadCurrentLies();
  
  // Update UI periodically
  setInterval(updateSessionStats, 5000);
  setInterval(checkAnalysisState, 2000);
});

// Tab Management
function initializeTabs() {
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
    });
  });
}

// Supabase Configuration Management
function initializeSupabaseConfig() {
  const urlInput = document.getElementById('supabase-url');
  const keyInput = document.getElementById('supabase-anon-key');
  const testButton = document.getElementById('test-supabase-connection');
  const clearButton = document.getElementById('clear-supabase-config');
  const statusDot = document.getElementById('supabase-status-dot');
  const statusText = document.getElementById('supabase-status-text');
  
  // Load existing configuration
  loadSupabaseConfig();
  
  // Save configuration on input change
  urlInput.addEventListener('input', debounce(saveSupabaseConfig, 500));
  keyInput.addEventListener('input', debounce(saveSupabaseConfig, 500));
  
  // Test connection button
  testButton.addEventListener('click', testSupabaseConnection);
  
  // Clear configuration button
  clearButton.addEventListener('click', clearSupabaseConfig);
  
  // Initial status check
  updateSupabaseStatus();
}

async function loadSupabaseConfig() {
  try {
    const settings = await chrome.storage.sync.get(['supabaseUrl', 'supabaseAnonKey']);
    
    if (settings.supabaseUrl) {
      document.getElementById('supabase-url').value = settings.supabaseUrl;
    }
    
    if (settings.supabaseAnonKey) {
      document.getElementById('supabase-anon-key').value = settings.supabaseAnonKey;
    }
    
    updateSupabaseStatus();
  } catch (error) {
    console.error('Error loading Supabase config:', error);
    showNotification('Error loading Supabase configuration', 'error');
  }
}

async function saveSupabaseConfig() {
  try {
    const url = document.getElementById('supabase-url').value.trim();
    const key = document.getElementById('supabase-anon-key').value.trim();
    
    // Validate URL format
    if (url && !isValidSupabaseUrl(url)) {
      showFieldError('supabase-url', 'Please enter a valid Supabase URL (https://your-project.supabase.co)');
      return;
    }
    
    // Clear previous errors
    clearFieldError('supabase-url');
    clearFieldError('supabase-anon-key');
    
    // Save to storage
    await chrome.storage.sync.set({
      supabaseUrl: url,
      supabaseAnonKey: key
    });
    
    if (url && key) {
      showFieldSuccess('supabase-url', 'Configuration saved');
      showFieldSuccess('supabase-anon-key', 'Key saved securely');
    }
    
    updateSupabaseStatus();
    
  } catch (error) {
    console.error('Error saving Supabase config:', error);
    showNotification('Error saving Supabase configuration', 'error');
  }
}

async function testSupabaseConnection() {
  const testButton = document.getElementById('test-supabase-connection');
  const statusDot = document.getElementById('supabase-status-dot');
  const statusText = document.getElementById('supabase-status-text');
  
  try {
    // Show loading state
    testButton.textContent = 'Testing...';
    testButton.disabled = true;
    statusDot.className = 'status-indicator warning';
    statusText.textContent = 'Testing connection...';
    
    // Get current configuration
    const url = document.getElementById('supabase-url').value.trim();
    const key = document.getElementById('supabase-anon-key').value.trim();
    
    if (!url || !key) {
      throw new Error('Please enter both Supabase URL and Anon Key');
    }
    
    if (!isValidSupabaseUrl(url)) {
      throw new Error('Please enter a valid Supabase URL');
    }
    
    // Test connection by calling a simple endpoint
    const response = await fetch(`${url}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      // Connection successful
      statusDot.className = 'status-indicator connected';
      statusText.textContent = 'Connected successfully';
      showNotification('Supabase connection successful!', 'success');
      
      // Save the working configuration
      await saveSupabaseConfig();
      
    } else {
      throw new Error(`Connection failed: ${response.status} ${response.statusText}`);
    }
    
  } catch (error) {
    console.error('Supabase connection test failed:', error);
    
    statusDot.className = 'status-indicator';
    statusText.textContent = `Connection failed: ${error.message}`;
    showNotification(`Connection failed: ${error.message}`, 'error');
    
  } finally {
    // Reset button state
    testButton.textContent = 'Test Connection';
    testButton.disabled = false;
  }
}

async function clearSupabaseConfig() {
  try {
    await chrome.storage.sync.remove(['supabaseUrl', 'supabaseAnonKey']);
    
    document.getElementById('supabase-url').value = '';
    document.getElementById('supabase-anon-key').value = '';
    
    clearFieldError('supabase-url');
    clearFieldError('supabase-anon-key');
    clearFieldSuccess('supabase-url');
    clearFieldSuccess('supabase-anon-key');
    
    updateSupabaseStatus();
    
    showNotification('Supabase configuration cleared', 'info');
    
  } catch (error) {
    console.error('Error clearing Supabase config:', error);
    showNotification('Error clearing configuration', 'error');
  }
}

function updateSupabaseStatus() {
  const statusDot = document.getElementById('supabase-status-dot');
  const statusText = document.getElementById('supabase-status-text');
  const url = document.getElementById('supabase-url').value.trim();
  const key = document.getElementById('supabase-anon-key').value.trim();
  
  if (url && key && isValidSupabaseUrl(url)) {
    statusDot.className = 'status-indicator warning';
    statusText.textContent = 'Configured (click Test Connection to verify)';
  } else if (url || key) {
    statusDot.className = 'status-indicator warning';
    statusText.textContent = 'Incomplete configuration';
  } else {
    statusDot.className = 'status-indicator';
    statusText.textContent = 'Not configured';
  }
}

function isValidSupabaseUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('supabase.co') && urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

// Settings Management
function initializeSettings() {
  loadAllSettings();
  
  // API Provider change handler
  document.getElementById('ai-provider').addEventListener('change', function() {
    const provider = this.value;
    toggleModelSelection(provider);
    saveSettings();
    updateApiKeyPlaceholder();
  });
  
  // Model selection handlers
  document.getElementById('openai-model').addEventListener('change', saveSettings);
  document.getElementById('gemini-model').addEventListener('change', saveSettings);
  
  // API Key handler
  document.getElementById('api-key').addEventListener('input', debounce(saveApiKey, 500));
  
  // Supadata token handler
  document.getElementById('supadata-token').addEventListener('input', debounce(saveSupadataToken, 500));
  
  // Detection mode handler
  document.getElementById('detection-mode').addEventListener('change', function() {
    saveSettings();
    updateDetectionMode();
  });
  
  // Analysis duration handler
  const durationSlider = document.getElementById('analysis-duration');
  const durationDisplay = document.getElementById('duration-display');
  
  durationSlider.addEventListener('input', function() {
    const value = this.value;
    durationDisplay.textContent = `${value} min`;
  });
  
  durationSlider.addEventListener('change', saveSettings);
  
  // Cache management
  document.getElementById('clear-cache').addEventListener('click', clearCache);
  document.getElementById('export-settings').addEventListener('click', exportSettings);
}

async function loadAllSettings() {
  try {
    const settings = await chrome.storage.sync.get([
      'aiProvider', 'openaiModel', 'geminiModel', 'detectionMode', 'analysisDuration'
    ]);
    
    // Set AI provider
    const provider = settings.aiProvider || 'openai';
    document.getElementById('ai-provider').value = provider;
    toggleModelSelection(provider);
    
    // Set models
    if (settings.openaiModel) {
      document.getElementById('openai-model').value = settings.openaiModel;
    }
    if (settings.geminiModel) {
      document.getElementById('gemini-model').value = settings.geminiModel;
    }
    
    // Set detection mode
    if (settings.detectionMode) {
      document.getElementById('detection-mode').value = settings.detectionMode;
    }
    
    // Set analysis duration
    const duration = settings.analysisDuration || 20;
    document.getElementById('analysis-duration').value = duration;
    document.getElementById('duration-display').textContent = `${duration} min`;
    
    updateApiKeyPlaceholder();
    
    // Load API keys
    const apiKeys = await chrome.storage.local.get(['openaiApiKey', 'geminiApiKey', 'supadataToken']);
    
    if (apiKeys.openaiApiKey || apiKeys.geminiApiKey) {
      const currentProvider = document.getElementById('ai-provider').value;
      const keyExists = currentProvider === 'openai' ? apiKeys.openaiApiKey : apiKeys.geminiApiKey;
      if (keyExists) {
        document.getElementById('api-key').value = '••••••••••••••••';
        showFieldSuccess('api-key', 'API key configured');
      }
    }
    
    if (apiKeys.supadataToken) {
      document.getElementById('supadata-token').value = '••••••••••••••••';
      showFieldSuccess('supadata-token', 'Token configured');
    }
    
  } catch (error) {
    console.error('Error loading settings:', error);
    showNotification('Error loading settings', 'error');
  }
}

async function saveSettings() {
  try {
    const settings = {
      aiProvider: document.getElementById('ai-provider').value,
      openaiModel: document.getElementById('openai-model').value,
      geminiModel: document.getElementById('gemini-model').value,
      detectionMode: document.getElementById('detection-mode').value,
      analysisDuration: parseInt(document.getElementById('analysis-duration').value)
    };
    
    await chrome.storage.sync.set(settings);
    
  } catch (error) {
    console.error('Error saving settings:', error);
    showNotification('Error saving settings', 'error');
  }
}

async function saveApiKey() {
  try {
    const provider = document.getElementById('ai-provider').value;
    const apiKey = document.getElementById('api-key').value.trim();
    
    if (apiKey && apiKey !== '••••••••••••••••') {
      const keyName = `${provider}ApiKey`;
      await chrome.storage.local.set({ [keyName]: apiKey });
      
      document.getElementById('api-key').value = '••••••••••••••••';
      showFieldSuccess('api-key', 'API key saved securely');
    }
    
  } catch (error) {
    console.error('Error saving API key:', error);
    showFieldError('api-key', 'Error saving API key');
  }
}

async function saveSupadataToken() {
  try {
    const token = document.getElementById('supadata-token').value.trim();
    
    if (token && token !== '••••••••••••••••') {
      await chrome.storage.local.set({ supadataToken: token });
      
      document.getElementById('supadata-token').value = '••••••••••••••••';
      showFieldSuccess('supadata-token', 'Token saved securely');
    }
    
  } catch (error) {
    console.error('Error saving Supadata token:', error);
    showFieldError('supadata-token', 'Error saving token');
  }
}

function toggleModelSelection(provider) {
  const openaiModels = document.getElementById('openai-models');
  const geminiModels = document.getElementById('gemini-models');
  
  if (provider === 'openai') {
    openaiModels.classList.remove('hidden');
    geminiModels.classList.add('hidden');
  } else {
    openaiModels.classList.add('hidden');
    geminiModels.classList.remove('hidden');
  }
}

function updateApiKeyPlaceholder() {
  const provider = document.getElementById('ai-provider').value;
  const apiKeyInput = document.getElementById('api-key');
  
  if (provider === 'openai') {
    apiKeyInput.placeholder = 'Enter your OpenAI API key...';
  } else {
    apiKeyInput.placeholder = 'Enter your Gemini API key...';
  }
}

// Analysis Features
function initializeAnalysisFeatures() {
  document.getElementById('analyze-current').addEventListener('click', analyzeCurrentVideo);
  document.getElementById('download-lies-data').addEventListener('click', downloadLiesData);
  
  // Check if we're on a YouTube video page
  checkCurrentPage();
}

async function checkCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab.url && tab.url.includes('youtube.com/watch')) {
      document.getElementById('analyze-current').disabled = false;
      
      // Send message to content script to check page status
      chrome.tabs.sendMessage(tab.id, { type: 'checkPageStatus' }, (response) => {
        if (response && response.isVideoPage) {
          updateAnalysisStatus('ready', `Ready to analyze: ${response.videoTitle}`);
        }
      });
    } else {
      document.getElementById('analyze-current').disabled = true;
      updateAnalysisStatus('not-youtube', 'Navigate to a YouTube video to analyze');
    }
  } catch (error) {
    console.error('Error checking current page:', error);
    updateAnalysisStatus('error', 'Error checking current page');
  }
}

async function analyzeCurrentVideo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url || !tab.url.includes('youtube.com/watch')) {
      showNotification('Please navigate to a YouTube video first', 'warning');
      return;
    }
    
    // Send message to content script to start analysis
    chrome.tabs.sendMessage(tab.id, { type: 'startAnalysis' }, (response) => {
      if (response && response.success) {
        updateAnalysisStatus('analyzing', 'Analysis started...');
        showNotification('Video analysis started', 'info');
      } else {
        showNotification('Error starting analysis', 'error');
      }
    });
    
  } catch (error) {
    console.error('Error analyzing video:', error);
    showNotification('Error starting video analysis', 'error');
  }
}

function updateAnalysisStatus(status, message) {
  const statusElement = document.getElementById('analysis-status');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  
  statusElement.style.display = 'flex';
  statusText.textContent = message;
  
  // Update status indicator
  statusDot.className = 'status-indicator';
  switch (status) {
    case 'ready':
      statusDot.classList.add('connected');
      break;
    case 'analyzing':
      statusDot.classList.add('warning');
      break;
    case 'error':
      // Default red color
      break;
    case 'not-youtube':
      statusDot.classList.add('warning');
      break;
  }
}

// Session Statistics
function initializeSessionStats() {
  updateSessionStats();
}

async function updateSessionStats() {
  try {
    const stats = await chrome.storage.local.get(['sessionStats']);
    const sessionStats = stats.sessionStats || {
      videosAnalyzed: 0,
      liesDetected: 0,
      highSeverity: 0,
      timeSaved: 0
    };
    
    document.getElementById('videos-analyzed').textContent = sessionStats.videosAnalyzed;
    document.getElementById('lies-detected').textContent = sessionStats.liesDetected;
    document.getElementById('high-severity').textContent = sessionStats.highSeverity;
    
    // Format time saved
    const timeSaved = sessionStats.timeSaved;
    if (timeSaved >= 60) {
      const minutes = Math.floor(timeSaved / 60);
      const seconds = timeSaved % 60;
      document.getElementById('time-saved').textContent = `${minutes}m ${seconds}s`;
    } else {
      document.getElementById('time-saved').textContent = `${timeSaved}s`;
    }
    
  } catch (error) {
    console.error('Error updating session stats:', error);
  }
}

// Lies Management
async function loadCurrentLies() {
  try {
    // Get current video ID from active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url || !tab.url.includes('youtube.com/watch')) {
      return;
    }
    
    const urlParams = new URLSearchParams(tab.url.split('?')[1]);
    const videoId = urlParams.get('v');
    
    if (!videoId) {
      return;
    }
    
    // Load cached analysis for this video
    const result = await chrome.storage.local.get(`analysis_${videoId}`);
    const cached = result[`analysis_${videoId}`];
    
    if (cached && cached.claims) {
      updateLiesDisplay(cached.claims);
      updateLiesCount(cached.claims.length);
      enableDownloadButton(cached.claims.length > 0);
    }
    
  } catch (error) {
    console.error('Error loading current lies:', error);
  }
}

function updateLiesDisplay(lies) {
  const liesList = document.getElementById('lies-list');
  const noLiesMessage = document.getElementById('no-lies-message');
  
  if (!lies || lies.length === 0) {
    liesList.style.display = 'none';
    noLiesMessage.style.display = 'block';
    return;
  }
  
  liesList.style.display = 'block';
  noLiesMessage.style.display = 'none';
  
  liesList.innerHTML = lies.map((lie, index) => {
    const severityClass = lie.severity || 'medium';
    const confidence = Math.round((lie.confidence || 0) * 100);
    
    return `
      <div class="lie-item clickable-lie-item" data-timestamp="${lie.timeInSeconds}">
        <div class="lie-header">
          <span class="lie-number">#${index + 1}</span>
          <span class="lie-timestamp">${lie.timestamp}</span>
        </div>
        <div class="lie-text">${lie.claim}</div>
        <div class="lie-explanation">${lie.explanation}</div>
        <div class="lie-meta">
          <span class="lie-confidence">${confidence}% confidence</span>
          <span class="lie-severity ${severityClass}">${severityClass}</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers for timestamp jumping
  liesList.querySelectorAll('.clickable-lie-item').forEach(item => {
    item.addEventListener('click', () => {
      const timestamp = parseInt(item.dataset.timestamp);
      jumpToTimestamp(timestamp);
    });
  });
}

function updateLiesCount(count) {
  const liesCount = document.getElementById('lies-count');
  const liesCircle = document.getElementById('lies-circle');
  
  liesCount.textContent = count;
  
  // Update circle color based on count
  if (count === 0) {
    liesCircle.style.background = 'linear-gradient(135deg, #34a853 0%, #137333 100%)';
  } else if (count <= 3) {
    liesCircle.style.background = 'linear-gradient(135deg, #fbbc04 0%, #ea8600 100%)';
  } else {
    liesCircle.style.background = 'linear-gradient(135deg, #ea4335 0%, #d33b2c 100%)';
  }
}

function enableDownloadButton(enabled) {
  const downloadButton = document.getElementById('download-lies-data');
  const downloadSection = document.getElementById('download-section');
  
  if (enabled) {
    downloadButton.classList.remove('disabled');
    downloadSection.style.display = 'block';
  } else {
    downloadButton.classList.add('disabled');
    downloadSection.style.display = 'none';
  }
}

async function jumpToTimestamp(timestamp) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tab.id, { 
      type: 'jumpToTimestamp', 
      timestamp: timestamp 
    }, (response) => {
      if (response && response.success) {
        showNotification(`Jumped to ${formatTimestamp(timestamp)}`, 'success');
      } else {
        showNotification('Error jumping to timestamp', 'error');
      }
    });
    
  } catch (error) {
    console.error('Error jumping to timestamp:', error);
    showNotification('Error jumping to timestamp', 'error');
  }
}

function formatTimestamp(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Download functionality
function downloadLiesData() {
  const downloadButton = document.getElementById('download-lies-data');
  
  if (downloadButton.classList.contains('disabled')) {
    showNotification('No lies data available to download', 'warning');
    return;
  }
  
  // Trigger download from content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.executeScript(tabs[0].id, {
      code: `
        if (window.LieBlockerDetectedLies && window.LieBlockerDetectedLies.downloadLiesData) {
          window.LieBlockerDetectedLies.downloadLiesData();
        } else {
          console.log('No lies data available for download');
        }
      `
    });
  });
  
  showNotification('Download started', 'success');
}

// Cache Management
async function clearCache() {
  try {
    const allData = await chrome.storage.local.get(null);
    const analysisKeys = Object.keys(allData).filter(key => key.startsWith('analysis_'));
    
    if (analysisKeys.length > 0) {
      await chrome.storage.local.remove(analysisKeys);
      showNotification(`Cleared ${analysisKeys.length} cached analyses`, 'success');
    } else {
      showNotification('No cache data to clear', 'info');
    }
    
    // Reset lies display
    updateLiesDisplay([]);
    updateLiesCount(0);
    enableDownloadButton(false);
    
  } catch (error) {
    console.error('Error clearing cache:', error);
    showNotification('Error clearing cache', 'error');
  }
}

async function exportSettings() {
  try {
    const settings = await chrome.storage.sync.get(null);
    
    // Remove sensitive data
    const exportData = { ...settings };
    delete exportData.supabaseAnonKey;
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `lieblocker-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Settings exported successfully', 'success');
    
  } catch (error) {
    console.error('Error exporting settings:', error);
    showNotification('Error exporting settings', 'error');
  }
}

// Detection Mode Updates
async function updateDetectionMode() {
  try {
    const mode = document.getElementById('detection-mode').value;
    
    // Send message to content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab.url && tab.url.includes('youtube.com/watch')) {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'updateDetectionMode', 
        mode: mode 
      });
    }
    
  } catch (error) {
    console.error('Error updating detection mode:', error);
  }
}

// Analysis State Monitoring
async function checkAnalysisState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getAnalysisState' });
    
    if (response && response.isRunning) {
      updateAnalysisStatus('analyzing', response.progress || 'Analysis in progress...');
    } else if (response && response.results) {
      updateAnalysisStatus('ready', 'Analysis complete');
      
      // Refresh lies display
      loadCurrentLies();
    }
    
  } catch (error) {
    // Background script might not be ready, ignore
  }
}

// Message Listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'analysisProgress':
      updateAnalysisStatus('analyzing', message.message);
      break;
      
    case 'analysisResult':
      updateAnalysisStatus('ready', 'Analysis complete');
      loadCurrentLies();
      break;
      
    case 'liesUpdate':
      if (message.claims) {
        updateLiesDisplay(message.claims);
        updateLiesCount(message.claims.length);
        enableDownloadButton(message.claims.length > 0);
      }
      break;
      
    case 'STATS_UPDATE':
      updateSessionStats();
      break;
  }
});

// Utility Functions
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

function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll('.notification');
  existingNotifications.forEach(n => n.remove());
  
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
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.classList.add('removing');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }
  }, 5000);
  
  // Manual close
  notification.querySelector('.notification-close').addEventListener('click', () => {
    notification.classList.add('removing');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  });
}

function showFieldError(fieldId, message) {
  const errorElement = document.getElementById(`${fieldId}-error`);
  const successElement = document.getElementById(`${fieldId}-success`);
  
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
  
  if (successElement) {
    successElement.style.display = 'none';
  }
}

function showFieldSuccess(fieldId, message) {
  const errorElement = document.getElementById(`${fieldId}-error`);
  const successElement = document.getElementById(`${fieldId}-success`);
  
  if (successElement) {
    successElement.textContent = message;
    successElement.style.display = 'block';
  }
  
  if (errorElement) {
    errorElement.style.display = 'none';
  }
}

function clearFieldError(fieldId) {
  const errorElement = document.getElementById(`${fieldId}-error`);
  if (errorElement) {
    errorElement.style.display = 'none';
  }
}

function clearFieldSuccess(fieldId) {
  const successElement = document.getElementById(`${fieldId}-success`);
  if (successElement) {
    successElement.style.display = 'none';
  }
}