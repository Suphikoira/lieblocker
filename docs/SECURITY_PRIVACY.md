# Security & Privacy Documentation

## Public Database Model

LieBlocker uses a **public collaborative database** model where:

### ✅ What is Shared (Public)
- Video analysis results (lies detected, timestamps, explanations)
- Video metadata (title, channel name, video ID)
- Confidence scores and severity ratings
- Analysis timestamps and version information

### ❌ What is NOT Shared (Private)
- User personal information
- API keys (stored locally, encrypted)
- Browser history or viewing patterns
- User settings and preferences
- IP addresses or location data

## Database Security Model

### Row Level Security (RLS) Policies
- **Anonymous Users**: Can INSERT analysis data only (no updates or deletes)
- **Authenticated Users**: Can read all public data
- **Service Role**: Full administrative access

### Data Protection Measures
1. **Input Validation**: All data sanitized before database insertion
2. **Rate Limiting**: Prevents spam and abuse (20 requests/minute per user)
3. **Data Constraints**: Database-level limits on text length and value ranges
4. **No Personal Data**: Zero collection of user information
5. **Immutable Analysis**: Once submitted, analysis results cannot be modified

### API Security
- **Public Credentials**: Supabase credentials are intentionally public for collaboration
- **Restricted Permissions**: Anon key can only INSERT, not UPDATE/DELETE existing data
- **Database-level Protection**: RLS policies enforce access controls
- **Audit Trail**: All database operations are logged

## Privacy Guarantees

### What We Collect
- Video analysis results (to improve collective accuracy)
- Basic error logs (for debugging, no personal info)

### What We Don't Collect
- User identity or personal information
- Browsing history or video watching patterns
- API keys (stored locally in your browser only)
- Location or device information

### Data Retention
- Analysis results are stored indefinitely to benefit the community
- Error logs are automatically cleaned up after 30 days
- No user session tracking or persistent identifiers

## Security Best Practices

### For Users
1. **API Keys**: Your AI provider API keys are encrypted and stored locally only
2. **Browser Security**: Extension permissions are minimal and auditable
3. **No Account Required**: No registration or authentication needed
4. **Transparent Operation**: All code is open source and auditable

### For Contributors
1. **Never Commit Secrets**: Use environment variables for any credentials
2. **Review Code Changes**: All database queries are auditable
3. **Validate Inputs**: Client and server-side validation on all data
4. **Follow RLS Policies**: Respect database access controls

## Threat Model

### Mitigated Risks
- ✅ **Data Tampering**: RLS prevents modification of existing analyses
- ✅ **Spam/Abuse**: Rate limiting and data validation prevent bulk spam
- ✅ **Privacy Violations**: No personal data collection or tracking
- ✅ **Malicious Code**: Open source, community-reviewed codebase

### Accepted Risks
- ⚠️ **Analysis Quality**: Community contributions may vary in accuracy
- ⚠️ **Database Costs**: Public database usage may incur hosting costs
- ⚠️ **Service Availability**: Depends on Supabase infrastructure

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT** open a public issue
2. Email security concerns to: [your-email@domain.com]
3. Include detailed reproduction steps
4. Allow reasonable time for response before public disclosure

## Compliance

This project follows:
- **GDPR**: No personal data collection, user consent not required
- **CCPA**: No sale or sharing of personal information
- **Open Source**: MIT license with full code transparency

## Audit Trail

All database operations are logged and can be audited:
- INSERT operations with timestamps
- User-agent and basic request metadata (no personal info)
- Error logs for debugging (sanitized)
- Performance metrics (aggregated, anonymous)
