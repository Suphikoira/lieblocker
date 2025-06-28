// Input validation and sanitization utilities
class Validator {
  // Validate and sanitize API keys
  static validateApiKey(provider, key) {
    if (!key || typeof key !== 'string') {
      return { valid: false, error: 'API key is required' };
    }

    // Remove whitespace and normalize
    key = key.trim();

    if (key.length === 0) {
      return { valid: false, error: 'API key cannot be empty' };
    }

    switch (provider) {
      case 'openai':
        if (!key.startsWith('sk-')) {
          return { valid: false, error: 'OpenAI API key must start with "sk-"' };
        }
        if (key.length < 51 || key.length > 56) {
          return { valid: false, error: 'OpenAI API key has invalid length' };
        }
        if (!/^sk-[A-Za-z0-9]+$/.test(key)) {
          return { valid: false, error: 'OpenAI API key contains invalid characters' };
        }
        break;

      case 'gemini':
        if (key.length < 35 || key.length > 45) {
          return { valid: false, error: 'Gemini API key has invalid length' };
        }
        if (!/^[A-Za-z0-9_-]+$/.test(key)) {
          return { valid: false, error: 'Gemini API key contains invalid characters' };
        }
        break;

      default:
        return { valid: false, error: 'Unsupported AI provider' };
    }

    return { valid: true, sanitized: key };
  }

  // Validate video ID
  static validateVideoId(videoId) {
    if (!videoId || typeof videoId !== 'string') {
      return { valid: false, error: 'Video ID is required' };
    }

    // YouTube video IDs are 11 characters long
    if (videoId.length !== 11) {
      return { valid: false, error: 'Invalid YouTube video ID length' };
    }

    // YouTube video IDs contain only alphanumeric characters, hyphens, and underscores
    if (!/^[A-Za-z0-9_-]+$/.test(videoId)) {
      return { valid: false, error: 'Invalid YouTube video ID format' };
    }

    return { valid: true, sanitized: videoId };
  }

  // Validate analysis duration
  static validateAnalysisDuration(duration) {
    const numDuration = parseInt(duration);
    
    if (isNaN(numDuration)) {
      return { valid: false, error: 'Analysis duration must be a number' };
    }

    if (numDuration < 5 || numDuration > 60) {
      return { valid: false, error: 'Analysis duration must be between 5 and 60 minutes' };
    }

    return { valid: true, sanitized: numDuration };
  }

  // Sanitize text input to prevent XSS
  static sanitizeText(text) {
    if (typeof text !== 'string') return '';
    
    return text
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocols
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  // Validate URL
  static validateUrl(url, allowedDomains = []) {
    try {
      const urlObj = new URL(url);
      
      // Check protocol
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { valid: false, error: 'Invalid URL protocol' };
      }

      // Check domain if restrictions apply
      if (allowedDomains.length > 0) {
        const isAllowed = allowedDomains.some(domain => 
          urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
        );
        
        if (!isAllowed) {
          return { valid: false, error: 'Domain not allowed' };
        }
      }

      return { valid: true, sanitized: url };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  // Validate timestamp
  static validateTimestamp(timestamp) {
    const numTimestamp = parseInt(timestamp);
    
    if (isNaN(numTimestamp)) {
      return { valid: false, error: 'Timestamp must be a number' };
    }

    if (numTimestamp < 0) {
      return { valid: false, error: 'Timestamp cannot be negative' };
    }

    // Max video length: 12 hours (43200 seconds)
    if (numTimestamp > 43200) {
      return { valid: false, error: 'Timestamp exceeds maximum video length' };
    }

    return { valid: true, sanitized: numTimestamp };
  }
}

window.Validator = Validator;