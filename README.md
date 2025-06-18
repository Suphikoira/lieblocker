# LieBlocker - AI-Powered YouTube Fact Checker

A Chrome extension that automatically detects and skips lies in YouTube videos using AI analysis.

## Features

- **Real-time Lie Detection**: Analyzes video transcripts using OpenAI or Google Gemini
- **DOM-based Transcript Extraction**: Directly extracts transcripts from YouTube's interface
- **Auto-Skip Mode**: Automatically jumps over detected lies while watching
- **Visual Warnings**: Shows detected lies with timestamps and explanations
- **Confidence Scoring**: Only shows lies with 85%+ confidence
- **Supabase Integration**: Stores and retrieves analysis results efficiently
- **Session Statistics**: Tracks videos analyzed, lies detected, and time saved
- **Sharp Timestamp Matching**: Accurate lie-to-timestamp mapping for precise skipping

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The LieBlocker icon will appear in your extensions toolbar

## Setup

1. Click the LieBlocker extension icon
2. Go to Settings tab
3. Add your AI API key:
   - **AI API Key**: OpenAI or Google Gemini for lie detection
4. Configure your Supabase connection (optional):
   - **Supabase URL**: Your Supabase project URL
   - **Supabase Anon Key**: Your Supabase anonymous key
5. Configure your preferences:
   - Detection mode (visual warnings or auto-skip)
   - Analysis duration (5-60 minutes)
   - AI provider and model

## Usage

1. Navigate to any YouTube video
2. Click the LieBlocker extension icon
3. Click "Analyze Current Video"
4. Wait for analysis to complete
5. View detected lies in the "Lies" tab
6. If auto-skip is enabled, lies will be automatically skipped during playback

## API Requirements

### AI Provider (Choose One)

**OpenAI:**
- Models: GPT-4.1 Mini, GPT-4.1 Nano, o4-mini, GPT-4.1
- Get API key at: https://platform.openai.com

**Google Gemini:**
- Models: Gemini 2.0 Flash Experimental, Gemini 2.5 Flash, Gemini 1.5 Pro
- Get API key at: https://makersuite.google.com

## Privacy & Security

- API keys are stored locally and never shared
- No user data is collected or transmitted
- Analysis results can be stored in Supabase (optional) or cached locally

## Technical Details

- **Transcript Extraction**: Direct DOM extraction from YouTube's native transcript interface
- **AI Analysis**: Configurable confidence threshold (85%+ default)
- **Timestamp Precision**: Sharp matching system maps lies to exact video timestamps
- **Skip Logic**: Intelligent skipping with visual notifications and accurate duration tracking
- **Data Storage**: Supabase integration for persistent storage with local fallback
- **Session Tracking**: Real-time statistics for videos analyzed, lies detected, and time saved

## Supported Browsers

- Chrome (Manifest V3)
- Edge (Chromium-based)
- Other Chromium-based browsers

## License

MIT License - see LICENSE file for details