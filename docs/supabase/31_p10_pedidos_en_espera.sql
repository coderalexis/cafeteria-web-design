-- ============================================================
--  P10 · Pedidos en espera compartidos (cuentas abiertas)
-- ============================================================
--
-- Vivían en el navegador de cada dispositivo. El razonamiento original era
-- correcto a medias: un pedido en espera NO es una venta, así que no puede ir
-- en `tickets` —recibiría folio, contaría en reportes y descuadraría el
-- corte—. Pero de ahí no se sigue que no vaya en la base: le faltaba tabla
-- propia.
--
-- El costo de aquella decisión era real y no solo futuro: guardado en el
-- navegador, un pedido se pierde al borrar datos, en modo incógnito, o si el
-- teléfono libera espacio. Perder la cuenta de una mesa a media mañana no
-- tiene recuperación. Y con dos aparatos, tomar el pedido en el celular
-- impedía cobrarlo en la tablet.
--
-- Escrituras directas con RLS (no por RPC) a propósito: aquí no hay dinero.
-- La regla de «solo por función» existe para `tickets`, donde una escritura
-- mal hecha mueve folios y cortes. Esto es un carrito guardado.
--
-- Aplicada el 2026-08-30 como `p10_pedidos_en_espera_compartidos`.

create table public.parked_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses on delete cascade,
  name text not null default '',
  cart jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.parked_orders is
  'Pedidos tomados pero NO cobrados (cuentas abiertas). No son ventas: nada llega a tickets hasta cobrar.';

create index parked_orders_business_idx on public.parked_orders (business_id, created_at);

alter table public.parked_orders enable row level security;

create policy parked_select on public.parked_orders for select to authenticated
  using (business_id = (select public.current_business_id()));
create policy parked_insert on public.parked_orders for insert to authenticated
  with check (business_id = (select public.current_business_id()));
create policy parked_update on public.parked_orders for update to authenticated
  using (business_id = (select public.current_business_id()))
  with check (business_id = (select public.current_business_id()));
create policy parked_delete on public.parked_orders for delete to authenticated
  using (business_id = (select public.current_business_id()));

revoke all on public.parked_orders from anon;
grant select, insert, update, delete on public.parked_orders to authenticated;
