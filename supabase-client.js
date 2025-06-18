// Supabase client for Chrome extension
// This file will be injected into the page context

(function() {
  'use strict';
  
  // Check if we're in the right environment
  if (typeof window === 'undefined') return;
  
  // Supabase configuration - you need to replace these with your actual values
  const SUPABASE_URL = 'https://cwetzwmfddegeihmmlnv.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3ZXR6d21mZGRlZ2VpaG1tbG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5MjU0ODAsImV4cCI6MjA2NTUwMTQ4MH0.gpDQ3Bw-lfQbmGsLbIWbi2LiDijW_HEmbIs2-4GAEwk';
  
  // Simple Supabase client implementation for Chrome extension
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
        
        console.log('🔍 Supabase GET request:', url);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: this.client.headers
        });
        
        console.log('📡 Supabase GET response:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Supabase GET error:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('✅ Supabase GET success:', data);
        
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
        const url = `${this.client.url}/rest/v1/${this.table}`;
        const payload = Array.isArray(data) ? data : [data];
        
        // Validate and sanitize data before insertion
        const sanitizedPayload = this.sanitizeData(payload);
        
        console.log('📝 Supabase INSERT request:', url, sanitizedPayload);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: this.client.headers,
          body: JSON.stringify(sanitizedPayload)
        });
        
        console.log('📡 Supabase INSERT response:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Supabase INSERT error:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        
        // Check if response has content before parsing JSON
        const responseText = await response.text();
        let result = [];
        
        if (responseText && responseText.trim() !== '') {
          try {
            result = JSON.parse(responseText);
          } catch (parseError) {
            console.warn('⚠️ Non-JSON response from insert:', responseText);
            result = [];
          }
        }
        
        console.log('✅ Supabase INSERT success:', result);
        
        return { data: Array.isArray(data) ? result : result[0], error: null };
      } catch (error) {
        console.error('❌ Supabase insert error:', error);
        return { data: null, error };
      }
    }
    
    async upsert(data, options = {}) {
      try {
        let url = `${this.client.url}/rest/v1/${this.table}`;
        const payload = Array.isArray(data) ? data : [data];
        
        // Validate and sanitize data before insertion
        const sanitizedPayload = this.sanitizeData(payload);
        
        const headers = {
          ...this.client.headers
        };
        
        // For upserts, we need to add the proper parameters and headers
        if (options.onConflict) {
          // Add the on_conflict parameter to the URL
          url += `?on_conflict=${options.onConflict}`;
          // Combine both preferences: return data AND resolve conflicts
          headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
        }
        
        console.log('🔄 Supabase UPSERT request:', url, sanitizedPayload);
        console.log('🔄 Supabase UPSERT headers:', headers);
        
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(sanitizedPayload)
        });
        
        console.log('📡 Supabase UPSERT response:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Supabase UPSERT error:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        
        // Check if response has content before parsing JSON
        const responseText = await response.text();
        let result = [];
        
        if (responseText && responseText.trim() !== '') {
          try {
            result = JSON.parse(responseText);
          } catch (parseError) {
            console.warn('⚠️ Non-JSON response from upsert:', responseText);
            result = [];
          }
        }
        
        console.log('✅ Supabase UPSERT success:', result);
        
        return { data: Array.isArray(data) ? result : result[0], error: null };
      } catch (error) {
        console.error('❌ Supabase upsert error:', error);
        return { data: null, error };
      }
    }
    
    // Data sanitization and validation
    sanitizeData(payload) {
      if (this.table === 'detected_lies') {
        return payload.map(item => ({
          ...item,
          // Ensure severity is one of the allowed values
          severity: this.validateSeverity(item.severity),
          // Ensure confidence is between 0 and 1
          confidence: Math.max(0, Math.min(1, parseFloat(item.confidence) || 0)),
          // Ensure timestamp is a valid integer
          timestamp_seconds: parseInt(item.timestamp_seconds) || 0,
          // Ensure duration is a positive integer
          duration_seconds: Math.max(1, parseInt(item.duration_seconds) || 10),
          // Ensure text fields are strings
          claim_text: String(item.claim_text || ''),
          explanation: String(item.explanation || ''),
          category: String(item.category || 'other')
        }));
      }
      
      return payload;
    }
    
    validateSeverity(severity) {
      const allowedSeverities = ['low', 'medium', 'high', 'critical'];
      const normalizedSeverity = String(severity || 'medium').toLowerCase();
      
      if (allowedSeverities.includes(normalizedSeverity)) {
        return normalizedSeverity;
      }
      
      // Map common variations to valid values
      const severityMap = {
        'minor': 'low',
        'moderate': 'medium',
        'major': 'high',
        'severe': 'high',
        'extreme': 'critical'
      };
      
      return severityMap[normalizedSeverity] || 'medium';
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
        
        // Map lies data to match database schema with proper validation
        const dbLiesData = liesData.map(lie => ({
          analysis_id: latestAnalysis.id,
          timestamp_seconds: parseInt(lie.timestamp_seconds) || 0,
          duration_seconds: Math.max(1, parseInt(lie.duration_seconds) || 10),
          claim_text: String(lie.claim_text || '').substring(0, 1000), // Limit length
          explanation: String(lie.explanation || '').substring(0, 2000), // Limit length
          confidence: Math.max(0, Math.min(1, parseFloat(lie.confidence) || 0)),
          severity: this.validateSeverity(lie.severity),
          category: String(lie.category || 'other').substring(0, 100) // Limit length
        }));
        
        console.log('📝 Sanitized lies data for database:', dbLiesData);
        
        const result = await this.createDetectedLies(dbLiesData);
        console.log('✅ Lies stored successfully');
        return result;
        
      } catch (error) {
        console.error('❌ Error storing lies:', error);
        throw error;
      }
    },
    
    // Severity validation helper
    validateSeverity(severity) {
      const allowedSeverities = ['low', 'medium', 'high', 'critical'];
      const normalizedSeverity = String(severity || 'medium').toLowerCase();
      
      if (allowedSeverities.includes(normalizedSeverity)) {
        return normalizedSeverity;
      }
      
      // Map common variations to valid values
      const severityMap = {
        'minor': 'low',
        'moderate': 'medium',
        'major': 'high',
        'severe': 'high',
        'extreme': 'critical'
      };
      
      return severityMap[normalizedSeverity] || 'medium';
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