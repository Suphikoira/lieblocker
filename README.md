# LieBlocker Backend - Supabase Integration

This is the Supabase backend for the LieBlocker Chrome extension, enabling shared lie detection data across users while maintaining privacy.

## Features

- **Shared Lie Database**: Store and retrieve lie detection results across users
- **User Contributions**: Track who contributed analysis and verification
- **Lie Verification**: Community-driven verification of detected lies
- **Privacy-First**: Users authenticate but analysis data is shared publicly
- **Cost Tracking**: Track API costs for user contributions

## Architecture

### Database Schema

1. **videos** - YouTube video metadata
2. **video_analysis** - Analysis sessions with metadata
3. **detected_lies** - Individual lies with timestamps and details
4. **user_contributions** - Track user contributions and costs
5. **lie_verifications** - Community verification of lies

### Edge Functions

1. **analyze-video** - Submit new video analysis results
2. **get-video-lies** - Retrieve lies for a specific video
3. **verify-lie** - Submit verification for a detected lie

## Setup

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Node.js 18+
- Chrome extension development environment

### Local Development

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Start Supabase locally:**
```bash
supabase start
```

3. **Run database migrations:**
```bash
supabase db reset
```

4. **Generate TypeScript types:**
```bash
npm run db:types
```

5. **Serve edge functions locally:**
```bash
npm run functions:serve
```

### Environment Setup

1. **Copy environment template:**
```bash
cp .env.example .env
```

2. **Update environment variables:**
```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your_local_anon_key
```

### Production Deployment

1. **Create Supabase project:**
```bash
supabase projects create lieblocker-backend
```

2. **Link to your project:**
```bash
supabase link --project-ref your-project-ref
```

3. **Deploy database:**
```bash
supabase db push
```

4. **Deploy edge functions:**
```bash
supabase functions deploy
```

5. **Update production environment variables in your extension**

## Extension Integration

The Chrome extension integrates with this backend through the following flow:

### 1. Check for Existing Analysis
```javascript
// Check if video already has analysis
const existingLies = await getVideoLies(videoId, 0.85)
if (existingLies.hasAnalysis) {
  // Use existing lies, skip analysis
  return existingLies.lies
}
```

### 2. Submit New Analysis
```javascript
// After performing AI analysis
await submitVideoAnalysis(videoId, detectedLies, {
  videoTitle: 'Video Title',
  channelName: 'Channel Name',
  analysisDuration: 20,
  confidenceThreshold: 0.85,
  userToken: userAuthToken
})
```

### 3. Community Verification
```javascript
// Users can verify lies
await verifyLie(lieId, 'confirmed', 'Additional notes', userAuthToken)
```

## Data Flow

1. **User analyzes video** → Extension checks backend for existing analysis
2. **No existing analysis** → Extension performs AI analysis using user's API keys
3. **Analysis complete** → Extension submits results to backend
4. **Other users watch same video** → Extension retrieves shared analysis
5. **Community verification** → Users can verify/dispute detected lies

## Privacy & Security

- **Public lie data**: All detected lies are publicly readable
- **Private contributions**: User contribution tracking requires authentication
- **No personal data**: Only user IDs and contribution metadata stored
- **User API keys**: Never stored in backend, only used locally in extension

## API Endpoints

### GET /functions/v1/get-video-lies
Retrieve lies for a specific video.

**Parameters:**
- `videoId` (required): YouTube video ID
- `minConfidence` (optional): Minimum confidence threshold (default: 0.85)

**Response:**
```json
{
  "videoId": "dQw4w9WgXcQ",
  "hasAnalysis": true,
  "lies": [...],
  "totalLies": 5,
  "analysis": {...},
  "video": {...}
}
```

### POST /functions/v1/analyze-video
Submit new video analysis results.

**Headers:**
- `Authorization: Bearer <user_token>`

**Body:**
```json
{
  "videoId": "dQw4w9WgXcQ",
  "videoTitle": "Video Title",
  "lies": [...],
  "analysisDuration": 20,
  "confidenceThreshold": 0.85
}
```

### POST /functions/v1/verify-lie
Submit verification for a detected lie.

**Headers:**
- `Authorization: Bearer <user_token>`

**Body:**
```json
{
  "lieId": "uuid",
  "verificationType": "confirmed",
  "notes": "Additional context"
}
```

## Development

### Database Changes

1. **Create migration:**
```bash
supabase migration new your_migration_name
```

2. **Apply locally:**
```bash
supabase db reset
```

3. **Generate types:**
```bash
npm run db:types
```

### Function Development

1. **Create new function:**
```bash
supabase functions new function-name
```

2. **Test locally:**
```bash
supabase functions serve
```

3. **Deploy:**
```bash
supabase functions deploy function-name
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with Supabase
5. Submit a pull request

## License

MIT License - see LICENSE file for details