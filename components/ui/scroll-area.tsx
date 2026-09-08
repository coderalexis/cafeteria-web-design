'use client'

import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'

import { cn } from '@/lib/utils'

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    /* Columna flexible, y el visor de abajo es su único hijo que crece: así el
       visor mide lo que mide ESTA caja, venga su alto de un `flex-1` o de un
       `max-h`. Antes el visor pedía el 100 % del padre, y un porcentaje contra
       un padre sin alto fijo —lo normal dentro de un diálogo, que solo tiene
       máximo— no se resuelve: el visor crecía hasta su contenido, el marco lo
       recortaba y no quedaba NADA que desplazar. Así se quedó la dueña de una
       cafetería sin poder bajar por sus tickets del día. */
    className={cn('relative flex flex-col overflow-hidden', className)}
    {...props}
  >
    {/* [&>div]:!block — Radix envuelve el contenido en un div con
        `display:table` en línea, y una tabla se ANCHA hasta el mínimo de su
        contenido. Basta un nombre largo ("Ensalada César con pollo a la
        parrilla") para que ese div crezca a 506 px dentro de una pantalla de
        390 y se lleve la fila entera fuera de la vista: el truncado nunca
        llega a aplicarse porque nada obliga al ancho. Con `block` el div se
        queda en el 100 % del visor y ahí sí manda el min-w-0 + truncate.
        Lleva ! porque el display de Radix es estilo en línea. Todas nuestras
        listas son verticales, así que no perdemos ningún scroll horizontal. */}
    <ScrollAreaPrimitive.Viewport className="min-h-0 w-full flex-1 rounded-[inherit] [&>div]:!block">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' &&
        'h-full w-2.5 border-l border-l-transparent p-[1px]',
      orientation === 'horizontal' &&
        'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
