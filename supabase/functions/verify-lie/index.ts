import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface VerifyLieRequest {
  lieId: string
  verificationType: 'confirmed' | 'disputed' | 'false_positive'
  notes?: string
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

    const requestData: VerifyLieRequest = await req.json()
    const { lieId, verificationType, notes } = requestData

    // Upsert verification (update if exists, insert if not)
    const { data, error } = await supabaseClient
      .from('lie_verifications')
      .upsert({
        lie_id: lieId,
        user_id: user.id,
        verification_type: verificationType,
        notes: notes || null
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to save verification: ${error.message}`)
    }

    // Record user contribution
    await supabaseClient
      .from('user_contributions')
      .insert({
        user_id: user.id,
        analysis_id: null, // This is a verification, not an analysis
        contribution_type: 'verification',
        api_cost_cents: 0
      })

    return new Response(
      JSON.stringify({
        success: true,
        verification: data
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Error in verify-lie function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})