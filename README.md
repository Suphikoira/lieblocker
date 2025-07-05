# LieBlocker - AI-Powered YouTube Fact Checker

A collaborative Chrome extension that detects and skips lies in YouTube videos using AI analysis. Community-driven with shared analysis database for collective fact-checking.

## 🌍 Public Collaborative Project

**LieBlocker is a public project where the community contributes to a shared fact-checking database.**

- **Shared Database**: All analysis results are stored in a public Supabase database
- **Community Contributions**: Every user's analysis helps improve accuracy for everyone
- **Open Source**: Full transparency in how lies are detected and classified
- **No Account Required**: Anonymous contributions to the shared database
- **Privacy-First**: Only analysis results are shared, no personal data

## 🛡️ Security Features

### **Data Protection**
- **Row Level Security**: Database policies prevent data tampering
- **Rate Limiting**: Prevents API abuse and spam submissions  
- **Input Validation**: All contributions sanitized and validated
- **No Personal Data**: Only analysis results stored, no user information
- **Public Transparency**: All database access is logged and auditable

### **Public Database Security**
- **Insert-Only Access**: Anonymous users can only add new analysis data
- **No Modifications**: Existing analyses cannot be altered by public users
- **Data Validation**: Server-side constraints prevent malicious content
- **Automatic Cleanup**: Duplicate and spam entries automatically removed
- **Community Moderation**: Flagging system for inappropriate content

## 🎯 Production Features

### **Reliability**
- **Error Handling**: Comprehensive error recovery and user feedback
- **Performance Monitoring**: Real-time performance tracking
- **Retry Logic**: Automatic retry for failed operations
- **Graceful Degradation**: Continues working even if database is unavailable
- **Offline Mode**: Works offline using cached analysis data

### **User Experience**
- **Smart Notifications**: Context-aware user feedback
- **Progress Indicators**: Clear progress for long operations
- **Responsive Design**: Works on all screen sizes
- **Accessibility**: Screen reader compatible
- **Severity Filtering**: Filter lies by severity level
- **Community Insights**: See analysis from other users

### **Monitoring**
- **Community Analytics**: View collective fact-checking statistics
- **Analysis Quality**: Community-driven accuracy improvements
- **Trending Lies**: See commonly detected false claims
- **Verification Status**: Track fact-check verification across videos

## 🚀 Features

- **AI-Powered Detection**: Analyzes video transcripts using OpenAI, Google Gemini, or OpenRouter
- **Community Database**: Shared analysis results benefit all users
- **Auto-Skip Mode**: Automatically jumps over detected lies while watching
- **Visual Warnings**: Shows detected lies with timestamps and explanations
- **Configurable Confidence**: Adjustable confidence threshold (0-100%)
- **Severity Filtering**: Filter displayed lies by severity (Critical, High, Medium, Low)
- **Collaborative Verification**: Community-driven fact verification
- **Multiple AI Providers**: Support for OpenAI, Google Gemini, and OpenRouter (including free models)
- **Supabase Integration**: Stores and retrieves analysis results efficiently
- **Session Statistics**: Tracks videos analyzed, lies detected, and time saved
- **Sharp Timestamp Matching**: Accurate lie-to-timestamp mapping for precise skipping
- **Extended Analysis Duration**: Analyze up to 180 minutes of video content

## 📦 Installation

### Option 1: Use Public Database (Recommended)
1. Download or clone this repository
2. **Replace the placeholder credentials** in `supabase-client.js`:
   ```javascript
   const SUPABASE_URL = 'https://your-project.supabase.co';
   const SUPABASE_ANON_KEY = 'your-anon-key-here';
   ```
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked" and select the extension folder
6. The LieBlocker icon will appear in your extensions toolbar

### Option 2: Private Fork Setup
If you want your own private database:
1. Create a new [Supabase project](https://supabase.com)
2. Run all SQL migrations from `supabase/migrations/` in your Supabase SQL editor
3. Update `supabase-client.js` with your project credentials
4. Modify RLS policies as needed for your use case
5. Follow installation steps above

## ⚙️ Setup

### AI Provider Configuration
1. Click the LieBlocker extension icon
2. Go to Settings tab
3. Choose your AI provider and add your API key:
   - **OpenAI**: Get API key at https://platform.openai.com
   - **Google Gemini**: Get API key at https://makersuite.google.com
   - **OpenRouter**: Get API key at https://openrouter.ai (includes free models)

### Extension Settings
4. Configure your preferences:
   - Detection mode (visual warnings or auto-skip)
   - Analysis duration (5-180 minutes)
   - Confidence threshold (0-100%)
   - Severity filtering (Critical, High, Medium, Low)
   - AI provider and model

### Database Connection
The extension automatically connects to the shared community database where:
- Your analysis results help improve accuracy for everyone
- You benefit from previous community analysis
- No personal information is stored or shared

## 🔧 Usage

1. Navigate to any YouTube video
2. Click the LieBlocker extension icon
3. Click "Analyze Current Video"
4. Wait for analysis to complete (contributes to community database)
5. View detected lies in the "Lies" tab
6. See analysis from other community members (if available)
7. Filter lies by severity using the checkboxes in Settings
8. If auto-skip is enabled, lies will be automatically skipped during playback

## 🔑 API Requirements

### **OpenAI**
- **Models**: GPT-4o Mini (recommended), GPT-4o, GPT-4 Turbo, GPT-4
- **API Key Format**: Starts with `sk-` and 51-56 characters long
- **Cost**: ~$0.01-0.05 per video analysis
- **Rate Limits**: 50 requests per minute

### **Google Gemini**
- **Models**: Gemini 2.0 Flash Experimental (recommended), Gemini 1.5 Pro, Gemini 1.5 Flash
- **API Key Format**: 35-45 alphanumeric characters
- **Cost**: ~$0.005-0.02 per video analysis
- **Rate Limits**: 60 requests per minute

### **OpenRouter (Free Models Available)**
- **Free Models**: 
  - Meta: Llama 4 Maverick 17B (Free)
  - Mistral: Mistral Small 3.2 24B (Free)
  - DeepSeek: Deepseek R1 0528 Qwen3 8B (Free)
- **API Key Format**: Starts with `sk-or-` and 20+ characters
- **Cost**: Free models available, paid models ~$0.001-0.01 per analysis
- **Rate Limits**: 20 requests per minute for free models

## 🛠️ Technical Architecture

### **Security Layer**
```
┌─────────────────────────────────────┐
│           Security Service          │
├─────────────────────────────────────┤
│ • Multi-layer Encryption           │
│ • Rate Limiting                     │
│ • Input Validation                  │
│ • Error Handling                    │
│ • Context Validation                │
└─────────────────────────────────────┘
```

### **Core Components**
```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Content       │  │   Background    │  │     Popup       │
│   Script        │  │   Service       │  │   Interface     │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ • Transcript    │  │ • State Mgmt    │  │ • User Controls │
│ • AI Analysis   │  │ • Notifications │  │ • Settings      │
│ • Auto-Skip     │  │ • Persistence   │  │ • Statistics    │
│ • Context Check │  │ • Rate Limiting │  │ • Filtering     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### **Data Flow**
```
YouTube Video → Transcript Extraction → AI Analysis → Lie Detection → User Interface
                                    ↓
                              Supabase Storage ← → Local Cache
                                    ↓
                              Severity Filtering → Display
```

## 🔒 Security Measures

### **Encryption**
- **Algorithm**: Multi-layer XOR + character substitution + Base64
- **Key Generation**: 1000-round hashing with secure salt
- **Storage**: Encrypted data with version control and expiration

### **Validation**
- **API Keys**: Format and length validation for all providers
- **Video IDs**: YouTube ID format verification
- **Timestamps**: Range and type validation
- **URLs**: Protocol and domain restrictions

### **Rate Limiting**
- **Provider-Specific**: Automatic rate limiting based on AI provider
- **Free Model Support**: Special handling for OpenRouter free models (20 req/min)
- **Sliding Window**: Advanced rate limiting with sliding window algorithm
- **Storage Protection**: 1000ms timeout protection

### **Context Management**
- **Extension Context Validation**: Prevents crashes during extension reloads
- **Graceful Degradation**: Continues working with cached data when context is invalid
- **Safe Communication**: All messages validated before sending

## 📊 Performance

### **Benchmarks**
- **Transcript Extraction**: < 5 seconds
- **AI Analysis**: 30-120 seconds (depending on video length and provider)
- **Lie Detection**: 85%+ accuracy (configurable threshold)
- **Memory Usage**: < 50MB
- **Storage Impact**: < 10MB per 100 videos

### **Optimization**
- **Caching**: Intelligent result caching
- **Lazy Loading**: Components loaded on demand
- **Debouncing**: Input validation with 1s delay
- **Cleanup**: Automatic old data removal
- **Provider Selection**: Automatic rate limiting per provider

## 🧪 Testing

### **Security Testing**
```bash
# Test API key encryption
npm run test:security

# Test rate limiting
npm run test:rate-limits

# Test input validation
npm run test:validation

# Test context invalidation handling
npm run test:context
```

### **Performance Testing**
```bash
# Monitor memory usage
npm run test:memory

# Test operation timing
npm run test:performance

# Load testing
npm run test:load
```

## 🚨 Error Handling

### **User-Friendly Messages**
- **API Key Issues**: "Please check your AI API key in settings"
- **Network Problems**: "Network connection issue. Please check your internet"
- **Rate Limits**: "Rate limit exceeded. Please wait X seconds"
- **Transcript Errors**: "Could not extract video transcript"
- **Context Issues**: "Please refresh the page and try again"

### **Technical Logging**
- **Error Queue**: Last 100 errors with context
- **Critical Errors**: Persistent storage for debugging
- **Performance Logs**: Slow operation tracking
- **User Actions**: Non-PII usage patterns
- **Context Validation**: Extension state monitoring

## 🔧 Configuration

### **Environment Variables**
```env
# Development
NODE_ENV=development

# Supabase (Optional)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### **Build Configuration**
```javascript
// vite.config.js
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        popup: 'popup.html',
        content: 'content.js',
        background: 'background.js'
      }
    }
  }
})
```

## 📱 Browser Support

- **Chrome**: ✅ Full support (Manifest V3)
- **Edge**: ✅ Full support (Chromium-based)
- **Firefox**: ⚠️ Limited (Manifest V2 compatibility needed)
- **Safari**: ❌ Not supported (different extension system)

## 🆕 Recent Updates

### **Version 1.0.0**
- ✅ **Extended Analysis Duration**: Now supports up to 180 minutes (was 60)
- ✅ **OpenRouter Integration**: Added support for free AI models
- ✅ **Configurable Confidence**: Adjustable threshold from 0-100% (default 85%)
- ✅ **Severity Filtering**: Filter displayed lies by severity level
- ✅ **Context Validation**: Robust handling of extension reloads
- ✅ **Enhanced Rate Limiting**: Provider-specific rate limits
- ✅ **Improved Error Handling**: Better user feedback and recovery
- ✅ **Security Enhancements**: Advanced encryption and validation

## 🤝 Contributing

### **Development Setup**
```bash
git clone https://github.com/your-repo/lieblocker
cd lieblocker
npm install
npm run dev
```

### **Code Standards**
- **ESLint**: Airbnb configuration
- **Security**: OWASP guidelines
- **Performance**: Core Web Vitals compliance
- **Accessibility**: WCAG 2.1 AA standards

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

### **Common Issues**
1. **"API key not configured"**: Add your AI API key in settings
2. **"Content script not responding"**: Refresh the YouTube page
3. **"Rate limit exceeded"**: Wait for the specified time before analyzing more videos
4. **"Transcript extraction failed"**: Video may not have captions available
5. **"Extension context invalidated"**: Refresh the page to reload the extension

### **Debug Information**
- Check browser console for detailed error messages
- Export settings for configuration backup
- Clear cache if experiencing persistent issues
- Use different AI providers if one is having issues

### **Free Model Recommendations**
- **Best Free Option**: OpenRouter with Meta Llama 4 Maverick 17B
- **Fastest Free**: OpenRouter with DeepSeek R1 0528 Qwen3 8B
- **Most Accurate Free**: OpenRouter with Mistral Small 3.2 24B

### **Contact**
- **Issues**: GitHub Issues
- **Security**: security@lieblocker.com
- **General**: support@lieblocker.com

---

**⚠️ Important**: This extension requires AI API keys which may incur costs for paid models. OpenRouter offers free models with 20 requests per minute. Monitor your API usage to avoid unexpected charges.

**🆓 Free Usage**: Use OpenRouter free models for cost-free lie detection with reasonable rate limits.