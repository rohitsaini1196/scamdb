export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EntityType = "phone" | "upi";

export type ReportCategory =
  | "financial_fraud"
  | "impersonation"
  | "lottery_scam"
  | "job_scam"
  | "investment_fraud"
  | "romance_scam"
  | "phishing"
  | "fake_customer_support"
  | "other";

export type Platform =
  | "whatsapp"
  | "phone_call"
  | "sms"
  | "telegram"
  | "instagram"
  | "facebook"
  | "email"
  | "upi_app"
  | "other";

export type ReportStatus = "pending" | "approved" | "rejected" | "hidden";

export type SourceType =
  | "manual"
  | "reddit"
  | "twitter"
  | "facebook"
  | "police_advisory"
  | "news"
  | "telegram"
  | "other";

export type SourceConfidence = "low" | "medium" | "high";

export type ModerationAction =
  | "approved"
  | "rejected"
  | "hidden"
  | "merge"
  | "note";

export type Database = {
  public: {
    Tables: {
      entities: {
        Row: {
          id: string;
          type: EntityType;
          normalized_value: string;
          display_value: string;
          report_count: number;
          last_reported_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: EntityType;
          normalized_value: string;
          display_value: string;
          report_count?: number;
          last_reported_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: EntityType;
          normalized_value?: string;
          display_value?: string;
          report_count?: number;
          last_reported_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          entity_id: string;
          category: ReportCategory;
          platform: Platform;
          description: string;
          amount_lost: number | null;
          evidence_urls: string[];
          status: ReportStatus;
          created_by: string;
          created_at: string;
          source_type: SourceType;
          source_url: string | null;
          source_confidence: SourceConfidence;
          captured_at: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          category: ReportCategory;
          platform: Platform;
          description: string;
          amount_lost?: number | null;
          evidence_urls?: string[];
          status?: ReportStatus;
          created_by: string;
          created_at?: string;
          source_type?: SourceType;
          source_url?: string | null;
          source_confidence?: SourceConfidence;
          captured_at?: string | null;
        };
        Update: {
          id?: string;
          entity_id?: string;
          category?: ReportCategory;
          platform?: Platform;
          description?: string;
          amount_lost?: number | null;
          evidence_urls?: string[];
          status?: ReportStatus;
          created_by?: string;
          created_at?: string;
          source_type?: SourceType;
          source_url?: string | null;
          source_confidence?: SourceConfidence;
          captured_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reports_entity_id_fkey";
            columns: ["entity_id"];
            referencedRelation: "entities";
            referencedColumns: ["id"];
          }
        ];
      };
      moderation_actions: {
        Row: {
          id: string;
          report_id: string;
          action: ModerationAction;
          moderator_id: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          report_id: string;
          action: ModerationAction;
          moderator_id: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          report_id?: string;
          action?: ModerationAction;
          moderator_id?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_actions_report_id_fkey";
            columns: ["report_id"];
            referencedRelation: "reports";
            referencedColumns: ["id"];
          }
        ];
      };
      user_trust: {
        Row: {
          user_id: string;
          approved_report_count: number;
          is_trusted: boolean;
          is_moderator: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          approved_report_count?: number;
          is_trusted?: boolean;
          is_moderator?: boolean;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          approved_report_count?: number;
          is_trusted?: boolean;
          is_moderator?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      raw_signals: {
        Row: {
          id: string;
          source_type: string;
          source_url: string | null;
          title: string | null;
          content: string;
          author: string | null;
          author_score: number;
          screenshot_urls: string[];
          captured_at: string;
          status: string;
          processed_at: string | null;
          error: string | null;
        };
        Insert: {
          id?: string;
          source_type: string;
          source_url?: string | null;
          title?: string | null;
          content: string;
          author?: string | null;
          author_score?: number;
          screenshot_urls?: string[];
          captured_at?: string;
          status?: string;
          processed_at?: string | null;
          error?: string | null;
        };
        Update: {
          id?: string;
          source_type?: string;
          source_url?: string | null;
          title?: string | null;
          content?: string;
          author?: string | null;
          author_score?: number;
          screenshot_urls?: string[];
          captured_at?: string;
          status?: string;
          processed_at?: string | null;
          error?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      entity_summary: {
        Row: {
          id: string;
          type: EntityType;
          normalized_value: string;
          display_value: string;
          report_count: number;
          last_reported_at: string | null;
          categories: ReportCategory[];
          evidence_count: number;
          confidence_score: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// App-level types
export type EntitySummary = {
  id: string;
  type: EntityType;
  normalized_value: string;
  display_value: string;
  report_count: number;
  last_reported_at: string | null;
  categories: ReportCategory[];
  evidence_count: number;
  confidence_score: number;
};

export type EntityRow = Database["public"]["Tables"]["entities"]["Row"];
export type ReportRow = Database["public"]["Tables"]["reports"]["Row"];
export type ModerationActionRow = Database["public"]["Tables"]["moderation_actions"]["Row"];
export type UserTrustRow = Database["public"]["Tables"]["user_trust"]["Row"];

export type ReportWithEntity = ReportRow & {
  entities: EntityRow | null;
};
