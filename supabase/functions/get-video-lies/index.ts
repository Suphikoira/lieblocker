import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Get video ID from URL parameters
    const url = new URL(req.url)
    const videoId = url.searchParams.get('videoId')
    const minConfidence = parseFloat(url.searchParams.get('minConfidence') || '0.85')

    if (!videoId) {
      return new Response(
        JSON.stringify({ error: 'videoId parameter is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get video and its latest analysis with lies
    const { data, error } = await supabaseClient
      .from('videos')
      .select(`
        id,
        video_id,
        title,
        channel_name,
        duration,
        video_analysis (
          id,
          analysis_version,
          total_lies_detected,
          analysis_duration_minutes,
          confidence_threshold,
          created_at,
          detected_lies (
            id,
            timestamp_seconds,
            duration_seconds,
            claim_text,
            explanation,
            confidence,
            severity,
            category,
            created_at
          )
        )
      `)
      .eq('video_id', videoId)
      .order('created_at', { foreignTable: 'video_analysis', ascending: false })
      .limit(1, { foreignTable: 'video_analysis' })
      .single()

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database error: ${error.message}`)
    }

    if (!data || !data.video_analysis || data.video_analysis.length === 0) {
      return new Response(
        JSON.stringify({
          videoId,
          hasAnalysis: false,
          lies: [],
          totalLies: 0,
          message: 'No analysis found for this video'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const analysis = data.video_analysis[0]
    const allLies = analysis.detected_lies || []

    // Filter lies by confidence threshold
    const filteredLies = allLies.filter(lie => lie.confidence >= minConfidence)

    // Sort lies by timestamp
    filteredLies.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)

    // Transform lies to match extension format
    const transformedLies = filteredLies.map(lie => ({
      timestamp: formatSecondsToTimestamp(lie.timestamp_seconds),
      timeInSeconds: lie.timestamp_seconds,
      duration: lie.duration_seconds,
      claim: lie.claim_text,
      explanation: lie.explanation,
      confidence: lie.confidence,
      severity: lie.severity,
      category: lie.category
    }))

    // Calculate verification stats
    const { data: verifications } = await supabaseClient
      .from('lie_verifications')
      .select('lie_id, verification_type')
      .in('lie_id', filteredLies.map(l => l.id))

    const verificationStats = verifications?.reduce((acc, v) => {
      if (!acc[v.lie_id]) {
        acc[v.lie_id] = { confirmed: 0, disputed: 0, false_positive: 0 }
      }
      acc[v.lie_id][v.verification_type]++
      return acc
    }, {} as Record<string, any>) || {}

    return new Response(
      JSON.stringify({
        videoId,
        hasAnalysis: true,
        lies: transformedLies,
        totalLies: filteredLies.length,
        analysis: {
          id: analysis.id,
          version: analysis.analysis_version,
          totalDetected: analysis.total_lies_detected,
          durationMinutes: analysis.analysis_duration_minutes,
          confidenceThreshold: analysis.confidence_threshold,
          createdAt: analysis.created_at
        },
        verificationStats,
        video: {
          title: data.title,
          channelName: data.channel_name,
          duration: data.duration
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Error in get-video-lies function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

function formatSecondsToTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}