import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database helper functions
export const db = {
  // Videos
  async getVideo(videoId) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('video_id', videoId)
      .single()
    
    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  async createVideo(videoData) {
    const { data, error } = await supabase
      .from('videos')
      .insert(videoData)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async upsertVideo(videoData) {
    const { data, error } = await supabase
      .from('videos')
      .upsert(videoData, { onConflict: 'video_id' })
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // Video Analysis
  async getVideoAnalysis(videoId) {
    const { data, error } = await supabase
      .from('video_analysis')
      .select(`
        *,
        video:videos(*),
        detected_lies(*)
      `)
      .eq('video_id', videoId)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data
  },

  async createVideoAnalysis(analysisData) {
    const { data, error } = await supabase
      .from('video_analysis')
      .insert(analysisData)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // Detected Lies
  async getDetectedLies(analysisId) {
    const { data, error } = await supabase
      .from('detected_lies')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('timestamp_seconds', { ascending: true })
    
    if (error) throw error
    return data
  },

  async createDetectedLies(liesData) {
    const { data, error } = await supabase
      .from('detected_lies')
      .insert(liesData)
      .select()
    
    if (error) throw error
    return data
  },

  async getVideoLies(videoId) {
    const { data, error } = await supabase
      .from('detected_lies')
      .select(`
        *,
        analysis:video_analysis!inner(
          video:videos!inner(video_id)
        )
      `)
      .eq('analysis.video.video_id', videoId)
      .order('timestamp_seconds', { ascending: true })
    
    if (error) throw error
    return data
  },

  // User Contributions
  async createUserContribution(contributionData) {
    const { data, error } = await supabase
      .from('user_contributions')
      .insert(contributionData)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async getUserContributions(userId) {
    const { data, error } = await supabase
      .from('user_contributions')
      .select(`
        *,
        analysis:video_analysis(
          *,
          video:videos(*)
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data
  },

  // Lie Verifications
  async createLieVerification(verificationData) {
    const { data, error } = await supabase
      .from('lie_verifications')
      .upsert(verificationData, { onConflict: 'lie_id,user_id' })
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async getLieVerifications(lieId) {
    const { data, error } = await supabase
      .from('lie_verifications')
      .select('*')
      .eq('lie_id', lieId)
    
    if (error) throw error
    return data
  },

  // Users
  async createUser(userData) {
    const { data, error } = await supabase
      .from('users')
      .upsert(userData, { onConflict: 'id' })
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // Analytics
  async getVideoStats(videoId) {
    const { data: video } = await this.getVideo(videoId)
    if (!video) return null

    const { data: analysis } = await this.getVideoAnalysis(video.id)
    if (!analysis || analysis.length === 0) return { video, totalLies: 0, verifications: {} }

    const latestAnalysis = analysis[0]
    const lies = latestAnalysis.detected_lies || []
    
    // Get verification stats
    const verificationStats = {}
    for (const lie of lies) {
      const verifications = await this.getLieVerifications(lie.id)
      verificationStats[lie.id] = {
        confirmed: verifications.filter(v => v.verification_type === 'confirmed').length,
        disputed: verifications.filter(v => v.verification_type === 'disputed').length,
        false_positive: verifications.filter(v => v.verification_type === 'false_positive').length
      }
    }

    return {
      video,
      analysis: latestAnalysis,
      lies,
      totalLies: lies.length,
      verifications: verificationStats
    }
  }
}