import { cn } from "@/lib/utils"

/**
 * Pista de atajo de teclado. Solo se muestra en dispositivos con puntero
 * fino (mouse/trackpad): en tablet o celular sería ruido.
 */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "hidden [@media(hover:hover)_and_(pointer:fine)]:inline-flex items-center justify-center",
        "h-4 min-w-[1.1rem] rounded border border-current/25 bg-white/60 px-1 font-mono text-[10px] font-semibold leading-none opacity-70",
        className,
      )}
    >
      {children}
    </kbd>
  )
}
