// Advanced rate limiting with different strategies
class RateLimiter {
  constructor() {
    this.limits = new Map();
    this.strategies = {
      FIXED_WINDOW: 'fixed_window',
      SLIDING_WINDOW: 'sliding_window',
      TOKEN_BUCKET: 'token_bucket'
    };
  }

  // Configure rate limit for an action
  configure(action, config) {
    this.limits.set(action, {
      strategy: config.strategy || this.strategies.SLIDING_WINDOW,
      maxRequests: config.maxRequests || 100,
      windowMs: config.windowMs || 60000,
      tokensPerInterval: config.tokensPerInterval || 10,
      maxTokens: config.maxTokens || 100,
      ...config
    });
  }

  // Check if action is allowed
  async isAllowed(action, identifier = 'default') {
    const config = this.limits.get(action);
    if (!config) {
      // No limit configured, allow by default
      return { allowed: true };
    }

    const key = `${action}_${identifier}`;
    
    switch (config.strategy) {
      case this.strategies.FIXED_WINDOW:
        return await this.checkFixedWindow(key, config);
      case this.strategies.SLIDING_WINDOW:
        return await this.checkSlidingWindow(key, config);
      case this.strategies.TOKEN_BUCKET:
        return await this.checkTokenBucket(key, config);
      default:
        return { allowed: true };
    }
  }

  async checkSlidingWindow(key, config) {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    const result = await chrome.storage.local.get([`rate_${key}`]);
    const requests = (result[`rate_${key}`] || []).filter(time => time > windowStart);
    
    if (requests.length >= config.maxRequests) {
      const oldestRequest = Math.min(...requests);
      const resetTime = oldestRequest + config.windowMs;
      
      return {
        allowed: false,
        resetTime: resetTime,
        remaining: 0,
        total: config.maxRequests
      };
    }

    // Add current request
    requests.push(now);
    await chrome.storage.local.set({ [`rate_${key}`]: requests });

    return {
      allowed: true,
      remaining: config.maxRequests - requests.length,
      total: config.maxRequests,
      resetTime: now + config.windowMs
    };
  }

  async checkFixedWindow(key, config) {
    const now = Date.now();
    const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
    
    const result = await chrome.storage.local.get([`rate_${key}_${windowStart}`]);
    const count = result[`rate_${key}_${windowStart}`] || 0;
    
    if (count >= config.maxRequests) {
      return {
        allowed: false,
        resetTime: windowStart + config.windowMs,
        remaining: 0,
        total: config.maxRequests
      };
    }

    // Increment counter
    await chrome.storage.local.set({ [`rate_${key}_${windowStart}`]: count + 1 });

    return {
      allowed: true,
      remaining: config.maxRequests - count - 1,
      total: config.maxRequests,
      resetTime: windowStart + config.windowMs
    };
  }

  async checkTokenBucket(key, config) {
    const now = Date.now();
    const result = await chrome.storage.local.get([`bucket_${key}`]);
    const bucket = result[`bucket_${key}`] || {
      tokens: config.maxTokens,
      lastRefill: now
    };

    // Calculate tokens to add
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(timePassed / config.windowMs) * config.tokensPerInterval;
    
    bucket.tokens = Math.min(config.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      return {
        allowed: false,
        remaining: bucket.tokens,
        total: config.maxTokens
      };
    }

    // Consume token
    bucket.tokens -= 1;
    await chrome.storage.local.set({ [`bucket_${key}`]: bucket });

    return {
      allowed: true,
      remaining: bucket.tokens,
      total: config.maxTokens
    };
  }

  // Clean up old rate limit data
  async cleanup() {
    const allData = await chrome.storage.local.get(null);
    const keysToRemove = [];
    const now = Date.now();

    Object.keys(allData).forEach(key => {
      if (key.startsWith('rate_') || key.startsWith('bucket_')) {
        // Remove data older than 24 hours
        const parts = key.split('_');
        if (parts.length > 2) {
          const timestamp = parseInt(parts[parts.length - 1]);
          if (!isNaN(timestamp) && now - timestamp > 24 * 60 * 60 * 1000) {
            keysToRemove.push(key);
          }
        }
      }
    });

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`🧹 Cleaned up ${keysToRemove.length} old rate limit entries`);
    }
  }
}

// Initialize global rate limiter
window.RateLimiter = new RateLimiter();

// Configure default limits
window.RateLimiter.configure('ai_analysis', {
  strategy: 'sliding_window',
  maxRequests: 50,
  windowMs: 60 * 60 * 1000 // 1 hour
});

window.RateLimiter.configure('api_call', {
  strategy: 'token_bucket',
  maxTokens: 100,
  tokensPerInterval: 10,
  windowMs: 60 * 1000 // 1 minute
});