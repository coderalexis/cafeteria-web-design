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
          slug: string
          status: string
          timezone: string
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
          slug: string
          status?: string
          timezone?: string
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
          slug?: string
          status?: string
          timezone?: string
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
          business_id: string
          closed_at: string | null
          closed_by: string | null
          closing_notes: string | null
          counted_cash: number | null
          difference: number | null
          expected_cash: number | null
          id: string
          opened_at: string
          opened_by: string
          opening_float: number
          opening_notes: string | null
          status: string
        }
        Insert: {
          business_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          counted_cash?: number | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          opened_at?: string
          opened_by: string
          opening_float: number
          opening_notes?: string | null
          status?: string
        }
        Update: {
          business_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          counted_cash?: number | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
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
      menu_categories: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
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
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          username: string | null
        }
        Insert: {
          active_business_id?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          active_business_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          username?: string | null
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
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          session_id: string
          status: Database["public"]["Enums"]["ticket_status"]
          subtotal: number
          tax_total: number
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
          notes?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          session_id: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subtotal: number
          tax_total?: number
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
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          session_id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subtotal?: number
          tax_total?: number
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
        Args: { p_counted_cash: number; p_notes?: string }
        Returns: Json
      }
      create_ticket: {
        Args: {
          p_cash_received?: number
          p_client_ref: string
          p_discount?: Json
          p_items: Json
          p_notes?: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
        }
        Returns: Json
      }
      current_business_id: { Args: never; Returns: string }
      current_member_role: {
        Args: never
        Returns: Database["public"]["Enums"]["business_role"]
      }
      derive_uuid: { Args: { p_key: string; p_ns: string }; Returns: string }
      find_user_id_by_email: { Args: { p_email: string }; Returns: string }
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
      open_cash_session: {
        Args: { p_notes?: string; p_opening_float: number }
        Returns: Json
      }
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
    }
    Enums: {
      app_role: "admin" | "cajero"
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
      app_role: ["admin", "cajero"],
      business_role: ["owner", "admin", "cajero"],
      payment_method: ["efectivo", "transferencia", "tarjeta_clip"],
      ticket_status: ["completado", "cancelado"],
    },
  },
} as const
