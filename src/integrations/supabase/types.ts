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
      action_items: {
        Row: {
          created_at: string
          description: string
          due_date: string | null
          id: string
          meeting_id: string | null
          organization_id: string
          position_id: string | null
          status: Database["public"]["Enums"]["action_item_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          organization_id: string
          position_id?: string | null
          status?: Database["public"]["Enums"]["action_item_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          organization_id?: string
          position_id?: string | null
          status?: Database["public"]["Enums"]["action_item_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
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
      correspondence: {
        Row: {
          body: string | null
          counterparty: string | null
          created_at: string
          direction: Database["public"]["Enums"]["correspondence_direction"]
          id: string
          occurred_at: string
          organization_id: string
          position_id: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          counterparty?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["correspondence_direction"]
          id?: string
          occurred_at?: string
          organization_id: string
          position_id?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          counterparty?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["correspondence_direction"]
          id?: string
          occurred_at?: string
          organization_id?: string
          position_id?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "correspondence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correspondence_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      election_proposals: {
        Row: {
          created_at: string
          id: string
          meeting_id: string | null
          organization_id: string
          position_id: string | null
          proposed_holder_name: string | null
          source_excerpt: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id?: string | null
          organization_id: string
          position_id?: string | null
          proposed_holder_name?: string | null
          source_excerpt?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string | null
          organization_id?: string
          position_id?: string | null
          proposed_holder_name?: string | null
          source_excerpt?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "election_proposals_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "election_proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "election_proposals_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
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
      motion_votes: {
        Row: {
          id: string
          motion_id: string
          user_id: string
          vote: Database["public"]["Enums"]["vote_choice"]
          voted_at: string
        }
        Insert: {
          id?: string
          motion_id: string
          user_id: string
          vote: Database["public"]["Enums"]["vote_choice"]
          voted_at?: string
        }
        Update: {
          id?: string
          motion_id?: string
          user_id?: string
          vote?: Database["public"]["Enums"]["vote_choice"]
          voted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "motion_votes_motion_id_fkey"
            columns: ["motion_id"]
            isOneToOne: false
            referencedRelation: "motions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motion_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          voting_closes_at: string | null
          voting_mode: string
          voting_opens_at: string | null
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
          voting_closes_at?: string | null
          voting_mode?: string
          voting_opens_at?: string | null
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
          voting_closes_at?: string | null
          voting_mode?: string
          voting_opens_at?: string | null
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
      organization_secrets: {
        Row: {
          fieldy_api_key_encrypted: string | null
          google_oauth_tokens: Json | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          fieldy_api_key_encrypted?: string | null
          google_oauth_tokens?: Json | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          fieldy_api_key_encrypted?: string | null
          google_oauth_tokens?: Json | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_secrets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          gmail_address: string | null
          id: string
          name: string
          quorum_required: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          gmail_address?: string | null
          id?: string
          name: string
          quorum_required?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          gmail_address?: string | null
          id?: string
          name?: string
          quorum_required?: number
          updated_at?: string
        }
        Relationships: []
      }
      position_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          org_affiliation: string | null
          organization_id: string
          phone: string | null
          position_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org_affiliation?: string | null
          organization_id: string
          phone?: string | null
          position_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_affiliation?: string | null
          organization_id?: string
          phone?: string | null
          position_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_contacts_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      position_handover_notes: {
        Row: {
          author_name: string | null
          author_user_id: string
          created_at: string
          id: string
          note_text: string
          organization_id: string
          position_id: string
        }
        Insert: {
          author_name?: string | null
          author_user_id: string
          created_at?: string
          id?: string
          note_text: string
          organization_id: string
          position_id: string
        }
        Update: {
          author_name?: string | null
          author_user_id?: string
          created_at?: string
          id?: string
          note_text?: string
          organization_id?: string
          position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_handover_notes_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_handover_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_handover_notes_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      position_holders: {
        Row: {
          assigned_via: Database["public"]["Enums"]["assigned_via"]
          created_at: string
          current_login_user_id: string | null
          forwarding_email: string | null
          holder_name: string
          id: string
          organization_id: string
          phone: string | null
          portal_status: Database["public"]["Enums"]["portal_status"]
          position_id: string
          term_end: string | null
          term_start: string
          updated_at: string
        }
        Insert: {
          assigned_via?: Database["public"]["Enums"]["assigned_via"]
          created_at?: string
          current_login_user_id?: string | null
          forwarding_email?: string | null
          holder_name: string
          id?: string
          organization_id: string
          phone?: string | null
          portal_status?: Database["public"]["Enums"]["portal_status"]
          position_id: string
          term_end?: string | null
          term_start?: string
          updated_at?: string
        }
        Update: {
          assigned_via?: Database["public"]["Enums"]["assigned_via"]
          created_at?: string
          current_login_user_id?: string | null
          forwarding_email?: string | null
          holder_name?: string
          id?: string
          organization_id?: string
          phone?: string | null
          portal_status?: Database["public"]["Enums"]["portal_status"]
          position_id?: string
          term_end?: string | null
          term_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_holders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_holders_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      position_portal_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          position_holder_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          position_holder_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          position_holder_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_portal_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_portal_invitations_position_holder_id_fkey"
            columns: ["position_holder_id"]
            isOneToOne: false
            referencedRelation: "position_holders"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          auto_succeeds_position_id: string | null
          brief: string | null
          category: Database["public"]["Enums"]["position_category"]
          created_at: string
          default_app_role: Database["public"]["Enums"]["app_role"]
          display_order: number
          id: string
          organization_id: string
          role_email: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          auto_succeeds_position_id?: string | null
          brief?: string | null
          category?: Database["public"]["Enums"]["position_category"]
          created_at?: string
          default_app_role?: Database["public"]["Enums"]["app_role"]
          display_order?: number
          id?: string
          organization_id: string
          role_email?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          auto_succeeds_position_id?: string | null
          brief?: string | null
          category?: Database["public"]["Enums"]["position_category"]
          created_at?: string
          default_app_role?: Database["public"]["Enums"]["app_role"]
          display_order?: number
          id?: string
          organization_id?: string
          role_email?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_auto_succeeds_position_id_fkey"
            columns: ["auto_succeeds_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      is_position_holder: {
        Args: { _position_id: string; _user_id: string }
        Returns: boolean
      }
      reassign_position: {
        Args: {
          _forwarding_email: string
          _holder_name: string
          _phone: string
          _position_id: string
        }
        Returns: string
      }
    }
    Enums: {
      action_item_status: "open" | "carried_forward" | "done"
      app_role: "chair" | "secretary" | "officer"
      assigned_via:
        | "initial_setup"
        | "agm_election"
        | "board_appointment"
        | "manual"
      correspondence_direction: "inbound" | "outbound"
      meeting_status:
        | "scheduled"
        | "reports_open"
        | "agenda_generated"
        | "in_progress"
        | "adjourned"
        | "minutes_draft"
        | "minutes_approved"
      motion_result: "carried" | "defeated" | "tabled" | "withdrawn"
      portal_status: "invitation_pending" | "active" | "revoked"
      position_category:
        | "elected_officer"
        | "appointed_officer"
        | "director_at_large"
        | "ex_officio"
        | "custom"
      vote_choice: "for" | "against" | "abstain"
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
      action_item_status: ["open", "carried_forward", "done"],
      app_role: ["chair", "secretary", "officer"],
      assigned_via: [
        "initial_setup",
        "agm_election",
        "board_appointment",
        "manual",
      ],
      correspondence_direction: ["inbound", "outbound"],
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
      portal_status: ["invitation_pending", "active", "revoked"],
      position_category: [
        "elected_officer",
        "appointed_officer",
        "director_at_large",
        "ex_officio",
        "custom",
      ],
      vote_choice: ["for", "against", "abstain"],
    },
  },
} as const
