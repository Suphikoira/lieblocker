// Supabase client for Chrome extension
// This file will be injected into the page context

/**
 * SECURITY NOTICE FOR PUBLIC PROJECT:
 * 
 * This is a public collaborative project where users contribute analysis results
 * to a shared database. The Supabase credentials are intentionally public to allow
 * community contributions.
 * 
 * SECURITY MEASURES IN PLACE:
 * 1. Row Level Security (RLS) policies restrict write access
 * 2. Anonymous users can only INSERT analysis data (no UPDATE/DELETE)
 * 3. Rate limiting prevents abuse
 * 4. Data validation prevents malicious content
 * 5. No sensitive user data is stored
 * 
 * If you want to fork this project for private use:
 * 1. Create your own Supabase project
 * 2. Replace the credentials below with your own
 * 3. Run the database migrations from supabase/migrations/
 * 4. Update RLS policies as needed for your use case
 */

(function() {
  'use strict';
  
  // Check if we're in the right environment
  if (typeof window === 'undefined') return;
  
  // Supabase configuration for public collaborative project
  // These credentials are intentionally public for community contributions
  const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
  const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
  
  // Validate configuration for development
  if (SUPABASE_URL === 'YOUR_SUPABASE_PROJECT_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    console.error('🚨 LieBlocker Configuration: Using placeholder credentials');
    console.info('ℹ️ For production, replace with actual Supabase project credentials');
    console.info('📚 See setup instructions in README.md');
    // Don't return early - allow development to continue with placeholders
  }
  
  // Simple Supabase client implementation for Chrome extension with security features
  class SimpleSupabaseClient {
    constructor(url, key) {
      this.url = url;
      this.key = key;
      this.headers = {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=representation'
      };
      this.rateLimiter = new Map(); // Simple client-side rate limiting
    }
    
    // Client-side rate limiting
    checkRateLimit(action, maxRequests = 10, windowMs = 60000) {
      const now = Date.now();
      const key = action;
      
      if (!this.rateLimiter.has(key)) {
        this.rateLimiter.set(key, []);
      }
      
      const requests = this.rateLimiter.get(key);
      
      // Remove old requests outside the window
      while (requests.length > 0 && requests[0] < now - windowMs) {
        requests.shift();
      }
      
      if (requests.length >= maxRequests) {
        console.warn(`⚠️ Rate limit exceeded for action: ${action}`);
        return false;
      }
      
      requests.push(now);
      return true;
    }
    
    // Data validation and sanitization
    validateAndSanitizeData(data, type) {
      if (!data) return null;
      
      switch (type) {
        case 'video':
          return {
            video_id: String(data.video_id || '').slice(0, 100),
            title: String(data.title || '').slice(0, 500),
            channel_name: String(data.channel_name || '').slice(0, 200),
            duration: data.duration && !isNaN(data.duration) ? Number(data.duration) : null
          };
          
        case 'analysis':
          return {
            video_id: data.video_id,
            analysis_version: String(data.analysis_version || '2.1').slice(0, 10),
            total_lies_detected: Math.max(0, Math.min(1000, Number(data.total_lies_detected || 0))),
            analysis_duration_minutes: Math.max(0, Math.min(480, Number(data.analysis_duration_minutes || 20))),
            confidence_threshold: Math.max(0, Math.min(1, Number(data.confidence_threshold || 0.85)))
          };
          
        case 'lie':
          return {
            analysis_id: data.analysis_id,
            timestamp_seconds: Math.max(0, Number(data.timestamp_seconds || 0)),
            duration_seconds: Math.max(1, Math.min(300, Number(data.duration_seconds || 10))),
            claim_text: String(data.claim_text || '').slice(0, 1000),
            explanation: String(data.explanation || '').slice(0, 2000),
            confidence: Math.max(0, Math.min(1, Number(data.confidence || 0))),
            severity: ['low', 'medium', 'high'].includes(data.severity) ? data.severity : 'low',
            category: String(data.category || 'other').slice(0, 50)
          };
          
        default:
          return data;
      }
    }
    
    from(table) {
      return new SupabaseTable(this, table);
    }
  }
  
  class SupabaseTable {
    constructor(client, table) {
      this.client = client;
      this.table = table;
      this.query = {
        select: '*',
        filters: [],
        order: null,
        limit: null
      };
    }
    
    select(columns = '*') {
      this.query.select = columns;
      return this;
    }
    
    eq(column, value) {
      this.query.filters.push(`${column}=eq.${encodeURIComponent(value)}`);
      return this;
    }
    
    order(column, options = {}) {
      const direction = options.ascending === false ? 'desc' : 'asc';
      this.query.order = `${column}.${direction}`;
      return this;
    }
    
    single() {
      this.query.single = true;
      return this;
    }
    
    async execute() {
      try {
        let url = `${this.client.url}/rest/v1/${this.table}`;
        const params = new URLSearchParams();
        
        if (this.query.select) {
          params.append('select', this.query.select);
        }
        
        if (this.query.filters.length > 0) {
          this.query.filters.forEach(filter => {
            const [key, value] = filter.split('=');
            params.append(key, value);
          });
        }
        
        if (this.query.order) {
          params.append('order', this.query.order);
        }
        
        if (params.toString()) {
          url += '?' + params.toString();
        }
        
        console.log('🔍 Supabase GET request to:', this.table);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: this.client.headers
        });
        
        console.log('📡 Supabase GET response:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Supabase GET error:', response.status);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Supabase GET success, received', data?.length || 1, 'items');
        
        if (this.query.single) {
          return { data: data[0] || null, error: null };
        }
        
        return { data, error: null };
      } catch (error) {
        console.error('❌ Supabase execute error:', error);
        return { data: null, error };
      }
    }
    
    async insert(data) {
      try {
        // Rate limiting check
        if (!this.client.checkRateLimit(`insert_${this.table}`, 20, 60000)) {
          throw new Error('Rate limit exceeded. Please wait before making more requests.');
        }
        
        const url = `${this.client.url}/rest/v1/${this.table}`;
        let payload = Array.isArray(data) ? data : [data];
        
        // Validate and sanitize data based on table type
        if (this.table === 'videos') {
          payload = payload.map(item => this.client.validateAndSanitizeData(item, 'video')).filter(Boolean);
        } else if (this.table === 'video_analysis') {
          payload = payload.map(item => this.client.validateAndSanitizeData(item, 'analysis')).filter(Boolean);
        } else if (this.table === 'detected_lies') {
          payload = payload.map(item => this.client.validateAndSanitizeData(item, 'lie')).filter(Boolean);
        }
        
        if (payload.length === 0) {
          throw new Error('No valid data to insert after validation');
        }
        
        console.log('📝 Supabase INSERT request:', this.table, `(${payload.length} items)`);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: this.client.headers,
          body: JSON.stringify(payload)
        });
        
        console.log('📡 Supabase INSERT response:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Supabase INSERT error:', response.status, errorText);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Check if response has content before parsing JSON
        const responseText = await response.text();
        let result = [];
        
        if (responseText && responseText.trim() !== '') {
          try {
            result = JSON.parse(responseText);
          } catch (parseError) {
            console.warn('⚠️ Non-JSON response from insert');
            result = [];
          }
        }
        
        console.log('✅ Supabase INSERT success');
        
        return { data: Array.isArray(data) ? result : result[0], error: null };
      } catch (error) {
        console.error('❌ Supabase insert error:', error.message);
        return { data: null, error };
      }
    }
    
    async upsert(data, options = {}) {
      try {
        // Rate limiting check  
        if (!this.client.checkRateLimit(`upsert_${this.table}`, 15, 60000)) {
          throw new Error('Rate limit exceeded. Please wait before making more requests.');
        }
        
        let url = `${this.client.url}/rest/v1/${this.table}`;
        let payload = Array.isArray(data) ? data : [data];
        
        // Validate and sanitize data
        if (this.table === 'videos') {
          payload = payload.map(item => this.client.validateAndSanitizeData(item, 'video')).filter(Boolean);
        } else if (this.table === 'video_analysis') {
          payload = payload.map(item => this.client.validateAndSanitizeData(item, 'analysis')).filter(Boolean);
        } else if (this.table === 'detected_lies') {
          payload = payload.map(item => this.client.validateAndSanitizeData(item, 'lie')).filter(Boolean);
        }
        
        if (payload.length === 0) {
          throw new Error('No valid data to upsert after validation');
        }
        
        const headers = {
          ...this.client.headers
        };
        
        // For upserts, we need to add the proper parameters and headers
        if (options.onConflict) {
          url += `?on_conflict=${options.onConflict}`;
          headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
        }
        
        console.log('🔄 Supabase UPSERT request:', this.table, `(${payload.length} items)`);
        
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        
        console.log('📡 Supabase UPSERT response:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Supabase UPSERT error:', response.status, errorText);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Check if response has content before parsing JSON
        const responseText = await response.text();
        let result = [];
        
        if (responseText && responseText.trim() !== '') {
          try {
            result = JSON.parse(responseText);
          } catch (parseError) {
            console.warn('⚠️ Non-JSON response from upsert');
            result = [];
          }
        }
        
        console.log('✅ Supabase UPSERT success');
        
        return { data: Array.isArray(data) ? result : result[0], error: null };
      } catch (error) {
        console.error('❌ Supabase upsert error:', error.message);
        return { data: null, error };
      }
    }
  }
  
  // Initialize Supabase client
  const supabase = new SimpleSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Database helper functions
  window.SupabaseDB = {
    client: supabase, // Reference to the Supabase client

    // Test connection
    async testConnection() {
      try {
        console.log('🧪 Testing Supabase connection...');
        // Simple test - just select the first few records to test connectivity
        const videosTable = new SupabaseTable(this.client, 'videos');
        const { data, error } = await videosTable.select('id')
          .execute();
        
        if (error) {
          console.error('❌ Supabase connection test failed:', error);
          return false;
        }
        
        console.log('✅ Supabase connection test successful');
        return true;
      } catch (error) {
        console.error('❌ Supabase connection test error:', error);
        return false;
      }
    },

    // Videos
    async getVideo(videoId) {
      console.log('🔍 Getting video:', videoId);
      const videosTable = new SupabaseTable(this.client, 'videos');
      const { data, error } = await videosTable.select('*')
        .eq('video_id', videoId)
        .execute();
      
      if (error) {
        console.error('❌ Error getting video:', error);
        throw error;
      }
      
      console.log('📹 Video result:', data);
      return data && data.length > 0 ? data[0] : null;
    },

    async createVideo(videoData) {
      console.log('📝 Creating video:', videoData);
      const videosTable = new SupabaseTable(this.client, 'videos');
      const { data, error } = await videosTable.insert(videoData);
      
      if (error) {
        console.error('❌ Error creating video:', error);
        throw error;
      }
      
      console.log('✅ Video created:', data);
      return data;
    },

    async upsertVideo(videoData) {
      console.log('🔄 Upserting video:', videoData);
      
      // Use the custom client with proper upsert handling
      const videosTable = new SupabaseTable(this.client, 'videos');
      const { data, error } = await videosTable.upsert(videoData, { onConflict: 'video_id' });
      
      if (error) {
        console.error('❌ Error upserting video:', error);
        throw error;
      }
      
      console.log('✅ Video upserted:', data);
      return data;
    },

    // Video Analysis
    async getVideoAnalysis(videoId) {
      console.log('🔍 Getting video analysis for video ID:', videoId);
      
      // First get the video
      const video = await this.getVideo(videoId);
      if (!video) {
        console.log('📹 No video found for ID:', videoId);
        return null;
      }
      
      const videoAnalysisTable = new SupabaseTable(this.client, 'video_analysis');
      const { data, error } = await videoAnalysisTable.select('*')
        .eq('video_id', video.id)
        .execute();
      
      if (error) {
        console.error('❌ Error getting video analysis:', error);
        throw error;
      }
      
      console.log('📊 Video analysis result:', data);
      return data;
    },

    async createVideoAnalysis(analysisData) {
      console.log('📝 Creating video analysis:', analysisData);
      const videoAnalysisTable = new SupabaseTable(this.client, 'video_analysis');
      const { data, error } = await videoAnalysisTable.insert(analysisData);
      
      if (error) {
        console.error('❌ Error creating video analysis:', error);
        throw error;
      }
      
      console.log('✅ Video analysis created:', data);
      return data;
    },

    // Detected Lies
    async getDetectedLies(analysisId) {
      console.log('🔍 Getting detected lies for analysis ID:', analysisId);
      const detectedLiesTable = new SupabaseTable(this.client, 'detected_lies');
      const { data, error } = await detectedLiesTable.select('*')
        .eq('analysis_id', analysisId)
        .execute();
      
      if (error) {
        console.error('❌ Error getting detected lies:', error);
        throw error;
      }
      
      console.log('🚨 Detected lies result:', data);
      return data;
    },

    async createDetectedLies(liesData) {
      console.log('📝 Creating detected lies:', liesData);
      const detectedLiesTable = new SupabaseTable(this.client, 'detected_lies');
      const { data, error } = await detectedLiesTable.insert(liesData);
      
      if (error) {
        console.error('❌ Error creating detected lies:', error);
        throw error;
      }
      
      console.log('✅ Detected lies created:', data);
      return data;
    },

    // High-level storage functions used by content script
    async storeVideoAnalysis(analysisData) {
      try {
        console.log('📝 Storing video analysis:', analysisData);
        
        // First, ensure the video record exists
        const videoData = {
          video_id: analysisData.video_id,
          title: analysisData.video_title,
          channel_name: analysisData.channel_name,
          // Extract duration from URL if available, otherwise default
          duration: null
        };
        
        const video = await this.upsertVideo(videoData);
        
        // Map the analysis data to match database schema (base columns only - migration pending)
        const dbAnalysisData = {
          video_id: video.id, // Use the UUID from videos table
          analysis_version: '2.1',
          total_lies_detected: analysisData.total_lies || 0,
          analysis_duration_minutes: analysisData.analysis_duration_minutes || 20,
          confidence_threshold: 0.85
          // TODO: Add these after migration is applied:
          // average_confidence: analysisData.average_confidence || 0,
          // severity_low: analysisData.severity_low || 0,
          // severity_medium: analysisData.severity_medium || 0,
          // severity_high: analysisData.severity_high || 0,
          // total_segments_analyzed: analysisData.total_segments_analyzed || 0
        };
        
        const analysisResult = await this.createVideoAnalysis(dbAnalysisData);
        console.log('✅ Video analysis stored successfully');
        return analysisResult;
        
      } catch (error) {
        console.error('❌ Error storing video analysis:', error);
        throw error;
      }
    },

    async storeLies(liesData) {
      try {
        console.log('📝 Storing lies data:', liesData);
        
        if (!liesData || liesData.length === 0) {
          console.log('📝 No lies to store');
          return [];
        }
        
        // Get the video and analysis records to get the analysis_id
        const videoId = liesData[0].video_id;
        const video = await this.getVideo(videoId);
        
        if (!video) {
          throw new Error('Video not found for storing lies');
        }
        
        const analyses = await this.getVideoAnalysis(videoId);
        if (!analyses || analyses.length === 0) {
          throw new Error('No analysis found for storing lies');
        }
        
        const latestAnalysis = analyses[0];
        
        // Map lies data to match database schema
        const dbLiesData = liesData.map(lie => ({
          analysis_id: latestAnalysis.id,
          timestamp_seconds: lie.timestamp_seconds,
          duration_seconds: lie.duration_seconds || 10,
          claim_text: lie.claim_text,
          explanation: lie.explanation,
          confidence: lie.confidence,
          severity: lie.severity,
          category: lie.category || 'other'
        }));
        
        const result = await this.createDetectedLies(dbLiesData);
        console.log('✅ Lies stored successfully');
        return result;
        
      } catch (error) {
        console.error('❌ Error storing lies:', error);
        throw error;
      }
    },

    // Analytics
    async getVideoStats(videoId) {
      try {
        console.log('📊 Getting video stats for:', videoId);
        
        const video = await this.getVideo(videoId);
        if (!video) {
          console.log('📹 No video found, returning null');
          return null;
        }

        const analysis = await this.getVideoAnalysis(videoId);
        if (!analysis || analysis.length === 0) {
          console.log('📊 No analysis found, returning basic stats');
          return { video, totalLies: 0, verifications: {} };
        }

        const latestAnalysis = analysis[0];
        const lies = await this.getDetectedLies(latestAnalysis.id);
        
        const stats = {
          video,
          analysis: latestAnalysis,
          lies,
          totalLies: lies.length,
          verifications: {}
        };
        
        console.log('✅ Video stats result:', stats);
        return stats;
      } catch (error) {
        console.error('❌ Error getting video stats:', error);
        return null;
      }
    }
  };
  
  // Test connection when client loads
  window.SupabaseDB.testConnection().then(success => {
    if (success) {
      console.log('✅ Supabase client loaded and connected successfully');
    } else {
      console.warn('⚠️ Supabase client loaded but connection failed');
    }
  });
})();