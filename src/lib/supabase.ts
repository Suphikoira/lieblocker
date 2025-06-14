import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Helper functions for the extension
export async function getVideoLies(videoId: string, minConfidence: number = 0.85) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/get-video-lies?videoId=${videoId}&minConfidence=${minConfidence}`, {
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Error fetching video lies:', error)
    throw error
  }
}

export async function submitVideoAnalysis(
  videoId: string,
  lies: Array<{
    timestamp_seconds: number
    duration_seconds: number
    claim_text: string
    explanation: string
    confidence: number
    severity: 'low' | 'medium' | 'high'
    category?: string
  }>,
  options: {
    videoTitle?: string
    channelName?: string
    videoDuration?: number
    analysisDuration: number
    confidenceThreshold: number
    apiCostCents?: number
    userToken: string
  }
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-video`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${options.userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        videoId,
        videoTitle: options.videoTitle,
        channelName: options.channelName,
        videoDuration: options.videoDuration,
        lies,
        analysisDuration: options.analysisDuration,
        confidenceThreshold: options.confidenceThreshold,
        apiCostCents: options.apiCostCents
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Error submitting video analysis:', error)
    throw error
  }
}

export async function verifyLie(
  lieId: string,
  verificationType: 'confirmed' | 'disputed' | 'false_positive',
  notes: string | undefined,
  userToken: string
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/verify-lie`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lieId,
        verificationType,
        notes
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Error verifying lie:', error)
    throw error
  }
}