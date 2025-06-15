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
        
        console.log('📝 Supabase INSERT request:', url, payload);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: this.client.headers,
          body: JSON.stringify(payload)
        });
        
        console.log('📡 Supabase INSERT response:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Supabase INSERT error:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ Supabase INSERT success:', result);
        
        return { data: Array.isArray(data) ? result : result[0], error: null };
      } catch (error) {
        console.error('❌ Supabase insert error:', error);
        return { data: null, error };
      }
    }
    
    async upsert(data, options = {}) {
      try {
        const url = `${this.client.url}/rest/v1/${this.table}`;
        const payload = Array.isArray(data) ? data : [data];
        
        const headers = {
          ...this.client.headers
        };
        
        // Add resolution preference for upserts
        if (options.onConflict) {
          headers['Prefer'] += ',resolution=merge-duplicates';
        }
        
        console.log('🔄 Supabase UPSERT request:', url, payload);
        console.log('🔄 Supabase UPSERT headers:', headers);
        
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        
        console.log('📡 Supabase UPSERT response:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Supabase UPSERT error:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ Supabase UPSERT success:', result);
        
        return { data: Array.isArray(data) ? result : result[0], error: null };
      } catch (error) {
        console.error('❌ Supabase upsert error:', error);
        return { data: null, error };
      }
    }
  }
  
  // Initialize Supabase client
  const supabase = new SimpleSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Database helper functions
  window.SupabaseDB = {
    // Test connection
    async testConnection() {
      try {
        console.log('🧪 Testing Supabase connection...');
        const { data, error } = await supabase
          .from('videos')
          .select('count')
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
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('video_id', videoId)
        .single()
        .execute();
      
      if (error && error.message && !error.message.includes('No rows')) {
        console.error('❌ Error getting video:', error);
        throw error;
      }
      
      console.log('📹 Video result:', data);
      return data;
    },

    async createVideo(videoData) {
      console.log('📝 Creating video:', videoData);
      const { data, error } = await supabase
        .from('videos')
        .insert(videoData);
      
      if (error) {
        console.error('❌ Error creating video:', error);
        throw error;
      }
      
      console.log('✅ Video created:', data);
      return data;
    },

    async upsertVideo(videoData) {
      console.log('🔄 Upserting video:', videoData);
      const { data, error } = await supabase
        .from('videos')
        .upsert(videoData, { onConflict: 'video_id' });
      
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
      
      const { data, error } = await supabase
        .from('video_analysis')
        .select('*')
        .eq('video_id', video.id)
        .order('created_at', { ascending: false })
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
      const { data, error } = await supabase
        .from('video_analysis')
        .insert(analysisData);
      
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
      const { data, error } = await supabase
        .from('detected_lies')
        .select('*')
        .eq('analysis_id', analysisId)
        .order('timestamp_seconds', { ascending: true })
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
      const { data, error } = await supabase
        .from('detected_lies')
        .insert(liesData);
      
      if (error) {
        console.error('❌ Error creating detected lies:', error);
        throw error;
      }
      
      console.log('✅ Detected lies created:', data);
      return data;
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