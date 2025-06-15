// Supabase client for Chrome extension
// This file will be injected into the page context

(function() {
  'use strict';
  
  // Check if we're in the right environment
  if (typeof window === 'undefined') return;
  
  // Supabase configuration - you need to replace these with your actual values
  const SUPABASE_URL = 'https://your-project.supabase.co';
  const SUPABASE_ANON_KEY = 'your-anon-key';
  
  // Simple Supabase client implementation for Chrome extension
  class SimpleSupabaseClient {
    constructor(url, key) {
      this.url = url;
      this.key = key;
      this.headers = {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`
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
        
        const response = await fetch(url, {
          method: 'GET',
          headers: this.client.headers
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (this.query.single) {
          return { data: data[0] || null, error: null };
        }
        
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    }
    
    async insert(data) {
      try {
        const response = await fetch(`${this.client.url}/rest/v1/${this.table}`, {
          method: 'POST',
          headers: {
            ...this.client.headers,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(Array.isArray(data) ? data : [data])
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return { data: Array.isArray(data) ? result : result[0], error: null };
      } catch (error) {
        return { data: null, error };
      }
    }
    
    async upsert(data, options = {}) {
      try {
        const headers = {
          ...this.client.headers,
          'Prefer': 'return=representation'
        };
        
        if (options.onConflict) {
          headers['Prefer'] += `,resolution=merge-duplicates`;
        }
        
        const response = await fetch(`${this.client.url}/rest/v1/${this.table}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(Array.isArray(data) ? data : [data])
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return { data: Array.isArray(data) ? result : result[0], error: null };
      } catch (error) {
        return { data: null, error };
      }
    }
  }
  
  // Initialize Supabase client
  const supabase = new SimpleSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Database helper functions
  window.SupabaseDB = {
    // Videos
    async getVideo(videoId) {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('video_id', videoId)
        .single()
        .execute();
      
      if (error && error.message && !error.message.includes('No rows')) throw error;
      return data;
    },

    async createVideo(videoData) {
      const { data, error } = await supabase
        .from('videos')
        .insert(videoData);
      
      if (error) throw error;
      return data;
    },

    async upsertVideo(videoData) {
      const { data, error } = await supabase
        .from('videos')
        .upsert(videoData, { onConflict: 'video_id' });
      
      if (error) throw error;
      return data;
    },

    // Video Analysis
    async getVideoAnalysis(videoId) {
      // First get the video
      const video = await this.getVideo(videoId);
      if (!video) return null;
      
      const { data, error } = await supabase
        .from('video_analysis')
        .select('*')
        .eq('video_id', video.id)
        .order('created_at', { ascending: false })
        .execute();
      
      if (error) throw error;
      return data;
    },

    async createVideoAnalysis(analysisData) {
      const { data, error } = await supabase
        .from('video_analysis')
        .insert(analysisData);
      
      if (error) throw error;
      return data;
    },

    // Detected Lies
    async getDetectedLies(analysisId) {
      const { data, error } = await supabase
        .from('detected_lies')
        .select('*')
        .eq('analysis_id', analysisId)
        .order('timestamp_seconds', { ascending: true })
        .execute();
      
      if (error) throw error;
      return data;
    },

    async createDetectedLies(liesData) {
      const { data, error } = await supabase
        .from('detected_lies')
        .insert(liesData);
      
      if (error) throw error;
      return data;
    },

    // Analytics
    async getVideoStats(videoId) {
      try {
        const video = await this.getVideo(videoId);
        if (!video) return null;

        const analysis = await this.getVideoAnalysis(video.id);
        if (!analysis || analysis.length === 0) return { video, totalLies: 0, verifications: {} };

        const latestAnalysis = analysis[0];
        const lies = await this.getDetectedLies(latestAnalysis.id);
        
        return {
          video,
          analysis: latestAnalysis,
          lies,
          totalLies: lies.length,
          verifications: {}
        };
      } catch (error) {
        console.error('Error getting video stats:', error);
        return null;
      }
    }
  };
  
  console.log('✅ Supabase client loaded successfully');
})();