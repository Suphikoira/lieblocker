// Advanced rate limiting with different strategies and free model support
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

  // Check if action is allowed with provider-specific limits
  async isAllowed(action, identifier = 'default', provider = null, model = null) {
    // Get base config
    let config = this.limits.get(action);
    if (!config) {
      // No limit configured, allow by default
      return { allowed: true };
    }

    // Apply provider-specific limits for free models
    if (provider && model) {
      config = this.getProviderSpecificLimits(config, provider, model);
    }

    const key = `${action}_${identifier}_${provider || 'default'}`;
    
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

  // Get provider-specific rate limits
  getProviderSpecificLimits(baseConfig, provider, model) {
    const config = { ...baseConfig };

    if (provider === 'openrouter' && model && model.includes(':free')) {
      // OpenRouter free models: 20 requests per minute
      console.log('🆓 Applying OpenRouter free model limits: 20 requests/minute');
      config.maxRequests = 20;
      config.windowMs = 60000; // 1 minute
      config.strategy = this.strategies.SLIDING_WINDOW;
    } else if (provider === 'gemini' && model && model.includes('flash')) {
      // Gemini Flash models have higher limits but still need throttling
      console.log('⚡ Applying Gemini Flash model limits: 60 requests/minute');
      config.maxRequests = 60;
      config.windowMs = 60000;
    } else if (provider === 'openai') {
      // OpenAI has different tiers, be conservative
      console.log('🤖 Applying OpenAI limits: 50 requests/minute');
      config.maxRequests = 50;
      config.windowMs = 60000;
    }

    return config;
  }

  async checkSlidingWindow(key, config) {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    const result = await chrome.storage.local.get([`rate_${key}`]);
    const requests = (result[`rate_${key}`] || []).filter(time => time > windowStart);
    
    if (requests.length >= config.maxRequests) {
      const oldestRequest = Math.min(...requests);
      const resetTime = oldestRequest + config.windowMs;
      const waitTimeMs = resetTime - now;
      
      console.warn(`⚠️ Rate limit exceeded for ${key}: ${requests.length}/${config.maxRequests} requests in window`);
      
      return {
        allowed: false,
        resetTime: resetTime,
        waitTimeMs: waitTimeMs,
        waitTimeSeconds: Math.ceil(waitTimeMs / 1000),
        remaining: 0,
        total: config.maxRequests,
        message: `Rate limit exceeded. Please wait ${Math.ceil(waitTimeMs / 1000)} seconds.`
      };
    }

    // Add current request
    requests.push(now);
    await chrome.storage.local.set({ [`rate_${key}`]: requests });

    const remaining = config.maxRequests - requests.length;
    console.log(`✅ Rate limit check passed for ${key}: ${requests.length}/${config.maxRequests} requests used, ${remaining} remaining`);

    return {
      allowed: true,
      remaining: remaining,
      total: config.maxRequests,
      resetTime: now + config.windowMs,
      used: requests.length
    };
  }

  async checkFixedWindow(key, config) {
    const now = Date.now();
    const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
    
    const result = await chrome.storage.local.get([`rate_${key}_${windowStart}`]);
    const count = result[`rate_${key}_${windowStart}`] || 0;
    
    if (count >= config.maxRequests) {
      const resetTime = windowStart + config.windowMs;
      const waitTimeMs = resetTime - now;
      
      return {
        allowed: false,
        resetTime: resetTime,
        waitTimeMs: waitTimeMs,
        waitTimeSeconds: Math.ceil(waitTimeMs / 1000),
        remaining: 0,
        total: config.maxRequests,
        message: `Rate limit exceeded. Please wait ${Math.ceil(waitTimeMs / 1000)} seconds.`
      };
    }

    // Increment counter
    await chrome.storage.local.set({ [`rate_${key}_${windowStart}`]: count + 1 });

    return {
      allowed: true,
      remaining: config.maxRequests - count - 1,
      total: config.maxRequests,
      resetTime: windowStart + config.windowMs,
      used: count + 1
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
      const timeToNextToken = config.windowMs - (timePassed % config.windowMs);
      
      return {
        allowed: false,
        remaining: bucket.tokens,
        total: config.maxTokens,
        waitTimeMs: timeToNextToken,
        waitTimeSeconds: Math.ceil(timeToNextToken / 1000),
        message: `Rate limit exceeded. Please wait ${Math.ceil(timeToNextToken / 1000)} seconds.`
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

  // Get current rate limit status
  async getStatus(action, identifier = 'default', provider = null) {
    const config = this.limits.get(action);
    if (!config) return null;

    const key = `${action}_${identifier}_${provider || 'default'}`;
    
    if (config.strategy === this.strategies.SLIDING_WINDOW) {
      const now = Date.now();
      const windowStart = now - config.windowMs;
      const result = await chrome.storage.local.get([`rate_${key}`]);
      const requests = (result[`rate_${key}`] || []).filter(time => time > windowStart);
      
      return {
        used: requests.length,
        remaining: config.maxRequests - requests.length,
        total: config.maxRequests,
        resetTime: requests.length > 0 ? Math.min(...requests) + config.windowMs : now + config.windowMs
      };
    }
    
    return null;
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

// Configure default limits with conservative values
window.RateLimiter.configure('ai_analysis', {
  strategy: 'sliding_window',
  maxRequests: 50, // Conservative default
  windowMs: 60 * 1000 // 1 minute
});

window.RateLimiter.configure('api_call', {
  strategy: 'sliding_window',
  maxRequests: 20, // Conservative for free models
  windowMs: 60 * 1000 // 1 minute
});

// Configure chunk analysis with very conservative limits for real-time processing
window.RateLimiter.configure('chunk_analysis', {
  strategy: 'sliding_window',
  maxRequests: 15, // Even more conservative for chunk-by-chunk analysis
  windowMs: 60 * 1000 // 1 minute
});