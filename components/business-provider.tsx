"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { AppContext, BusinessInfo } from "@/lib/context-shape"

const Ctx = createContext<AppContext | null>(null)

/** Expone el contexto de sesión (negocio activo, rol, membresías) a los client components. */
export function BusinessProvider({ value, children }: { value: AppContext; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppContext(): AppContext {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error("useAppContext debe usarse dentro de <BusinessProvider>.")
  }
  return ctx
}

/** Negocio activo. Solo para árboles donde la página o el layout ya garantizó que existe (/pos, /admin). */
export function useBusiness(): BusinessInfo {
  const ctx = useAppContext()
  if (!ctx.business) {
    throw new Error("No hay negocio activo en el contexto.")
  }
  return ctx.business
}
