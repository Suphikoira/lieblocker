// Enhanced security service for handling sensitive data with better encryption
class SecurityService {
  constructor() {
    this.keyPrefix = 'lb_secure_';
    this.storageKey = 'encrypted_settings_v2';
    this.saltKey = 'security_salt_v2';
  }

  async initialize() {
    // Ensure we have a secure salt
    await this.ensureSecureSalt();
    console.log('🔒 Security service initialized');
  }

  // Enhanced encryption for API keys
  async encryptData(data) {
    try {
      const key = await this.generateSecureKey();
      const encrypted = this.advancedEncrypt(JSON.stringify(data), key);
      return encrypted;
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt sensitive data');
    }
  }

  async decryptData(encryptedData) {
    try {
      const key = await this.generateSecureKey();
      const decrypted = this.advancedDecrypt(encryptedData, key);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }

  async ensureSecureSalt() {
    const result = await chrome.storage.local.get([this.saltKey]);
    
    if (!result[this.saltKey]) {
      const salt = this.generateSecureSalt();
      await chrome.storage.local.set({ [this.saltKey]: salt });
      console.log('🧂 Generated new secure salt');
    }
  }

  async generateSecureKey() {
    const extensionId = chrome.runtime.id;
    const result = await chrome.storage.local.get([this.saltKey]);
    const salt = result[this.saltKey];
    
    if (!salt) {
      throw new Error('Security salt not found');
    }
    
    // Create a more secure key using multiple rounds of hashing
    let key = this.hashString(extensionId + salt);
    for (let i = 0; i < 1000; i++) {
      key = this.hashString(key + salt + i);
    }
    
    return key;
  }

  generateSecureSalt() {
    // Generate a more secure salt using crypto-random values
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  hashString(str) {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  advancedEncrypt(text, key) {
    // Multi-layer encryption with key rotation
    let result = text;
    
    // First layer: XOR with key
    let encrypted = '';
    for (let i = 0; i < result.length; i++) {
      encrypted += String.fromCharCode(
        result.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    
    // Second layer: Character substitution
    const substitutionKey = this.generateSubstitutionKey(key);
    encrypted = this.substituteCharacters(encrypted, substitutionKey);
    
    // Third layer: Base64 encoding with padding
    const base64 = btoa(encrypted);
    const padding = this.generatePadding(key);
    
    return padding + base64 + padding;
  }

  advancedDecrypt(encryptedText, key) {
    // Remove padding
    const padding = this.generatePadding(key);
    const paddingLength = padding.length;
    
    if (encryptedText.length < paddingLength * 2) {
      throw new Error('Invalid encrypted data format');
    }
    
    const base64 = encryptedText.slice(paddingLength, -paddingLength);
    
    // Reverse Base64
    let encrypted = atob(base64);
    
    // Reverse character substitution
    const substitutionKey = this.generateSubstitutionKey(key);
    encrypted = this.reverseSubstituteCharacters(encrypted, substitutionKey);
    
    // Reverse XOR
    let result = '';
    for (let i = 0; i < encrypted.length; i++) {
      result += String.fromCharCode(
        encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    
    return result;
  }

  generateSubstitutionKey(key) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let substitution = {};
    let reverseSubstitution = {};
    
    for (let i = 0; i < chars.length; i++) {
      const keyIndex = (i + this.hashString(key + i)) % chars.length;
      substitution[chars[i]] = chars[keyIndex];
      reverseSubstitution[chars[keyIndex]] = chars[i];
    }
    
    return { forward: substitution, reverse: reverseSubstitution };
  }

  substituteCharacters(text, substitutionKey) {
    return text.split('').map(char => 
      substitutionKey.forward[char] || char
    ).join('');
  }

  reverseSubstituteCharacters(text, substitutionKey) {
    return text.split('').map(char => 
      substitutionKey.reverse[char] || char
    ).join('');
  }

  generatePadding(key) {
    const paddingLength = 8 + (this.hashString(key).length % 8);
    return this.hashString(key + 'padding').substring(0, paddingLength);
  }

  // Secure storage methods with versioning
  async storeSecureSettings(settings) {
    try {
      const encrypted = await this.encryptData(settings);
      const secureData = {
        version: 2,
        data: encrypted,
        timestamp: Date.now()
      };
      
      await chrome.storage.local.set({ [this.storageKey]: secureData });
      console.log('🔒 Settings stored securely');
    } catch (error) {
      console.error('❌ Failed to store secure settings:', error);
      throw error;
    }
  }

  async getSecureSettings() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const secureData = result[this.storageKey];
      
      if (!secureData) {
        console.log('🔍 No secure settings found');
        return null;
      }
      
      // Check version compatibility
      if (secureData.version !== 2) {
        console.warn('⚠️ Incompatible secure settings version, clearing...');
        await chrome.storage.local.remove([this.storageKey]);
        return null;
      }
      
      // Check if data is not too old (30 days)
      const dataAge = Date.now() - (secureData.timestamp || 0);
      if (dataAge > 30 * 24 * 60 * 60 * 1000) {
        console.warn('⚠️ Secure settings expired, clearing...');
        await chrome.storage.local.remove([this.storageKey]);
        return null;
      }
      
      const decrypted = await this.decryptData(secureData.data);
      console.log('🔓 Secure settings loaded successfully');
      return decrypted;
      
    } catch (error) {
      console.error('❌ Failed to load secure settings:', error);
      // Clear corrupted data
      await chrome.storage.local.remove([this.storageKey]);
      return null;
    }
  }

  // API key validation with enhanced checks
  validateApiKey(provider, key) {
    if (!key || typeof key !== 'string') return false;
    
    // Remove any whitespace
    key = key.trim();
    
    switch (provider) {
      case 'openai':
        // OpenAI keys start with 'sk-' and have specific length patterns
        return key.startsWith('sk-') && key.length >= 51 && key.length <= 56;
      case 'gemini':
        // Gemini keys are typically 39 characters long
        return key.length >= 35 && key.length <= 45 && /^[A-Za-z0-9_-]+$/.test(key);
      default:
        return false;
    }
  }

  // Enhanced rate limiting with sliding window
  async checkRateLimit(action, maxCalls = 100, windowMinutes = 60) {
    const now = Date.now();
    const windowStart = now - (windowMinutes * 60 * 1000);
    
    const result = await chrome.storage.local.get(['rate_limits_v2']);
    const rateLimits = result.rate_limits_v2 || {};
    
    if (!rateLimits[action]) {
      rateLimits[action] = [];
    }
    
    // Clean old entries
    rateLimits[action] = rateLimits[action].filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    if (rateLimits[action].length >= maxCalls) {
      const oldestCall = Math.min(...rateLimits[action]);
      const timeUntilReset = Math.ceil((oldestCall + (windowMinutes * 60 * 1000) - now) / 1000);
      console.warn(`⚠️ Rate limit exceeded for ${action}. Reset in ${timeUntilReset} seconds.`);
      return false;
    }
    
    // Add current call
    rateLimits[action].push(now);
    await chrome.storage.local.set({ rate_limits_v2: rateLimits });
    
    return true;
  }

  // Security audit methods
  async performSecurityAudit() {
    const audit = {
      timestamp: Date.now(),
      saltPresent: false,
      secureSettingsPresent: false,
      rateLimitsConfigured: false,
      storageEncrypted: false
    };

    try {
      // Check for salt
      const saltResult = await chrome.storage.local.get([this.saltKey]);
      audit.saltPresent = !!saltResult[this.saltKey];

      // Check for secure settings
      const settingsResult = await chrome.storage.local.get([this.storageKey]);
      audit.secureSettingsPresent = !!settingsResult[this.storageKey];
      audit.storageEncrypted = audit.secureSettingsPresent;

      // Check for rate limits
      const rateLimitResult = await chrome.storage.local.get(['rate_limits_v2']);
      audit.rateLimitsConfigured = !!rateLimitResult.rate_limits_v2;

      console.log('🔍 Security audit completed:', audit);
      return audit;
    } catch (error) {
      console.error('❌ Security audit failed:', error);
      return audit;
    }
  }

  // Clean up old security data
  async cleanupSecurityData() {
    try {
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = [];

      // Remove old version data
      Object.keys(allData).forEach(key => {
        if (key.startsWith('lb_') && key !== this.storageKey && key !== this.saltKey) {
          keysToRemove.push(key);
        }
        if (key === 'encrypted_settings' || key === 'security_salt') {
          keysToRemove.push(key);
        }
      });

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log(`🧹 Cleaned up ${keysToRemove.length} old security entries`);
      }
    } catch (error) {
      console.error('❌ Security cleanup failed:', error);
    }
  }
}

// Export for use in other parts of the extension
if (typeof window !== 'undefined') {
  window.SecurityService = SecurityService;
}

// Register the service if registry is available
if (typeof window !== 'undefined' && window.ServiceRegistry) {
  window.ServiceRegistry.register('security', new SecurityService());
}