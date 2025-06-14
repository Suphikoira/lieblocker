# LieBlocker - AI-Powered YouTube Lie Detection & Skip Extension

LieBlocker is a Chrome extension that automatically detects and skips lies in YouTube videos using AI analysis. Users provide their own AI API keys for complete privacy and control.

## Features

- **Automatic Lie Detection**: Uses OpenAI or Google Gemini to analyze video transcripts
- **Skip Mode**: Automatically skips detected lies while watching
- **Visual Mode**: Shows warnings without skipping
- **Local Caching**: Stores analysis results locally for 24 hours
- **Privacy First**: No registration required, uses your own API keys
- **Configurable**: Adjustable analysis duration and detection sensitivity

## How It Works

1. **Transcript Extraction**: Uses Supadata API to extract video transcripts
2. **AI Analysis**: Sends transcript to your chosen AI provider (OpenAI/Gemini)
3. **Lie Detection**: AI identifies false claims with 85%+ confidence
4. **Smart Skipping**: Automatically jumps past lies during playback
5. **Local Storage**: Caches results to avoid re-analyzing the same videos

## Setup

### Required API Keys

1. **Supadata API Token**: For transcript extraction
   - Sign up at [Supadata.ai](https://supadata.ai)
   - Get your API token from the dashboard

2. **AI Provider API Key** (choose one):
   - **OpenAI**: Get API key from [OpenAI Platform](https://platform.openai.com/api-keys)
   - **Gemini**: Get API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder
5. Open the extension popup and configure your API keys

## Usage

1. Navigate to any YouTube video
2. Click the LieBlocker extension icon
3. Click "Analyze Current Video"
4. Choose detection mode:
   - **Visual**: Shows detected lies without skipping
   - **Skip**: Automatically skips lies during playback

## Settings

- **Analysis Duration**: Set how many minutes to analyze (5-60 minutes)
- **Detection Mode**: Choose between visual warnings or automatic skipping
- **AI Provider**: Select OpenAI or Google Gemini
- **Model Selection**: Choose specific AI models for analysis

## Privacy & Security

- **No Registration**: Works without any account creation
- **Your API Keys**: Uses your own AI provider accounts
- **Local Storage**: All data stored locally in your browser
- **No Tracking**: No usage analytics or data collection

## Technical Details

- **Transcript Source**: Supadata API for reliable transcript extraction
- **AI Models**: Supports latest OpenAI and Gemini models
- **Confidence Threshold**: Only shows lies with 85%+ confidence
- **Cache Duration**: 24-hour local cache to avoid re-analysis
- **Skip Precision**: Uses exact timestamps for accurate skipping

## Limitations

- Requires videos to have closed captions available
- Analysis quality depends on transcript accuracy
- AI detection is not 100% perfect - use critical thinking
- Costs depend on your AI provider usage

## Contributing

This is an open-source project. Feel free to submit issues, feature requests, or pull requests.

## License

MIT License - see LICENSE file for details

## Disclaimer

LieBlocker is a tool to assist with fact-checking but should not be your only source of truth. Always verify important information through multiple reliable sources. The accuracy of lie detection depends on the AI model and transcript quality.