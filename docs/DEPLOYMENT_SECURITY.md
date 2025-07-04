# Security Guidelines for Open Source Deployment

## ⚠️ CRITICAL SECURITY REQUIREMENTS

### 1. Environment Variables
- **NEVER** commit actual API keys to the repository
- Use `.env.example` files with placeholder values
- Rotate all keys before open sourcing

### 2. Supabase Security Checklist

#### Database Security
- ✅ RLS enabled on all tables
- ✅ Secure policies implemented (not `USING (true)`)
- ✅ Service role access properly restricted
- ✅ Rate limiting at database level

#### API Security
- ✅ Anonymous access limited to read-only operations
- ✅ Service role key kept secret (backend only)
- ✅ Row-level security prevents data leaks
- ✅ Input validation on all endpoints

### 3. Extension Security

#### API Key Protection
- ✅ Multi-layer encryption for stored API keys
- ✅ Keys never logged or exposed in errors
- ✅ Secure key validation before storage

#### Rate Limiting
- ✅ Client-side rate limiting implemented
- ✅ Database-level rate limiting added
- ✅ Provider-specific limits enforced

### 4. Deployment Checklist

Before deploying to production:

1. **Database Setup**
   ```sql
   -- Apply secure RLS policies
   \i supabase/migrations/secure_rls_for_opensource.sql
   
   -- Verify policies
   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
   FROM pg_policies 
   WHERE schemaname = 'public';
   ```

2. **Environment Configuration**
   ```bash
   # Copy and configure environment
   cp .env.production.example .env.production
   
   # Set secure values (never commit these)
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

3. **Security Verification**
   ```bash
   # Test with anonymous access
   curl -H "apikey: YOUR_ANON_KEY" \
        -H "Authorization: Bearer YOUR_ANON_KEY" \
        "https://your-project.supabase.co/rest/v1/videos"
   
   # Should return data but not allow modifications
   ```

### 5. Monitoring & Alerts

Set up monitoring for:
- Unusual API usage patterns
- Failed authentication attempts  
- Rate limit violations
- Database performance issues

### 6. User Guidelines

For users deploying their own instance:

1. **Create Supabase Project**
   - Sign up at supabase.com
   - Create new project
   - Apply provided migrations

2. **Configure Extension**
   - Add your Supabase URL and anon key
   - Add your AI provider API keys
   - Configure rate limits as needed

3. **Security Best Practices**
   - Use strong passwords
   - Enable 2FA on Supabase account
   - Monitor usage regularly
   - Keep dependencies updated

## 🚨 Security Incident Response

If you discover a security vulnerability:

1. **DO NOT** create a public issue
2. Email security@lieblocker.com
3. Include detailed reproduction steps
4. Allow 90 days for responsible disclosure

## 📋 Security Audit Checklist

- [ ] RLS enabled on all tables
- [ ] Secure policies implemented  
- [ ] Service role key protected
- [ ] Rate limiting configured
- [ ] Input validation implemented
- [ ] Error messages don't leak data
- [ ] Dependencies updated
- [ ] Security headers configured
- [ ] Monitoring enabled
- [ ] Incident response plan ready