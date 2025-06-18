// Centralized API service with security and error handling
class APIService {
  constructor() {
    this.securityService = new SecurityService();
    this.baseRetryDelay = 1000;
    this.maxRetries = 3;
  }

  async makeSecureAPICall(provider, model, messages, options = {}) {
    try {
      // Check rate limiting
      const canMakeCall = await this.securityService.checkRateLimit('ai_analysis', 50, 60);
      if (!canMakeCall) {
        throw new Error('Rate limit exceeded. Please wait before making more requests.');
      }

      // Get encrypted settings
      const settings = await this.securityService.getSecureSettings();
      if (!settings || !settings.apiKey) {
        throw new Error('API key not configured');
      }

      // Validate API key
      if (!this.securityService.validateApiKey(provider, settings.apiKey)) {
        throw new Error('Invalid API key format');
      }

      // Make the API call with retry logic
      return await this.makeAPICallWithRetry(provider, model, messages, settings.apiKey, options);

    } catch (error) {
      console.error('Secure API call failed:', error);
      throw error;
    }
  }

  async makeAPICallWithRetry(provider, model, messages, apiKey, options, retryCount = 0) {
    try {
      if (provider === 'openai') {
        return await this.callOpenAI(model, messages, apiKey, options);
      } else if (provider === 'gemini') {
        return await this.callGemini(model, messages, apiKey, options);
      } else {
        throw new Error(`Unsupported AI provider: ${provider}`);
      }
    } catch (error) {
      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        const delay = this.baseRetryDelay * Math.pow(2, retryCount);
        console.log(`Retrying API call in ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return await this.makeAPICallWithRetry(provider, model, messages, apiKey, options, retryCount + 1);
      }
      throw error;
    }
  }

  isRetryableError(error) {
    // Retry on network errors, rate limits, and temporary server errors
    return error.message.includes('rate limit') ||
           error.message.includes('network') ||
           error.message.includes('timeout') ||
           (error.status >= 500 && error.status < 600);
  }

  async callOpenAI(model, messages, apiKey, options) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 4000
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    return await response.json();
  }

  async callGemini(model, messages, apiKey, options) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: messages.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        })),
        generationConfig: {
          temperature: options.temperature || 0.3,
          maxOutputTokens: options.maxTokens || 4000
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    return await response.json();
  }
}

// Export for use in other parts of the extension
window.APIService = APIService;