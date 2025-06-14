export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      videos: {
        Row: {
          id: string
          video_id: string
          title: string | null
          channel_name: string | null
          duration: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          video_id: string
          title?: string | null
          channel_name?: string | null
          duration?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          video_id?: string
          title?: string | null
          channel_name?: string | null
          duration?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      video_analysis: {
        Row: {
          id: string
          video_id: string
          analysis_version: string
          total_lies_detected: number
          analysis_duration_minutes: number
          confidence_threshold: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          video_id: string
          analysis_version?: string
          total_lies_detected?: number
          analysis_duration_minutes?: number
          confidence_threshold?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          video_id?: string
          analysis_version?: string
          total_lies_detected?: number
          analysis_duration_minutes?: number
          confidence_threshold?: number
          created_at?: string
          updated_at?: string
        }
      }
      detected_lies: {
        Row: {
          id: string
          analysis_id: string
          timestamp_seconds: number
          duration_seconds: number
          claim_text: string
          explanation: string
          confidence: number
          severity: 'low' | 'medium' | 'high'
          category: string
          created_at: string
        }
        Insert: {
          id?: string
          analysis_id: string
          timestamp_seconds: number
          duration_seconds?: number
          claim_text: string
          explanation: string
          confidence: number
          severity?: 'low' | 'medium' | 'high'
          category?: string
          created_at?: string
        }
        Update: {
          id?: string
          analysis_id?: string
          timestamp_seconds?: number
          duration_seconds?: number
          claim_text?: string
          explanation?: string
          confidence?: number
          severity?: 'low' | 'medium' | 'high'
          category?: string
          created_at?: string
        }
      }
      user_contributions: {
        Row: {
          id: string
          user_id: string
          analysis_id: string | null
          contribution_type: 'analysis' | 'verification' | 'report'
          api_cost_cents: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          analysis_id?: string | null
          contribution_type?: 'analysis' | 'verification' | 'report'
          api_cost_cents?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          analysis_id?: string | null
          contribution_type?: 'analysis' | 'verification' | 'report'
          api_cost_cents?: number
          created_at?: string
        }
      }
      lie_verifications: {
        Row: {
          id: string
          lie_id: string
          user_id: string
          verification_type: 'confirmed' | 'disputed' | 'false_positive'
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lie_id: string
          user_id: string
          verification_type: 'confirmed' | 'disputed' | 'false_positive'
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lie_id?: string
          user_id?: string
          verification_type?: 'confirmed' | 'disputed' | 'false_positive'
          notes?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}