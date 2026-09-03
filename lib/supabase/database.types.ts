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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_errors: {
        Row: {
          actor_id: string | null
          business_id: string | null
          created_at: string
          digest: string | null
          id: number
          message: string
          route: string
          stack: string | null
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          business_id?: string | null
          created_at?: string
          digest?: string | null
          id?: never
          message: string
          route: string
          stack?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          business_id?: string | null
          created_at?: string
          digest?: string | null
          id?: never
          message?: string
          route?: string
          stack?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_errors_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_errors_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          business_id: string
          created_at: string
          details: Json | null
          entity: string | null
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string
          business_id: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          business_id?: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_counters: {
        Row: {
          business_id: string
          next_folio: number
        }
        Insert: {
          business_id: string
          next_folio?: number
        }
        Update: {
          business_id?: string
          next_folio?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_counters_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          is_active: boolean
          role: Database["public"]["Enums"]["business_role"]
          user_id: string
          username: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["business_role"]
          user_id: string
          username?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["business_role"]
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          is_template: boolean
          locale: string
          name: string
          phone: string | null
          plan: string
          receipt_footer: string | null
          receipt_header: string | null
          reviewed_at: string | null
          settings: Json
          signup_source: string
          slug: string
          status: string
          timezone: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_template?: boolean
          locale?: string
          name: string
          phone?: string | null
          plan?: string
          receipt_footer?: string | null
          receipt_header?: string | null
          reviewed_at?: string | null
          settings?: Json
          signup_source?: string
          slug: string
          status?: string
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_template?: boolean
          locale?: string
          name?: string
          phone?: string | null
          plan?: string
          receipt_footer?: string | null
          receipt_header?: string | null
          reviewed_at?: string | null
          settings?: Json
          signup_source?: string
          slug?: string
          status?: string
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string
          id: string
          kind: string
          reason: string
          session_id: string
        }
        Insert: {
          amount: number
          business_id?: string
          created_at?: string
          created_by: string
          id?: string
          kind: string
          reason: string
          session_id: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          reason?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          auto_closed: boolean
          business_id: string
          closed_at: string | null
          closed_by: string | null
          closing_notes: string | null
          count_detail: Json | null
          counted_cash: number | null
          difference: number | null
          expected_cash: number | null
          id: string
          next_float: number | null
          opened_at: string
          opened_by: string
          opening_float: number
          opening_notes: string | null
          status: string
        }
        Insert: {
          auto_closed?: boolean
          business_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          count_detail?: Json | null
          counted_cash?: number | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          next_float?: number | null
          opened_at?: string
          opened_by: string
          opening_float: number
          opening_notes?: string | null
          status?: string
        }
        Update: {
          auto_closed?: boolean
          business_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          count_detail?: Json | null
          counted_cash?: number | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          next_float?: number | null
          opened_at?: string
          opened_by?: string
          opening_float?: number
          opening_notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_businesses: {
        Row: {
          business_id: string
          deleted_at: string
          deleted_by: string | null
          deleted_by_name: string
          id: number
          name: string
          slug: string
          summary: Json
        }
        Insert: {
          business_id: string
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_name?: string
          id?: never
          name: string
          slug: string
          summary?: Json
        }
        Update: {
          business_id?: string
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_name?: string
          id?: never
          name?: string
          slug?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "deleted_businesses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          business_id: string
          cash_movement_id: string | null
          category: string
          created_at: string
          created_by: string
          description: string
          id: string
          paid_with: string | null
          spent_on: string
          updated_at: string
        }
        Insert: {
          amount: number
          business_id?: string
          cash_movement_id?: string | null
          category: string
          created_at?: string
          created_by?: string
          description: string
          id?: string
          paid_with?: string | null
          spent_on: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          cash_movement_id?: string | null
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          paid_with?: string | null
          spent_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_cash_movement_id_fkey"
            columns: ["cash_movement_id"]
            isOneToOne: true
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_expenses: {
        Row: {
          business_id: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          monthly_amount: number
          name: string
          updated_at: string
        }
        Insert: {
          business_id?: string
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_amount: number
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_amount?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_customers: {
        Row: {
          business_id: string
          created_at: string
          id: string
          last_visit_at: string | null
          name: string
          phone: string
          rewards_redeemed: number
          stamps: number
          visits: number
        }
        Insert: {
          business_id?: string
          created_at?: string
          id?: string
          last_visit_at?: string | null
          name?: string
          phone: string
          rewards_redeemed?: number
          stamps?: number
          visits?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          last_visit_at?: string | null
          name?: string
          phone?: string
          rewards_redeemed?: number
          stamps?: number
          visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      member_pins: {
        Row: {
          business_id: string
          pin_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          pin_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          pin_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_pins_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: true
            referencedRelation: "business_members"
            referencedColumns: ["business_id", "user_id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          business_id: string
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          note: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id?: string
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_products: {
        Row: {
          business_id: string
          category_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id?: string
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_products_category_fkey"
            columns: ["category_id", "business_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      menu_variants: {
        Row: {
          business_id: string
          cost: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          price: number
          product_id: string
          size_label: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id?: string
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price: number
          product_id: string
          size_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          product_id?: string
          size_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_variants_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_variants_product_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "menu_products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          is_required: boolean
          max_select: number | null
          min_select: number
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          max_select?: number | null
          min_select?: number
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          max_select?: number | null
          min_select?: number
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      modifiers: {
        Row: {
          business_id: string
          created_at: string
          group_id: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          price_delta: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id?: string
          created_at?: string
          group_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          price_delta?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          group_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          price_delta?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifiers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifiers_group_fkey"
            columns: ["group_id", "business_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      parked_orders: {
        Row: {
          business_id: string
          cart: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          owed_contact: string | null
          owed_since: string | null
          prepared_lines: Json
          updated_at: string
        }
        Insert: {
          business_id?: string
          cart: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          owed_contact?: string | null
          owed_since?: string | null
          prepared_lines?: Json
          updated_at?: string
        }
        Update: {
          business_id?: string
          cart?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          owed_contact?: string | null
          owed_since?: string | null
          prepared_lines?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parked_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parked_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_modifier_groups: {
        Row: {
          business_id: string
          group_id: string
          product_id: string
        }
        Insert: {
          business_id?: string
          group_id: string
          product_id: string
        }
        Update: {
          business_id?: string
          group_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pmg_group_fkey"
            columns: ["group_id", "business_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "pmg_product_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "menu_products"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "product_modifier_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_business_id: string | null
          created_at: string
          full_name: string | null
          id: string
          is_platform_admin: boolean
          updated_at: string
        }
        Insert: {
          active_business_id?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          updated_at?: string
        }
        Update: {
          active_business_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_business_id_fkey"
            columns: ["active_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          business_id: string
          category_id: string | null
          created_at: string
          end_hour: number
          ends_on: string | null
          id: string
          is_active: boolean
          kind: string
          min_ticket: number
          name: string
          scope: string
          start_hour: number
          starts_on: string | null
          updated_at: string
          value: number
          weekdays: number[]
        }
        Insert: {
          business_id?: string
          category_id?: string | null
          created_at?: string
          end_hour: number
          ends_on?: string | null
          id?: string
          is_active?: boolean
          kind: string
          min_ticket?: number
          name: string
          scope: string
          start_hour: number
          starts_on?: string | null
          updated_at?: string
          value: number
          weekdays: number[]
        }
        Update: {
          business_id?: string
          category_id?: string | null
          created_at?: string
          end_hour?: number
          ends_on?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          min_ticket?: number
          name?: string
          scope?: string
          start_hour?: number
          starts_on?: string | null
          updated_at?: string
          value?: number
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_categoria_fkey"
            columns: ["category_id", "business_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      ticket_item_modifiers: {
        Row: {
          business_id: string
          id: string
          modifier_id: string | null
          modifier_name: string
          modifier_price: number
          ticket_item_id: string
        }
        Insert: {
          business_id?: string
          id?: string
          modifier_id?: string | null
          modifier_name: string
          modifier_price?: number
          ticket_item_id: string
        }
        Update: {
          business_id?: string
          id?: string
          modifier_id?: string | null
          modifier_name?: string
          modifier_price?: number
          ticket_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_item_modifiers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_item_modifiers_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "modifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_item_modifiers_ticket_item_id_fkey"
            columns: ["ticket_item_id"]
            isOneToOne: false
            referencedRelation: "ticket_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_items: {
        Row: {
          business_id: string
          id: string
          line_total: number
          notes: string | null
          product_id: string | null
          product_name: string
          quantity: number
          size_label: string | null
          ticket_id: string
          unit_cost: number
          unit_price: number
          variant_id: string | null
          variant_name: string
        }
        Insert: {
          business_id?: string
          id?: string
          line_total: number
          notes?: string | null
          product_id?: string | null
          product_name: string
          quantity: number
          size_label?: string | null
          ticket_id: string
          unit_cost?: number
          unit_price: number
          variant_id?: string | null
          variant_name: string
        }
        Update: {
          business_id?: string
          id?: string
          line_total?: number
          notes?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          size_label?: string | null
          ticket_id?: string
          unit_cost?: number
          unit_price?: number
          variant_id?: string | null
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "menu_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "menu_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cash_received: number | null
          cashier_id: string
          change_due: number | null
          client_ref: string
          created_at: string
          discount_reason: string | null
          discount_total: number
          folio: number
          id: string
          loyalty_customer_id: string | null
          loyalty_delta: number
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          prepared_at: string | null
          promotion_id: string | null
          session_id: string
          status: Database["public"]["Enums"]["ticket_status"]
          subtotal: number
          takeout_fee: number
          tax_total: number
          tip_amount: number
          total: number
        }
        Insert: {
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cash_received?: number | null
          cashier_id: string
          change_due?: number | null
          client_ref: string
          created_at?: string
          discount_reason?: string | null
          discount_total?: number
          folio: number
          id?: string
          loyalty_customer_id?: string | null
          loyalty_delta?: number
          notes?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          prepared_at?: string | null
          promotion_id?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subtotal: number
          takeout_fee?: number
          tax_total?: number
          tip_amount?: number
          total: number
        }
        Update: {
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cash_received?: number | null
          cashier_id?: string
          change_due?: number | null
          client_ref?: string
          created_at?: string
          discount_reason?: string | null
          discount_total?: number
          folio?: number
          id?: string
          loyalty_customer_id?: string | null
          loyalty_delta?: number
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          prepared_at?: string | null
          promotion_id?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subtotal?: number
          takeout_fee?: number
          tax_total?: number
          tip_amount?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "tickets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_loyalty_customer_id_fkey"
            columns: ["loyalty_customer_id"]
            isOneToOne: false
            referencedRelation: "loyalty_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_cash_movement: {
        Args: { p_amount: number; p_kind: string; p_reason: string }
        Returns: Json
      }
      admin_set_member_pin: {
        Args: { p_pin?: string; p_user_id: string }
        Returns: undefined
      }
      business_day: { Args: { ts: string; tz: string }; Returns: string }
      cancel_ticket: {
        Args: { p_reason: string; p_ticket_id: string }
        Returns: Json
      }
      cash_session_summary: { Args: { p_session_id: string }; Returns: Json }
      clone_menu: {
        Args: { p_source: string; p_target: string }
        Returns: Json
      }
      close_cash_session: {
        Args: {
          p_count_detail?: Json
          p_counted_cash: number
          p_next_float?: number
          p_notes?: string
        }
        Returns: Json
      }
      create_product_guided: { Args: { p: Json }; Returns: Json }
      create_ticket: {
        Args: {
          p_captured_at?: string
          p_cash_received?: number
          p_client_ref: string
          p_discount?: Json
          p_items: Json
          p_loyalty_customer?: string
          p_loyalty_redeem?: boolean
          p_notes?: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_takeout?: boolean
          p_tip?: number
        }
        Returns: Json
      }
      current_business_id: { Args: never; Returns: string }
      current_member_role: {
        Args: never
        Returns: Database["public"]["Enums"]["business_role"]
      }
      delete_business: {
        Args: {
          p_actor?: string
          p_actor_name?: string
          p_business_id: string
          p_slug: string
        }
        Returns: Json
      }
      derive_uuid: { Args: { p_key: string; p_ns: string }; Returns: string }
      find_user_id_by_email: { Args: { p_email: string }; Returns: string }
      force_close_cash_session: {
        Args: { p_deadline: string; p_reason: string; p_session_id: string }
        Returns: Json
      }
      forgive_owed: { Args: { p_id: string; p_reason: string }; Returns: Json }
      install_menu_pack: { Args: { p_pack: Json }; Returns: Json }
      log_audit: {
        Args: { p_action: string; p_details?: Json; p_entity?: string }
        Returns: undefined
      }
      loyalty_adjust: {
        Args: { p_customer: string; p_delta: number; p_reason: string }
        Returns: Json
      }
      loyalty_find_or_create: {
        Args: { p_name?: string; p_phone: string }
        Returns: Json
      }
      margin_report: { Args: { p_from: string; p_to: string }; Returns: Json }
      member_ctx: {
        Args: never
        Returns: {
          business_id: string
          is_template: boolean
          member_role: Database["public"]["Enums"]["business_role"]
          timezone: string
          user_id: string
        }[]
      }
      my_context: { Args: never; Returns: Json }
      my_pin_set: { Args: never; Returns: boolean }
      open_cash_session: {
        Args: { p_notes?: string; p_opening_float: number }
        Returns: Json
      }
      platform_overview: { Args: never; Returns: Json }
      profit_report: { Args: { p_month?: string }; Returns: Json }
      promo_best: {
        Args: { p_biz: string; p_items: Json; p_tz: string; p_when: string }
        Returns: {
          discount: number
          id: string
          name: string
        }[]
      }
      promo_preview: { Args: { p_items: Json }; Returns: Json }
      promotions_report: { Args: { p_days?: number }; Returns: Json }
      public_menu: { Args: { p_slug: string }; Returns: Json }
      public_receipt: { Args: { p_ticket: string }; Returns: Json }
      report_error: {
        Args: {
          p_digest?: string
          p_message: string
          p_route: string
          p_stack?: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      sales_insights: { Args: { p_from: string; p_to: string }; Returns: Json }
      sales_report: {
        Args: {
          p_cashier?: string
          p_from: string
          p_method?: Database["public"]["Enums"]["payment_method"]
          p_to: string
        }
        Returns: Json
      }
      set_active_business: { Args: { p_business_id: string }; Returns: Json }
      set_my_pin: { Args: { p_pin: string }; Returns: undefined }
      set_ticket_prepared: {
        Args: { p_prepared?: boolean; p_ticket_id: string }
        Returns: string
      }
      ticket_lines: {
        Args: { p_biz: string; p_items: Json }
        Returns: {
          category_id: string
          idx: number
          line_total: number
          modifier_ids: Json
          notes: string
          product_id: string
          product_name: string
          quantity: number
          size_label: string
          unit_cost: number
          unit_price: number
          variant_id: string
          variant_name: string
        }[]
      }
      top_variants: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          qty: number
          variant_id: string
        }[]
      }
      verify_my_pin: { Args: { p_pin: string }; Returns: boolean }
      weekly_summary: {
        Args: { p_business_id: string; p_from: string; p_to: string }
        Returns: Json
      }
    }
    Enums: {
      business_role: "owner" | "admin" | "cajero"
      payment_method: "efectivo" | "transferencia" | "tarjeta_clip"
      ticket_status: "completado" | "cancelado"
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
      business_role: ["owner", "admin", "cajero"],
      payment_method: ["efectivo", "transferencia", "tarjeta_clip"],
      ticket_status: ["completado", "cancelado"],
    },
  },
} as const

