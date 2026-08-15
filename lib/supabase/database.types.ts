// Generado desde el proyecto Supabase (cafeteriacodex) tras la migración
// fase3_modificadores_descuentos. Regenerar con el MCP de Supabase (generate_typescript_types)
// o `supabase gen types typescript` después de cada migración.
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
      cash_sessions: {
        Row: {
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
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      menu_products: {
        Row: {
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
            foreignKeyName: "menu_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_variants: {
        Row: {
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
            foreignKeyName: "menu_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "menu_products"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
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
        Relationships: []
      }
      modifiers: {
        Row: {
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
            foreignKeyName: "modifiers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      product_modifier_groups: {
        Row: {
          group_id: string
          product_id: string
        }
        Insert: {
          group_id: string
          product_id: string
        }
        Update: {
          group_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_modifier_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_modifier_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "menu_products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      ticket_item_modifiers: {
        Row: {
          id: string
          modifier_id: string | null
          modifier_name: string
          modifier_price: number
          ticket_item_id: string
        }
        Insert: {
          id?: string
          modifier_id?: string | null
          modifier_name: string
          modifier_price?: number
          ticket_item_id: string
        }
        Update: {
          id?: string
          modifier_id?: string | null
          modifier_name?: string
          modifier_price?: number
          ticket_item_id?: string
        }
        Relationships: [
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
          folio?: never
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
          folio?: never
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
      business_day: { Args: { ts: string }; Returns: string }
      cancel_ticket: {
        Args: { p_reason: string; p_ticket_id: string }
        Returns: Json
      }
      cash_session_summary: { Args: { p_session_id: string }; Returns: Json }
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
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
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
    }
    Enums: {
      app_role: "admin" | "cajero"
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
      payment_method: ["efectivo", "transferencia", "tarjeta_clip"],
      ticket_status: ["completado", "cancelado"],
    },
  },
} as const
