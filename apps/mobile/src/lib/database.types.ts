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
          error_code: string | null
          id: string
          job_id: string
          receipt_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          device_token_id?: string | null
          error_code?: string | null
          id?: string
          job_id: string
          receipt_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          device_token_id?: string | null
          error_code?: string | null
          id?: string
          job_id?: string
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
          occurrence_id: string
          user_id: string
        }
        Insert: {
          digest_id: string
          occurrence_id: string
          user_id: string
        }
        Update: {
          digest_id?: string
          occurrence_id?: string
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
          digest_id: string | null
          id: string
          lease_until: string | null
          run_at: string
          status: string
          transport: string
          user_id: string
        }
        Insert: {
          attempts?: number
          business_key: string
          digest_id?: string | null
          id?: string
          lease_until?: string | null
          run_at: string
          status?: string
          transport?: string
          user_id: string
        }
        Update: {
          attempts?: number
          business_key?: string
          digest_id?: string | null
          id?: string
          lease_until?: string | null
          run_at?: string
          status?: string
          transport?: string
          user_id?: string
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
          id: string
          kind: string
          parameters: Json
          rule_id: string
          territory_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          kind: string
          parameters?: Json
          rule_id: string
          territory_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          parameters?: Json
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
      saved_events: {
        Row: {
          created_at: string
          occurrence_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          occurrence_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          occurrence_id?: string
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
      source_records: {
        Row: {
          canonical_url: string
          external_id: string
          fetched_at: string
          id: string
          payload_hash: string
          raw_payload: Json | null
          source_id: string
        }
        Insert: {
          canonical_url: string
          external_id: string
          fetched_at: string
          id?: string
          payload_hash: string
          raw_payload?: Json | null
          source_id: string
        }
        Update: {
          canonical_url?: string
          external_id?: string
          fetched_at?: string
          id?: string
          payload_hash?: string
          raw_payload?: Json | null
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
      translations: {
        Row: {
          description: string | null
          event_id: string
          locale: string
          provider: string
          status: string
          title: string | null
          version: number
        }
        Insert: {
          description?: string | null
          event_id: string
          locale: string
          provider: string
          status: string
          title?: string | null
          version: number
        }
        Update: {
          description?: string | null
          event_id?: string
          locale?: string
          provider?: string
          status?: string
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
      build_s3_digest: {
        Args: { selected_rule: string }
        Returns: string
      }
      claim_s3_notification: {
        Args: { job_transport: string; selected_job?: string }
        Returns: {
          attempts: number
          business_key: string
          digest_id: string | null
          id: string
          lease_until: string | null
          run_at: string
          status: string
          transport: string
          user_id: string
        }[]
      }
      delete_my_account: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      ingest_madrid: {
        Args: { batch: Json; fetched_at: string }
        Returns: number
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
      register_push_device: {
        Args: { device_platform: string; expo_token: string }
        Returns: undefined
      }
      save_s3_rule: {
        Args: { category_codes: string[] }
        Returns: string
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

