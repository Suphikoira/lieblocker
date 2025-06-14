import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface AnalyzeVideoRequest {
  videoId: string
  videoTitle?: string
  channelName?: string
  videoDuration?: number
  lies: Array<{
    timestamp_seconds: number
    duration_seconds: number
    claim_text: string
    explanation: string
    confidence: number
    severity: 'low' | 'medium' | 'high'
    category?: string
  }>
  analysisDuration: number
  confidenceThreshold: number
  apiCostCents?: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get user from JWT
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const requestData: AnalyzeVideoRequest = await req.json()
    const { 
      videoId, 
      videoTitle, 
      channelName, 
      videoDuration,
      lies, 
      analysisDuration, 
      confidenceThreshold,
      apiCostCents = 0
    } = requestData

    // Check if video already exists
    let { data: existingVideo } = await supabaseClient
      .from('videos')
      .select('id')
      .eq('video_id', videoId)
      .single()

    let videoDbId: string

    if (!existingVideo) {
      // Create new video record
      const { data: newVideo, error: videoError } = await supabaseClient
        .from('videos')
        .insert({
          video_id: videoId,
          title: videoTitle,
          channel_name: channelName,
          duration: videoDuration
        })
        .select('id')
        .single()

      if (videoError) {
        throw new Error(`Failed to create video: ${videoError.message}`)
      }

      videoDbId = newVideo.id
    } else {
      videoDbId = existingVideo.id

      // Update video info if provided
      if (videoTitle || channelName || videoDuration) {
        await supabaseClient
          .from('videos')
          .update({
            ...(videoTitle && { title: videoTitle }),
            ...(channelName && { channel_name: channelName }),
            ...(videoDuration && { duration: videoDuration })
          })
          .eq('id', videoDbId)
      }
    }

    // Create analysis record
    const { data: analysis, error: analysisError } = await supabaseClient
      .from('video_analysis')
      .insert({
        video_id: videoDbId,
        total_lies_detected: lies.length,
        analysis_duration_minutes: analysisDuration,
        confidence_threshold: confidenceThreshold
      })
      .select('id')
      .single()

    if (analysisError) {
      throw new Error(`Failed to create analysis: ${analysisError.message}`)
    }

    // Insert detected lies
    if (lies.length > 0) {
      const liesData = lies.map(lie => ({
        analysis_id: analysis.id,
        timestamp_seconds: lie.timestamp_seconds,
        duration_seconds: lie.duration_seconds,
        claim_text: lie.claim_text,
        explanation: lie.explanation,
        confidence: lie.confidence,
        severity: lie.severity,
        category: lie.category || 'other'
      }))

      const { error: liesError } = await supabaseClient
        .from('detected_lies')
        .insert(liesData)

      if (liesError) {
        throw new Error(`Failed to insert lies: ${liesError.message}`)
      }
    }

    // Record user contribution
    await supabaseClient
      .from('user_contributions')
      .insert({
        user_id: user.id,
        analysis_id: analysis.id,
        contribution_type: 'analysis',
        api_cost_cents: apiCostCents
      })

    return new Response(
      JSON.stringify({
        success: true,
        analysisId: analysis.id,
        videoId: videoDbId,
        liesDetected: lies.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Error in analyze-video function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})