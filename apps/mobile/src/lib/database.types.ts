export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          code: string
          names: Json
          parent_code: string | null
        }
        Insert: {
          code: string
          names: Json
          parent_code?: string | null
        }
        Update: {
          code?: string
          names?: Json
          parent_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_code_fkey"
            columns: ["parent_code"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["code"]
          },
        ]
      }
      deliveries: {
        Row: {
          device_token_id: string | null
          dispatch_token: string | null
          dispatched_at: string | null
          error_code: string | null
          id: string
          job_id: string
          next_receipt_at: string | null
          receipt_attempts: number
          receipt_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          device_token_id?: string | null
          dispatch_token?: string | null
          dispatched_at?: string | null
          error_code?: string | null
          id?: string
          job_id: string
          next_receipt_at?: string | null
          receipt_attempts?: number
          receipt_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          device_token_id?: string | null
          dispatch_token?: string | null
          dispatched_at?: string | null
          error_code?: string | null
          id?: string
          job_id?: string
          next_receipt_at?: string | null
          receipt_attempts?: number
          receipt_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_device_token_id_fkey"
            columns: ["device_token_id"]
            isOneToOne: false
            referencedRelation: "device_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_job_id_user_id_fkey"
            columns: ["job_id", "user_id"]
            isOneToOne: false
            referencedRelation: "notification_jobs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      digest_items: {
        Row: {
          digest_id: string
          matched_rule_names: string[]
          occurrence_id: string
          selection_snapshot: Json | null
          user_id: string
        }
        Insert: {
          digest_id: string
          matched_rule_names?: string[]
          occurrence_id: string
          selection_snapshot?: Json | null
          user_id: string
        }
        Update: {
          digest_id?: string
          matched_rule_names?: string[]
          occurrence_id?: string
          selection_snapshot?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "digest_items_digest_id_user_id_fkey"
            columns: ["digest_id", "user_id"]
            isOneToOne: false
            referencedRelation: "digests"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "digest_items_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digest_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      digests: {
        Row: {
          business_key: string
          created_at: string
          horizon_end: string | null
          horizon_start: string | null
          id: string
          rule_id: string | null
          rule_name: string | null
          user_id: string
        }
        Insert: {
          business_key: string
          created_at?: string
          horizon_end?: string | null
          horizon_start?: string | null
          id?: string
          rule_id?: string | null
          rule_name?: string | null
          user_id: string
        }
        Update: {
          business_key?: string
          created_at?: string
          horizon_end?: string | null
          horizon_start?: string | null
          id?: string
          rule_id?: string | null
          rule_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "digests_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_candidates: {
        Row: {
          created_at: string
          left_occurrence: string
          reason: string
          right_occurrence: string
          status: string
        }
        Insert: {
          created_at?: string
          left_occurrence: string
          reason?: string
          right_occurrence: string
          status?: string
        }
        Update: {
          created_at?: string
          left_occurrence?: string
          reason?: string
          right_occurrence?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_candidates_left_occurrence_fkey"
            columns: ["left_occurrence"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_candidates_right_occurrence_fkey"
            columns: ["right_occurrence"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          expires_at: string | null
          provider_reference: string | null
          tier: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          provider_reference?: string | null
          tier?: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          provider_reference?: string | null
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sources: {
        Row: {
          canonical_url: string
          checked_at: string
          occurrence_id: string
          source_record_id: string
        }
        Insert: {
          canonical_url: string
          checked_at: string
          occurrence_id: string
          source_record_id: string
        }
        Update: {
          canonical_url?: string
          checked_at?: string
          occurrence_id?: string
          source_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_sources_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sources_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          age_max: number | null
          age_min: number | null
          canonical_url: string
          category_code: string | null
          checked_at: string
          currency: string | null
          description: string | null
          event_language: string | null
          id: string
          is_demo: boolean
          location: unknown | null
          original_language: string | null
          price: number | null
          primary_source_id: string
          series_id: string | null
          status: string
          territory_id: string | null
          title: string
          venue: string | null
          version: number
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          canonical_url: string
          category_code?: string | null
          checked_at: string
          currency?: string | null
          description?: string | null
          event_language?: string | null
          id?: string
          is_demo?: boolean
          location?: unknown | null
          original_language?: string | null
          price?: number | null
          primary_source_id: string
          series_id?: string | null
          status?: string
          territory_id?: string | null
          title: string
          venue?: string | null
          version?: number
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          canonical_url?: string
          category_code?: string | null
          checked_at?: string
          currency?: string | null
          description?: string | null
          event_language?: string | null
          id?: string
          is_demo?: boolean
          location?: unknown | null
          original_language?: string | null
          price?: number | null
          primary_source_id?: string
          series_id?: string | null
          status?: string
          territory_id?: string | null
          title?: string
          venue?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "events_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "events_primary_source_id_fkey"
            columns: ["primary_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_runs: {
        Row: {
          diagnostic: Json | null
          finished_at: string | null
          id: string
          source_id: string
          started_at: string
          status: string
        }
        Insert: {
          diagnostic?: Json | null
          finished_at?: string | null
          id?: string
          source_id: string
          started_at?: string
          status: string
        }
        Update: {
          diagnostic?: Json | null
          finished_at?: string | null
          id?: string
          source_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_jobs: {
        Row: {
          attempts: number
          business_key: string
          claim_token: string | null
          digest_id: string | null
          error_code: string | null
          expires_at: string | null
          id: string
          lease_until: string | null
          rule_snapshot: Json | null
          run_at: string
          s8_alert_id: string | null
          status: string
          transport: string
          user_id: string
          workflow: string
        }
        Insert: {
          attempts?: number
          business_key: string
          claim_token?: string | null
          digest_id?: string | null
          error_code?: string | null
          expires_at?: string | null
          id?: string
          lease_until?: string | null
          rule_snapshot?: Json | null
          run_at: string
          s8_alert_id?: string | null
          status?: string
          transport?: string
          user_id: string
          workflow?: string
        }
        Update: {
          attempts?: number
          business_key?: string
          claim_token?: string | null
          digest_id?: string | null
          error_code?: string | null
          expires_at?: string | null
          id?: string
          lease_until?: string | null
          rule_snapshot?: Json | null
          run_at?: string
          s8_alert_id?: string | null
          status?: string
          transport?: string
          user_id?: string
          workflow?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_digest_owner"
            columns: ["digest_id", "user_id"]
            isOneToOne: false
            referencedRelation: "digests"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "notification_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s8_job_owner"
            columns: ["s8_alert_id", "user_id"]
            isOneToOne: false
            referencedRelation: "s8_alerts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      occurrences: {
        Row: {
          end_at: string | null
          event_id: string
          external_id: string
          id: string
          local_date: string | null
          start_at: string | null
          status: string
          time_kind: string
          timezone: string | null
        }
        Insert: {
          end_at?: string | null
          event_id: string
          external_id: string
          id?: string
          local_date?: string | null
          start_at?: string | null
          status?: string
          time_kind: string
          timezone?: string | null
        }
        Update: {
          end_at?: string | null
          event_id?: string
          external_id?: string
          id?: string
          local_date?: string | null
          start_at?: string | null
          status?: string
          time_kind?: string
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          locale: string
          notification_timezone: string
          push_enabled: boolean
          translation_locale: string
        }
        Insert: {
          created_at?: string
          id: string
          locale?: string
          notification_timezone?: string
          push_enabled?: boolean
          translation_locale?: string
        }
        Update: {
          created_at?: string
          id?: string
          locale?: string
          notification_timezone?: string
          push_enabled?: boolean
          translation_locale?: string
        }
        Relationships: []
      }
      rule_areas: {
        Row: {
          center: unknown | null
          id: string
          kind: string
          parameters: Json
          polygon: unknown | null
          radius_meters: number | null
          rule_id: string
          territory_id: string | null
          user_id: string
        }
        Insert: {
          center?: unknown | null
          id?: string
          kind: string
          parameters?: Json
          polygon?: unknown | null
          radius_meters?: number | null
          rule_id: string
          territory_id?: string | null
          user_id: string
        }
        Update: {
          center?: unknown | null
          id?: string
          kind?: string
          parameters?: Json
          polygon?: unknown | null
          radius_meters?: number | null
          rule_id?: string
          territory_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_areas_rule_id_user_id_fkey"
            columns: ["rule_id", "user_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "rule_areas_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_areas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rules: {
        Row: {
          delivery_schedule: Json
          enabled: boolean
          event_horizon: Json
          filters: Json
          id: string
          name: string
          next_run_at: string | null
          schedule_retry_at: string | null
          schedule_revision: number
          timezone: string
          user_id: string
        }
        Insert: {
          delivery_schedule?: Json
          enabled?: boolean
          event_horizon?: Json
          filters?: Json
          id?: string
          name: string
          next_run_at?: string | null
          schedule_retry_at?: string | null
          schedule_revision?: number
          timezone?: string
          user_id: string
        }
        Update: {
          delivery_schedule?: Json
          enabled?: boolean
          event_horizon?: Json
          filters?: Json
          id?: string
          name?: string
          next_run_at?: string | null
          schedule_retry_at?: string | null
          schedule_revision?: number
          timezone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      s6_ai_days: {
        Row: {
          committed: number
          currency: string
          day: string
        }
        Insert: {
          committed?: number
          currency: string
          day: string
        }
        Update: {
          committed?: number
          currency?: string
          day?: string
        }
        Relationships: []
      }
      s6_ai_requests: {
        Row: {
          budget_day: string
          ceiling: number
          charge: number | null
          created_at: string
          currency: string
          event_id: string
          finished_at: string | null
          id: string
          input_hash: string
          input_snapshot: Json
          lease_until: string
          locale: string
          model_id: string
          output: Json | null
          overrun: boolean
          prompt_version: string
          provider: string
          reported_cost: number | null
          status: string
          token: string
          version: number
        }
        Insert: {
          budget_day: string
          ceiling: number
          charge?: number | null
          created_at?: string
          currency: string
          event_id: string
          finished_at?: string | null
          id?: string
          input_hash: string
          input_snapshot: Json
          lease_until: string
          locale: string
          model_id: string
          output?: Json | null
          overrun?: boolean
          prompt_version: string
          provider: string
          reported_cost?: number | null
          status: string
          token: string
          version: number
        }
        Update: {
          budget_day?: string
          ceiling?: number
          charge?: number | null
          created_at?: string
          currency?: string
          event_id?: string
          finished_at?: string | null
          id?: string
          input_hash?: string
          input_snapshot?: Json
          lease_until?: string
          locale?: string
          model_id?: string
          output?: Json | null
          overrun?: boolean
          prompt_version?: string
          provider?: string
          reported_cost?: number | null
          status?: string
          token?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "s6_ai_requests_budget_day_currency_fkey"
            columns: ["budget_day", "currency"]
            isOneToOne: false
            referencedRelation: "s6_ai_days"
            referencedColumns: ["day", "currency"]
          },
          {
            foreignKeyName: "s6_ai_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      s6_ai_settings: {
        Row: {
          currency: string | null
          daily_limit: number | null
          enabled: boolean
          locales: string[]
          model_id: string | null
          pricing_verified_at: string | null
          prompt_version: string
          provider: string | null
          request_ceiling: number | null
          singleton: boolean
        }
        Insert: {
          currency?: string | null
          daily_limit?: number | null
          enabled?: boolean
          locales?: string[]
          model_id?: string | null
          pricing_verified_at?: string | null
          prompt_version?: string
          provider?: string | null
          request_ceiling?: number | null
          singleton?: boolean
        }
        Update: {
          currency?: string | null
          daily_limit?: number | null
          enabled?: boolean
          locales?: string[]
          model_id?: string | null
          pricing_verified_at?: string | null
          prompt_version?: string
          provider?: string | null
          request_ceiling?: number | null
          singleton?: boolean
        }
        Relationships: []
      }
      s7_runs: {
        Row: {
          business_key: string
          created_at: string
          digest_id: string | null
          id: string
          outcome: string
          rule_snapshot: Json
          scheduled_at: string
          user_id: string
        }
        Insert: {
          business_key: string
          created_at?: string
          digest_id?: string | null
          id?: string
          outcome: string
          rule_snapshot: Json
          scheduled_at: string
          user_id: string
        }
        Update: {
          business_key?: string
          created_at?: string
          digest_id?: string | null
          id?: string
          outcome?: string
          rule_snapshot?: Json
          scheduled_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "s7_run_digest_owner"
            columns: ["digest_id", "user_id"]
            isOneToOne: false
            referencedRelation: "digests"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "s7_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      s7_seen: {
        Row: {
          fingerprint: string
          occurrence_id: string
          user_id: string
        }
        Insert: {
          fingerprint: string
          occurrence_id: string
          user_id: string
        }
        Update: {
          fingerprint?: string
          occurrence_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "s7_seen_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s7_seen_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      s8_alerts: {
        Row: {
          before_snapshot: Json | null
          business_key: string
          created_at: string
          digest_id: string | null
          expires_at: string
          id: string
          kind: string
          lead_minutes: number | null
          occurrence_id: string
          preference_revision: number
          revision: number
          run_at: string
          saved_epoch: string
          snapshot: Json
          status: string
          user_id: string
        }
        Insert: {
          before_snapshot?: Json | null
          business_key: string
          created_at?: string
          digest_id?: string | null
          expires_at: string
          id?: string
          kind: string
          lead_minutes?: number | null
          occurrence_id: string
          preference_revision?: number
          revision: number
          run_at: string
          saved_epoch: string
          snapshot: Json
          status?: string
          user_id: string
        }
        Update: {
          before_snapshot?: Json | null
          business_key?: string
          created_at?: string
          digest_id?: string | null
          expires_at?: string
          id?: string
          kind?: string
          lead_minutes?: number | null
          occurrence_id?: string
          preference_revision?: number
          revision?: number
          run_at?: string
          saved_epoch?: string
          snapshot?: Json
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "s8_alerts_digest_id_user_id_fkey"
            columns: ["digest_id", "user_id"]
            isOneToOne: false
            referencedRelation: "digests"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "s8_alerts_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s8_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      s8_correction_log: {
        Row: {
          created_at: string
          id: string
          occurrence_id: string | null
          patch: Json
          reason: string
        }
        Insert: {
          created_at?: string
          id?: string
          occurrence_id?: string | null
          patch: Json
          reason: string
        }
        Update: {
          created_at?: string
          id?: string
          occurrence_id?: string | null
          patch?: Json
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "s8_correction_log_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      s8_corrections: {
        Row: {
          occurrence_id: string
          patch: Json
          reason: string
          updated_at: string
        }
        Insert: {
          occurrence_id: string
          patch: Json
          reason: string
          updated_at?: string
        }
        Update: {
          occurrence_id?: string
          patch?: Json
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "s8_corrections_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: true
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      s8_state: {
        Row: {
          occurrence_id: string
          revision: number
          snapshot: Json
        }
        Insert: {
          occurrence_id: string
          revision?: number
          snapshot: Json
        }
        Update: {
          occurrence_id?: string
          revision?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "s8_state_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: true
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_events: {
        Row: {
          created_at: string
          occurrence_id: string
          reminder_epoch: string
          reminder_minutes: number[]
          reminder_quiet: Json | null
          reminder_revision: number
          reminder_timezone: string
          updates_enabled: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          occurrence_id: string
          reminder_epoch?: string
          reminder_minutes?: number[]
          reminder_quiet?: Json | null
          reminder_revision?: number
          reminder_timezone?: string
          updates_enabled?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          occurrence_id?: string
          reminder_epoch?: string
          reminder_minutes?: number[]
          reminder_quiet?: Json | null
          reminder_revision?: number
          reminder_timezone?: string
          updates_enabled?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_events_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      source_poll_state: {
        Row: {
          failures: number
          last_error_code: string | null
          lease_until: string | null
          next_poll_at: string
          source_id: string
          token: string | null
        }
        Insert: {
          failures?: number
          last_error_code?: string | null
          lease_until?: string | null
          next_poll_at?: string
          source_id: string
          token?: string | null
        }
        Update: {
          failures?: number
          last_error_code?: string | null
          lease_until?: string | null
          next_poll_at?: string
          source_id?: string
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_poll_state_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_records: {
        Row: {
          canonical_url: string
          external_id: string
          fetched_at: string
          id: string
          payload_hash: string
          raw_payload: Json | null
          series_key: string | null
          source_id: string
        }
        Insert: {
          canonical_url: string
          external_id: string
          fetched_at: string
          id?: string
          payload_hash: string
          raw_payload?: Json | null
          series_key?: string | null
          source_id: string
        }
        Update: {
          canonical_url?: string
          external_id?: string
          fetched_at?: string
          id?: string
          payload_hash?: string
          raw_payload?: Json | null
          series_key?: string | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_records_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          acquisition: string
          allow_cache: boolean
          allow_images: boolean
          allow_translate: boolean
          code: string | null
          coverage_note: string | null
          freshness_seconds: number
          id: string
          is_demo: boolean
          last_success_at: string | null
          name: string
          poll_interval_seconds: number | null
          rights_reference: string | null
          terms_status: string
          url: string
        }
        Insert: {
          acquisition: string
          allow_cache?: boolean
          allow_images?: boolean
          allow_translate?: boolean
          code?: string | null
          coverage_note?: string | null
          freshness_seconds?: number
          id?: string
          is_demo?: boolean
          last_success_at?: string | null
          name: string
          poll_interval_seconds?: number | null
          rights_reference?: string | null
          terms_status?: string
          url: string
        }
        Update: {
          acquisition?: string
          allow_cache?: boolean
          allow_images?: boolean
          allow_translate?: boolean
          code?: string | null
          coverage_note?: string | null
          freshness_seconds?: number
          id?: string
          is_demo?: boolean
          last_success_at?: string | null
          name?: string
          poll_interval_seconds?: number | null
          rights_reference?: string | null
          terms_status?: string
          url?: string
        }
        Relationships: []
      }
      territories: {
        Row: {
          boundary: unknown | null
          center: unknown | null
          country_code: string
          external_id: string
          id: string
          is_demo: boolean
          kind: string
          names: Json
          parent_id: string | null
          provenance: string
        }
        Insert: {
          boundary?: unknown | null
          center?: unknown | null
          country_code: string
          external_id: string
          id?: string
          is_demo?: boolean
          kind: string
          names: Json
          parent_id?: string | null
          provenance: string
        }
        Update: {
          boundary?: unknown | null
          center?: unknown | null
          country_code?: string
          external_id?: string
          id?: string
          is_demo?: boolean
          kind?: string
          names?: Json
          parent_id?: string | null
          provenance?: string
        }
        Relationships: [
          {
            foreignKeyName: "territories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      timezone_names: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      translations: {
        Row: {
          description: string | null
          event_id: string
          input_hash: string | null
          locale: string
          model_id: string | null
          prompt_version: string | null
          provider: string
          status: string
          summary: string | null
          title: string | null
          version: number
        }
        Insert: {
          description?: string | null
          event_id: string
          input_hash?: string | null
          locale: string
          model_id?: string | null
          prompt_version?: string | null
          provider: string
          status: string
          summary?: string | null
          title?: string | null
          version: number
        }
        Update: {
          description?: string | null
          event_id?: string
          input_hash?: string | null
          locale?: string
          model_id?: string | null
          prompt_version?: string | null
          provider?: string
          status?: string
          summary?: string | null
          title?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "translations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_s6_ai: {
        Args: { claim_token: string; selected_request: string }
        Returns: Json
      }
      begin_s7_delivery: {
        Args: { claim: string; device: string; selected_job: string }
        Returns: Json
      }
      build_rule_digest: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      build_s3_digest: {
        Args: { selected_rule: string }
        Returns: string
      }
      claim_s3_notification: {
        Args: { job_transport: string; selected_job?: string }
        Returns: {
          attempts: number
          business_key: string
          claim_token: string | null
          digest_id: string | null
          error_code: string | null
          expires_at: string | null
          id: string
          lease_until: string | null
          rule_snapshot: Json | null
          run_at: string
          s8_alert_id: string | null
          status: string
          transport: string
          user_id: string
          workflow: string
        }[]
      }
      claim_s6_source: {
        Args: { force_poll?: boolean; source_code: string }
        Returns: string
      }
      claim_s7_notification: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      correct_s8_occurrence: {
        Args: { patch: Json; reason: string; selected_occurrence: string }
        Returns: undefined
      }
      delete_my_account: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      fail_s6_source: {
        Args: { claim_token: string; error_code: string; source_code: string }
        Returns: undefined
      }
      finish_s6_ai: {
        Args: {
          actual_cost?: number
          claim_token: string
          outcome: string
          result?: Json
          selected_request: string
        }
        Returns: string
      }
      finish_s7_delivery: {
        Args: {
          claim: string
          error?: string
          result: string
          selected_delivery: string
          ticket?: string
        }
        Returns: boolean
      }
      finish_s7_notification: {
        Args: { claim: string; selected_job: string }
        Returns: boolean
      }
      finish_s7_receipt: {
        Args: { error?: string; result: string; selected_delivery: string }
        Returns: boolean
      }
      ingest_madrid: {
        Args: { batch: Json; fetched_at: string }
        Returns: number
      }
      ingest_s6_source: {
        Args: {
          batch: Json
          claim_token: string
          fetched_at: string
          metrics: Json
          source_code: string
        }
        Returns: number
      }
      list_rule_events: {
        Args: { page_offset?: number; selected_rule?: string }
        Returns: {
          category_code: string
          checked_at: string
          event_id: string
          id: string
          local_date: string
          matched_rules: string[]
          start_at: string
          time_kind: string
          timezone: string
          title: string
          venue: string
        }[]
      }
      list_s3_events: {
        Args: { category_codes?: string[]; page_offset?: number }
        Returns: {
          category_code: string
          checked_at: string
          event_id: string
          id: string
          local_date: string
          start_at: string
          time_kind: string
          timezone: string
          title: string
          venue: string
        }[]
      }
      list_s5_events: {
        Args: {
          page_offset?: number
          page_size?: number
          search_text?: string
          view_mode?: string
        }
        Returns: Json
      }
      register_push_device: {
        Args: { device_platform: string; expo_token: string }
        Returns: undefined
      }
      release_s6_ai: {
        Args: { claim_token: string; selected_request: string }
        Returns: boolean
      }
      reserve_s6_ai: {
        Args: { selected_event: string; selected_locale: string }
        Returns: Json
      }
      run_s7_scheduler: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      run_s8_scheduler: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      s4_area_matches: {
        Args: {
          a: Database["public"]["Tables"]["rule_areas"]["Row"]
          e: Database["public"]["Tables"]["events"]["Row"]
        }
        Returns: boolean
      }
      s4_matches: {
        Args: { selected_rule?: string }
        Returns: {
          occurrence_id: string
          rule_id: string
        }[]
      }
      s5_event_coordinates: {
        Args: { occurrence: string }
        Returns: Json
      }
      s6_ai_input_hash: {
        Args: { description: string; title: string }
        Returns: string
      }
      s6_ai_translation_current: {
        Args: {
          selected_event: string
          selected_hash: string
          selected_locale: string
          selected_model: string
          selected_prompt: string
          selected_provider: string
          selected_version: number
        }
        Returns: boolean
      }
      s6_source_coverage: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      s6_translation: {
        Args: { selected_event: string; selected_locale: string }
        Returns: Json
      }
      s7_digest_push_allowed: {
        Args: { j: Database["public"]["Tables"]["notification_jobs"]["Row"] }
        Returns: Json
      }
      s7_horizon_bounds: {
        Args: { h: Json; today: string }
        Returns: {
          hi: string
          lo: string
        }[]
      }
      s7_local_instant: {
        Args: { local_value: string; zone: string }
        Returns: string
      }
      s7_matches: {
        Args: {
          matching_clock: string
          selected_owner: string
          selected_rules: string[]
        }
        Returns: {
          occurrence_id: string
          rule_id: string
        }[]
      }
      s7_next_run: {
        Args: { after_time: string; d: Json; zone: string }
        Returns: string
      }
      s7_push_allowed: {
        Args: { j: Database["public"]["Tables"]["notification_jobs"]["Row"] }
        Returns: Json
      }
      s7_quiet_until: {
        Args: { clock_time: string; q: Json; zone: string }
        Returns: string
      }
      s8_availability: {
        Args: { selected_occurrence: string }
        Returns: string
      }
      s8_collect: {
        Args: { selected_occurrence: string }
        Returns: undefined
      }
      s8_manual_correction: {
        Args: { selected_occurrence: string }
        Returns: boolean
      }
      s8_snapshot: {
        Args: { selected_occurrence: string }
        Returns: Json
      }
      s8_sync_reminders: {
        Args: { selected_occurrence: string; selected_owner: string }
        Returns: undefined
      }
      save_s3_rule: {
        Args: { category_codes: string[] }
        Returns: string
      }
      save_s4_rule: {
        Args: { rule_document: Json; selected_rule?: string }
        Returns: string
      }
      save_s5_rule: {
        Args: {
          delivery_preferences: Json
          rule_document: Json
          selected_rule?: string
        }
        Returns: string
      }
      save_s7_rule: {
        Args: {
          delivery_preferences: Json
          rule_document: Json
          selected_rule?: string
        }
        Returns: string
      }
      set_s4_rule_enabled: {
        Args: { rule_enabled: boolean; selected_rule: string }
        Returns: undefined
      }
      set_s5_delivery_preferences: {
        Args: {
          delivery_preferences: Json
          rule_timezone: string
          selected_rule: string
        }
        Returns: undefined
      }
      set_s7_delivery_preferences: {
        Args: {
          delivery_preferences: Json
          rule_timezone: string
          selected_rule: string
        }
        Returns: undefined
      }
      set_s8_saved_preferences: {
        Args: {
          leads: number[]
          quiet?: Json
          selected_occurrence: string
          updates: boolean
          zone: string
        }
        Returns: undefined
      }
      valid_timezone: {
        Args: { value: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

