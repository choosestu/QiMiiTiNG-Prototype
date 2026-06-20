export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      allowed_users: {
        Row: {
          email: string
          name: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          tier: number
        }
        Insert: {
          email: string
          name: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          tier: number
        }
        Update: {
          email?: string
          name?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tier?: number
        }
        Relationships: [
          {
            foreignKeyName: "allowed_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendees: {
        Row: {
          id: string
          meeting_id: string
          present: boolean
          user_id: string
        }
        Insert: {
          id?: string
          meeting_id: string
          present?: boolean
          user_id: string
        }
        Update: {
          id?: string
          meeting_id?: string
          present?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          email_type: string
          gmail_message_id: string | null
          id: string
          meeting_id: string | null
          organization_id: string
          recipient_user_id: string | null
          sent_at: string
        }
        Insert: {
          email_type: string
          gmail_message_id?: string | null
          id?: string
          meeting_id?: string | null
          organization_id: string
          recipient_user_id?: string | null
          sent_at?: string
        }
        Update: {
          email_type?: string
          gmail_message_id?: string | null
          id?: string
          meeting_id?: string | null
          organization_id?: string
          recipient_user_id?: string | null
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agenda_url: string | null
          conversation_end_time: string | null
          conversation_id: string | null
          conversation_start_time: string | null
          created_at: string
          created_by: string | null
          drive_folder_id: string | null
          fieldy_enabled: boolean
          id: string
          meeting_date: string
          meeting_type: string
          minutes_approved_url: string | null
          minutes_draft_url: string | null
          organization_id: string
          quorum_met: boolean | null
          quorum_required: number
          status: Database["public"]["Enums"]["meeting_status"]
          title: string
          updated_at: string
        }
        Insert: {
          agenda_url?: string | null
          conversation_end_time?: string | null
          conversation_id?: string | null
          conversation_start_time?: string | null
          created_at?: string
          created_by?: string | null
          drive_folder_id?: string | null
          fieldy_enabled?: boolean
          id?: string
          meeting_date: string
          meeting_type: string
          minutes_approved_url?: string | null
          minutes_draft_url?: string | null
          organization_id: string
          quorum_met?: boolean | null
          quorum_required?: number
          status?: Database["public"]["Enums"]["meeting_status"]
          title: string
          updated_at?: string
        }
        Update: {
          agenda_url?: string | null
          conversation_end_time?: string | null
          conversation_id?: string | null
          conversation_start_time?: string | null
          created_at?: string
          created_by?: string | null
          drive_folder_id?: string | null
          fieldy_enabled?: boolean
          id?: string
          meeting_date?: string
          meeting_type?: string
          minutes_approved_url?: string | null
          minutes_draft_url?: string | null
          organization_id?: string
          quorum_met?: boolean | null
          quorum_required?: number
          status?: Database["public"]["Enums"]["meeting_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      minutes: {
        Row: {
          ai_draft_created_at: string | null
          ai_draft_text: string | null
          approved_at: string | null
          approved_by: string | null
          approved_text: string | null
          drive_url: string | null
          id: string
          meeting_id: string
        }
        Insert: {
          ai_draft_created_at?: string | null
          ai_draft_text?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_text?: string | null
          drive_url?: string | null
          id?: string
          meeting_id: string
        }
        Update: {
          ai_draft_created_at?: string | null
          ai_draft_text?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_text?: string | null
          drive_url?: string | null
          id?: string
          meeting_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "minutes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "minutes_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      minutes_edits: {
        Row: {
          corrected_text: string
          edited_at: string
          edited_by: string
          id: string
          minutes_id: string
          original_text: string
        }
        Insert: {
          corrected_text: string
          edited_at?: string
          edited_by: string
          id?: string
          minutes_id: string
          original_text: string
        }
        Update: {
          corrected_text?: string
          edited_at?: string
          edited_by?: string
          id?: string
          minutes_id?: string
          original_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "minutes_edits_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "minutes_edits_minutes_id_fkey"
            columns: ["minutes_id"]
            isOneToOne: false
            referencedRelation: "minutes"
            referencedColumns: ["id"]
          },
        ]
      }
      motions: {
        Row: {
          created_at: string
          id: string
          meeting_id: string
          motion_text: string
          moved_by: string | null
          result: Database["public"]["Enums"]["motion_result"] | null
          seconded_by: string | null
          vote_abstain: number
          vote_against: number
          vote_for: number
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id: string
          motion_text: string
          moved_by?: string | null
          result?: Database["public"]["Enums"]["motion_result"] | null
          seconded_by?: string | null
          vote_abstain?: number
          vote_against?: number
          vote_for?: number
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string
          motion_text?: string
          moved_by?: string | null
          result?: Database["public"]["Enums"]["motion_result"] | null
          seconded_by?: string | null
          vote_abstain?: number
          vote_against?: number
          vote_for?: number
        }
        Relationships: [
          {
            foreignKeyName: "motions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motions_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motions_seconded_by_fkey"
            columns: ["seconded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      officer_reports: {
        Row: {
          bank_balance: number | null
          id: string
          meeting_id: string
          organization_id: string
          reminder_sent_at: string | null
          report_text: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          bank_balance?: number | null
          id?: string
          meeting_id: string
          organization_id: string
          reminder_sent_at?: string | null
          report_text: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          bank_balance?: number | null
          id?: string
          meeting_id?: string
          organization_id?: string
          reminder_sent_at?: string | null
          report_text?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "officer_reports_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          fieldy_api_key_encrypted: string | null
          gmail_address: string | null
          google_oauth_tokens: Json | null
          id: string
          name: string
          quorum_required: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fieldy_api_key_encrypted?: string | null
          gmail_address?: string | null
          google_oauth_tokens?: Json | null
          id?: string
          name: string
          quorum_required?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fieldy_api_key_encrypted?: string | null
          gmail_address?: string | null
          google_oauth_tokens?: Json | null
          id?: string
          name?: string
          quorum_required?: number
          updated_at?: string
        }
        Relationships: []
      }
      transcript_segments: {
        Row: {
          end_offset: number | null
          fieldy_segment_id: string | null
          id: string
          meeting_id: string
          segment_index: number
          segment_timestamp: string | null
          speaker: string | null
          speaker_profile_id: string | null
          start_offset: number | null
          text: string
        }
        Insert: {
          end_offset?: number | null
          fieldy_segment_id?: string | null
          id?: string
          meeting_id: string
          segment_index: number
          segment_timestamp?: string | null
          speaker?: string | null
          speaker_profile_id?: string | null
          start_offset?: number | null
          text: string
        }
        Update: {
          end_offset?: number | null
          fieldy_segment_id?: string | null
          id?: string
          meeting_id?: string
          segment_index?: number
          segment_timestamp?: string | null
          speaker?: string | null
          speaker_profile_id?: string | null
          start_offset?: number | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_segments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          organization_id: string
          tier: number
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          organization_id: string
          tier: number
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          organization_id?: string
          tier?: number
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "chair" | "secretary" | "officer"
      meeting_status:
        | "scheduled"
        | "reports_open"
        | "agenda_generated"
        | "in_progress"
        | "adjourned"
        | "minutes_draft"
        | "minutes_approved"
      motion_result: "carried" | "defeated" | "tabled" | "withdrawn"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["chair", "secretary", "officer"],
      meeting_status: [
        "scheduled",
        "reports_open",
        "agenda_generated",
        "in_progress",
        "adjourned",
        "minutes_draft",
        "minutes_approved",
      ],
      motion_result: ["carried", "defeated", "tabled", "withdrawn"],
    },
  },
} as const
