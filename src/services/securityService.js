// Security service for handling sensitive data
class SecurityService {
  constructor() {
    this.keyPrefix = 'lb_';
    this.storageKey = 'encrypted_settings';
  }

  // Simple encryption for API keys (better than plain text)
  async encryptData(data) {
    try {
      // Generate a simple key based on extension ID and timestamp
      const key = await this.generateKey();
      const encrypted = this.simpleEncrypt(JSON.stringify(data), key);
      return encrypted;
    } catch (error) {
      console.error('Encryption failed:', error);
      return data; // Fallback to unencrypted
    }
  }

  async decryptData(encryptedData) {
    try {
      const key = await this.generateKey();
      const decrypted = this.simpleDecrypt(encryptedData, key);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }

  async generateKey() {
    // Use extension ID and a stored salt for key generation
    const extensionId = chrome.runtime.id;
    const result = await chrome.storage.local.get(['security_salt']);
    
    let salt = result.security_salt;
    if (!salt) {
      salt = this.generateSalt();
      await chrome.storage.local.set({ security_salt: salt });
    }
    
    return this.hashString(extensionId + salt);
  }

  generateSalt() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  simpleEncrypt(text, key) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(
        text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    return btoa(result);
  }

  simpleDecrypt(encryptedText, key) {
    const text = atob(encryptedText);
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(
        text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    return result;
  }

  // Secure storage methods
  async storeSecureSettings(settings) {
    const encrypted = await this.encryptData(settings);
    await chrome.storage.local.set({ [this.storageKey]: encrypted });
  }

  async getSecureSettings() {
    const result = await chrome.storage.local.get([this.storageKey]);
    const encrypted = result[this.storageKey];
    
    if (!encrypted) return null;
    
    return await this.decryptData(encrypted);
  }

  // API key validation
  validateApiKey(provider, key) {
    if (!key || typeof key !== 'string') return false;
    
    switch (provider) {
      case 'openai':
        return key.startsWith('sk-') && key.length > 20;
      case 'gemini':
        return key.length > 20; // Basic length check
      default:
        return false;
    }
  }

  // Rate limiting for API calls
  async checkRateLimit(action, maxCalls = 100, windowMinutes = 60) {
    const now = Date.now();
    const windowStart = now - (windowMinutes * 60 * 1000);
    
    const result = await chrome.storage.local.get(['rate_limits']);
    const rateLimits = result.rate_limits || {};
    
    if (!rateLimits[action]) {
      rateLimits[action] = [];
    }
    
    // Clean old entries
    rateLimits[action] = rateLimits[action].filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    if (rateLimits[action].length >= maxCalls) {
      return false;
    }
    
    // Add current call
    rateLimits[action].push(now);
    await chrome.storage.local.set({ rate_limits: rateLimits });
    
    return true;
  }
}

// Export for use in other parts of the extension
window.SecurityService = SecurityService;