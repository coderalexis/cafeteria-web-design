-- 58_p45_insumos.sql — P45 Fase 1.5: el inventario también cuenta insumos
-- (migración: p45_insumos).
--
-- Por qué se rehace lo de la 57 en vez de parchearlo:
--
-- La 57 contaba SOLO lo que está en el menú y se vende tal cual: el panqué que
-- Gym Coffe compra hecho. Al enseñarlo, el hallazgo (2026-09-11): eso es la
-- mitad chica del problema. En Cafecito Jaral nadie se surte de «capuchinos»;
-- se compran café en grano, leche, vasos, tapas, servilletas y azúcar, y con
-- eso se preparan las bebidas. Lo que de verdad se acaba un sábado a media
-- tarde no está en la carta.
--
-- El error de la 57 no fue «sin recetas» —eso sigue en pie, nadie captura
-- gramos por bebida— sino saltar de ahí a «entonces solo se cuenta lo del
-- menú». **Un insumo no necesita receta para contarse.** Necesita que alguien
-- anote lo que llegó, lo que se tiró, y cuente una vez por semana. El valor
-- está en no quedarse sin vasos y en saber cuánto se va en insumos al mes, no
-- en la precisión de un gramo.
--
-- Se rehacen las tablas en vez de migrarlas porque **estaban vacías en los
-- cinco cafés** (comprobado el 2026-09-11: 0 filas en las dos, en toda la
-- base). La 57 está aplicada pero nunca tuvo un dato: su código de pantalla
-- no llegó a producción. Reformar hoy no mueve un solo renglón; esperar a que
-- Gym Coffe cuente su primer panqué lo habría vuelto una migración de datos.
--
-- Qué queda:
--
--   · Una sola lista de «lo que se cuenta», con dos clases de cosas:
--     de REVENTA (ligada a una variante del menú; baja sola con la venta) y
--     de INSUMO (no está en el menú; se cuenta a mano). Las dos comparten
--     entrada, merma, conteo, mínimo, historial y lista de compras.
--   · `qty` pasa a numérico: el café en grano se cuenta en kilos y la leche
--     en litros. Lo ligado al menú se sigue exigiendo entero (no se vende
--     medio panqué).
--   · Dejar de contar ya NO borra la fila: la apaga (`tracked`) y sella desde
--     qué renglón del diario cuenta la cuenta viva (`tracked_seq`). Con eso el
--     diario nunca se queda huérfano y cancelar una venta vieja no inventa
--     piezas.
--
-- Lo que NO se hace, otra vez: descontar por receta, ni siquiera el vaso por
-- bebida. Es 1 a 1 y suena fácil, pero es una receta chica que abre la puerta
-- a las grandes. Conteo semanal y mínimo resuelven el noventa por ciento.

-- ── 1) Los insumos: lo que se compra y NO está en el menú ───────────
create table public.supplies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 80),
  -- Lista corta a propósito, y SIN conversiones entre unidades: se cuenta en
  -- lo que el dueño cuenta. «Compro costales de 5 kg y uso gramos» es por
  -- dónde se mueren estos sistemas.
  unit text not null default 'pieza'
    check (unit in ('pieza', 'paquete', 'caja', 'bolsa', 'kilo', 'litro')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.supplies is
  'Insumos: lo que se compra para preparar (café en grano, vasos, servilletas). No está en el menú y no baja con la venta.';
create unique index supplies_nombre on public.supplies (business_id, lower(btrim(name)));
create index supplies_business on public.supplies (business_id);

-- ── 2) Lo que se cuenta, de las dos clases ──────────────────────────
-- Vacías las dos (ver cabecera): se tiran y se rehacen.
drop table if exists public.stock_movements;
drop table if exists public.stock_items;

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses(id) on delete restrict,
  -- Exactamente una de las dos: o es algo del menú, o es un insumo.
  variant_id uuid references public.menu_variants(id) on delete cascade,
  supply_id uuid references public.supplies(id) on delete cascade,
  -- Puede ser negativo a propósito: nunca se bloquea una venta.
  qty numeric(12,3) not null default 0,
  -- 0 = sin aviso.
  min_qty numeric(12,3) not null default 0 check (min_qty >= 0),
  -- Dejar de contar apaga la fila; no la borra. Así el diario se queda y
  -- volver a contar empieza limpio.
  tracked boolean not null default true,
  -- Desde qué renglón del diario cuenta esta cuenta. Cancelar una venta
  -- ANTERIOR a este sello no devuelve piezas: volver a contar empieza de cero.
  -- Va por seq y no por hora porque now() es igual para toda una transacción:
  -- con una marca de tiempo, vender y volver a contar en el mismo movimiento
  -- se pisan (lo cazó el ensayo, igual que en la 57).
  tracked_seq bigint not null default 0,
  -- Solo para enseñarlo («se cuenta desde…»); NUNCA para decidir.
  tracked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_items_una_cosa check ((variant_id is null) <> (supply_id is null))
);
comment on table public.stock_items is
  'Lo que cada café cuenta: variantes del menú que se revenden e insumos. Solo la escriben los RPC; el diario está en stock_movements.';
create unique index stock_items_variant on public.stock_items (variant_id) where variant_id is not null;
create unique index stock_items_supply on public.stock_items (supply_id) where supply_id is not null;
create index stock_items_business on public.stock_items (business_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  -- El orden REAL. `created_at` no sirve para ordenar un diario: dentro de una
  -- misma transacción `now()` es igual para todos (una venta con dos artículos
  -- contados deja dos renglones con la misma hora), y el ensayo de la 57 lo
  -- cazó: ordenando por hora e id, el saldo no cuadraba.
  seq bigint generated always as identity,
  business_id uuid not null default public.current_business_id()
    references public.businesses(id) on delete restrict,
  item_id uuid not null references public.stock_items(id) on delete cascade,
  -- Texto con check y no enum: un valor nuevo de enum exige su propia
  -- migración, y este catálogo va a crecer.
  kind text not null check (kind in ('entrada', 'venta', 'cancelacion', 'merma', 'conteo')),
  -- El CAMBIO, con signo: +12 entrada, -1 venta, -3 merma, ±n conteo.
  qty numeric(12,3) not null check (qty <> 0),
  -- Lo que quedó. Redundante a propósito: el historial se lee como estado de
  -- cuenta y sirve para notar si alguien tocó `qty` por fuera.
  qty_after numeric(12,3) not null,
  -- Solo en entradas: lo que costó cada pieza (o cada kilo, o cada litro).
  unit_cost numeric(10,2) check (unit_cost is null or unit_cost >= 0),
  -- Merma: por qué. Conteo: nota.
  reason text check (reason is null or length(reason) <= 200),
  -- Venta y cancelación. `set null` porque los tickets solo se borran con la
  -- cafetería entera, y ahí este diario se va antes.
  ticket_id uuid references public.tickets(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.stock_movements is
  'Diario de existencias: cada renglón es un cambio con signo y el saldo que dejó.';
create index stock_movements_item on public.stock_movements (business_id, item_id, seq desc);
create index stock_movements_negocio on public.stock_movements (business_id, seq desc);
create index stock_movements_ticket on public.stock_movements (ticket_id) where ticket_id is not null;

-- ── 3) RLS: se lee dentro del negocio, no se escribe desde el cliente ─
alter table public.supplies enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
-- La cajera necesita VER existencias (la esquina «quedan 3» del POS y la
-- lista de insumos para anotar lo que llega).
create policy supplies_select on public.supplies for select to authenticated
  using (business_id = (select public.current_business_id()));
create policy stock_items_select on public.stock_items for select to authenticated
  using (business_id = (select public.current_business_id()));
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (business_id = (select public.current_business_id()));
-- Sin políticas de escritura: se escribe solo por RPC.
revoke all on public.supplies from anon;
revoke all on public.stock_items from anon;
revoke all on public.stock_movements from anon;

-- ── 4) Cómo se llama lo que se cuenta (para bitácora y avisos) ──────
create or replace function public.stock_item_name(p_item uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.supply_id is not null then sup.name
    else p.name || case when v.name <> 'Único' then ' · ' || v.name else '' end
  end
  from public.stock_items s
  left join public.supplies sup on sup.id = s.supply_id
  left join public.menu_variants v on v.id = s.variant_id
  left join public.menu_products p on p.id = v.product_id
  where s.id = p_item;
$$;
revoke all on function public.stock_item_name(uuid) from public, anon, authenticated;

-- ── 5) Quién firma (bitácora del lado del cajero) ───────────────────
-- `log_audit` exige admin; la cajera registra mermas, así que la bitácora se
-- escribe desde el RPC, con el mismo patrón que los abonos de fiado (50).
create or replace function public.stock_audit(
  p_biz uuid, p_actor uuid, p_action text, p_entity text, p_details jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  select coalesce(nullif(p.full_name, ''), m.username, '') into v_actor
  from public.profiles p
  left join public.business_members m on m.user_id = p.id and m.business_id = p_biz
  where p.id = p_actor;
  insert into public.audit_events (business_id, actor_id, actor_name, action, entity, details)
  values (p_biz, p_actor, coalesce(v_actor, ''), p_action, left(p_entity, 120), p_details);
end;
$$;
revoke all on function public.stock_audit(uuid, uuid, text, text, jsonb) from public, anon, authenticated;

-- ── 6) stock_track: qué del MENÚ se cuenta ──────────────────────────
-- Cambia de firma (enteros → numéricos): se tira la vieja. PostgREST no
-- resuelve sobrecargas (regla del repo).
drop function if exists public.stock_track(uuid, boolean, integer, integer);

create or replace function public.stock_track(
  p_variant uuid,
  p_on boolean,
  p_qty numeric default null,
  p_min numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_item public.stock_items;
  v_nombre text;
  v_qty numeric;
  v_nuevo boolean := false;
  v_delta numeric;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo un administrador puede decidir qué se cuenta.';
  end if;

  select p.name || case when v.name <> 'Único' then ' · ' || v.name else '' end
    into v_nombre
  from public.menu_variants v
  join public.menu_products p on p.id = v.product_id
  where v.id = p_variant and v.business_id = v_biz;
  if v_nombre is null then
    raise exception 'Ese artículo no está en tu menú.';
  end if;

  select * into v_item from public.stock_items
  where variant_id = p_variant and business_id = v_biz for update;

  if not p_on then
    if found and v_item.tracked then
      update public.stock_items set tracked = false, updated_at = now() where id = v_item.id;
      perform public.stock_audit(v_biz, v_ctx.user_id, 'existencias.desmarcado', v_nombre,
        jsonb_build_object('item_id', v_item.id, 'variant_id', p_variant));
    end if;
    return jsonb_build_object('variant_id', p_variant, 'tracked', false);
  end if;

  if p_min is not null and p_min < 0 then
    raise exception 'El mínimo no puede ser negativo.';
  end if;
  if p_qty is not null and p_qty < 0 then
    raise exception 'La existencia no puede ser negativa.';
  end if;
  -- Lo del menú se cuenta entero: no se vende medio panqué.
  if p_qty is not null and p_qty <> trunc(p_qty) then
    raise exception 'Lo que está en el menú se cuenta en piezas enteras.';
  end if;
  if p_min is not null and p_min <> trunc(p_min) then
    raise exception 'Lo que está en el menú se cuenta en piezas enteras.';
  end if;

  if not found then
    insert into public.stock_items (variant_id, business_id, qty, min_qty)
    values (p_variant, v_biz, 0, coalesce(p_min, 0))
    returning * into v_item;
    v_qty := 0;
    v_nuevo := true;
  else
    -- Volver a contar después de dejar de contar empieza de cero: se sella
    -- desde cuándo, para que una venta vieja no reviva al cancelarse.
    if not v_item.tracked then
      v_nuevo := true;
      update public.stock_items
      set tracked = true, tracked_at = now(), updated_at = now(),
          min_qty = coalesce(p_min, min_qty),
          tracked_seq = coalesce((select max(m.seq) from public.stock_movements m
                                   where m.item_id = v_item.id), 0)
      where id = v_item.id;
    elsif p_min is not null then
      update public.stock_items set min_qty = p_min, updated_at = now() where id = v_item.id;
    end if;
    v_qty := v_item.qty;
  end if;

  if p_qty is not null and p_qty <> v_qty then
    v_delta := p_qty - v_qty;
    update public.stock_items set qty = p_qty, updated_at = now() where id = v_item.id;
    insert into public.stock_movements (business_id, item_id, kind, qty, qty_after, reason, actor_id)
    values (v_biz, v_item.id, 'conteo', v_delta, p_qty,
            case when v_nuevo then 'Existencia inicial' else 'Conteo' end, v_ctx.user_id);
    v_qty := p_qty;
  end if;

  perform public.stock_audit(v_biz, v_ctx.user_id,
    case when v_nuevo then 'existencias.marcado' else 'existencias.ajustado' end, v_nombre,
    jsonb_build_object('item_id', v_item.id, 'variant_id', p_variant, 'qty', v_qty, 'min_qty', p_min));

  return jsonb_build_object('item_id', v_item.id, 'variant_id', p_variant, 'tracked', true,
    'qty', v_qty, 'min_qty', (select min_qty from public.stock_items where id = v_item.id));
end;
$$;
revoke execute on function public.stock_track(uuid, boolean, numeric, numeric) from public, anon;
grant execute on function public.stock_track(uuid, boolean, numeric, numeric) to authenticated;

-- ── 7) supply_save: crear, renombrar o apagar un insumo ─────────────
-- Un insumo nace contándose: se crea y se cuenta en el mismo acto, que es
-- como lo piensa quien lo captura («tengo 8 paquetes de servilletas»).
create or replace function public.supply_save(
  p_name text,
  p_unit text default 'pieza',
  p_supply uuid default null,
  p_qty numeric default null,
  p_min numeric default null,
  p_on boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_supply public.supplies;
  v_item public.stock_items;
  v_nombre text := nullif(btrim(coalesce(p_name, '')), '');
  v_qty numeric;
  v_nuevo boolean := false;
  v_delta numeric;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo un administrador puede decidir qué se cuenta.';
  end if;

  if p_supply is null and v_nombre is null then
    raise exception 'Escribe el nombre del insumo.';
  end if;
  if v_nombre is not null and length(v_nombre) > 80 then
    raise exception 'El nombre es demasiado largo.';
  end if;
  if p_unit is not null and p_unit not in ('pieza', 'paquete', 'caja', 'bolsa', 'kilo', 'litro') then
    raise exception 'Esa unidad no existe.';
  end if;
  if p_min is not null and p_min < 0 then
    raise exception 'El mínimo no puede ser negativo.';
  end if;
  if p_qty is not null and p_qty < 0 then
    raise exception 'La existencia no puede ser negativa.';
  end if;

  if p_supply is null then
    begin
      insert into public.supplies (business_id, name, unit)
      values (v_biz, v_nombre, coalesce(p_unit, 'pieza'))
      returning * into v_supply;
    exception when unique_violation then
      raise exception 'Ya cuentas algo con ese nombre.';
    end;
    insert into public.stock_items (supply_id, business_id, qty, min_qty)
    values (v_supply.id, v_biz, 0, coalesce(p_min, 0))
    returning * into v_item;
    v_qty := 0;
    v_nuevo := true;
  else
    select * into v_supply from public.supplies where id = p_supply and business_id = v_biz;
    if not found then
      raise exception 'Ese insumo no existe.';
    end if;
    if v_nombre is not null or p_unit is not null then
      begin
        update public.supplies
        set name = coalesce(v_nombre, name), unit = coalesce(p_unit, unit)
        where id = v_supply.id
        returning * into v_supply;
      exception when unique_violation then
        raise exception 'Ya cuentas algo con ese nombre.';
      end;
    end if;
    select * into v_item from public.stock_items
    where supply_id = v_supply.id and business_id = v_biz for update;
    if not found then
      raise exception 'Ese insumo no se está contando.';
    end if;
    if not p_on then
      if v_item.tracked then
        update public.stock_items set tracked = false, updated_at = now() where id = v_item.id;
        update public.supplies set is_active = false where id = v_supply.id;
        perform public.stock_audit(v_biz, v_ctx.user_id, 'existencias.desmarcado', v_supply.name,
          jsonb_build_object('item_id', v_item.id, 'supply_id', v_supply.id));
      end if;
      return jsonb_build_object('supply_id', v_supply.id, 'item_id', v_item.id, 'tracked', false);
    end if;
    if not v_item.tracked then
      v_nuevo := true;
      update public.stock_items
      set tracked = true, tracked_at = now(), updated_at = now(),
          min_qty = coalesce(p_min, min_qty),
          tracked_seq = coalesce((select max(m.seq) from public.stock_movements m
                                   where m.item_id = v_item.id), 0)
      where id = v_item.id;
      update public.supplies set is_active = true where id = v_supply.id;
    elsif p_min is not null then
      update public.stock_items set min_qty = p_min, updated_at = now() where id = v_item.id;
    end if;
    v_qty := v_item.qty;
  end if;

  if p_qty is not null and p_qty <> v_qty then
    v_delta := p_qty - v_qty;
    update public.stock_items set qty = p_qty, updated_at = now() where id = v_item.id;
    insert into public.stock_movements (business_id, item_id, kind, qty, qty_after, reason, actor_id)
    values (v_biz, v_item.id, 'conteo', v_delta, p_qty,
            case when v_nuevo then 'Existencia inicial' else 'Conteo' end, v_ctx.user_id);
    v_qty := p_qty;
  end if;

  perform public.stock_audit(v_biz, v_ctx.user_id,
    case when v_nuevo then 'existencias.marcado' else 'existencias.ajustado' end, v_supply.name,
    jsonb_build_object('item_id', v_item.id, 'supply_id', v_supply.id, 'qty', v_qty, 'min_qty', p_min));

  return jsonb_build_object('supply_id', v_supply.id, 'item_id', v_item.id, 'tracked', true,
    'name', v_supply.name, 'unit', v_supply.unit, 'qty', v_qty,
    'min_qty', (select min_qty from public.stock_items where id = v_item.id));
end;
$$;
revoke execute on function public.supply_save(text, text, uuid, numeric, numeric, boolean) from public, anon;
grant execute on function public.supply_save(text, text, uuid, numeric, numeric, boolean) to authenticated;

-- ── 8) stock_move: entrada, merma o conteo, de lo que sea ───────────
-- Ahora por `item_id`: sirve igual para un panqué que para un costal de café.
-- p_qty es POSITIVO siempre: cuántas llegaron, cuántas se perdieron, o cuánto
-- hay de verdad (conteo). El signo lo pone el tipo.
drop function if exists public.stock_move(uuid, text, integer, text, numeric);

create or replace function public.stock_move(
  p_item uuid,
  p_kind text,
  p_qty numeric,
  p_reason text default null,
  p_unit_cost numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_item public.stock_items;
  v_nombre text;
  v_delta numeric;
  v_after numeric;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_cost numeric(10,2);
  v_mov uuid;
  v_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  v_admin := v_ctx.member_role in ('owner', 'admin');

  if p_kind not in ('entrada', 'merma', 'conteo') then
    raise exception 'Movimiento no válido.';
  end if;
  if p_qty is null or p_qty < 0 or (p_kind <> 'conteo' and p_qty = 0) then
    raise exception 'Indica cuánto.';
  end if;
  if p_qty > 100000 then
    raise exception 'Es demasiado para un solo movimiento.';
  end if;

  select * into v_item from public.stock_items
  where id = p_item and business_id = v_biz for update;
  if not found or not v_item.tracked then
    raise exception 'Eso no se está contando.';
  end if;
  -- Lo del menú se cuenta entero; un insumo puede llevar decimales (2.5 kg).
  if v_item.variant_id is not null and p_qty <> trunc(p_qty) then
    raise exception 'Lo que está en el menú se cuenta en piezas enteras.';
  end if;

  v_nombre := public.stock_item_name(p_item);

  if p_kind = 'entrada' then
    v_delta := p_qty;
    -- Un costo en cero es «no lo sé», no «me salió gratis»: se ignora.
    if p_unit_cost is not null and p_unit_cost > 0 then
      -- El costo toca el margen de todas las ventas que siguen: lo pone quien
      -- responde por los números, no quien recibe el pan.
      if not v_admin then
        raise exception 'Solo un administrador puede poner el costo.';
      end if;
      if p_unit_cost > 99999 then
        raise exception 'El costo no es válido.';
      end if;
      v_cost := round(p_unit_cost, 2);
      -- Solo lo del menú tiene costo de lo vendido. Lo que cuesta un insumo
      -- se queda en el diario: su gasto se captura en Gastos, porque nunca
      -- se vende solo y si no, no entra a la utilidad por ningún lado.
      if v_item.variant_id is not null then
        update public.menu_variants set cost = v_cost
        where id = v_item.variant_id and business_id = v_biz;
      end if;
    end if;
  elsif p_kind = 'merma' then
    if v_reason is null then
      raise exception 'Indica el motivo de la merma.';
    end if;
    v_delta := -p_qty;
  else
    if not v_admin then
      raise exception 'Solo un administrador puede contar.';
    end if;
    v_delta := p_qty - v_item.qty;
    if v_delta = 0 then
      -- Contar lo mismo que ya decía el sistema no es un movimiento.
      return jsonb_build_object('item_id', p_item, 'variant_id', v_item.variant_id,
        'kind', p_kind, 'qty', 0, 'qty_after', v_item.qty, 'moved', false);
    end if;
    v_reason := coalesce(v_reason, 'Conteo');
  end if;

  v_after := v_item.qty + v_delta;
  update public.stock_items set qty = v_after, updated_at = now() where id = v_item.id;
  insert into public.stock_movements (business_id, item_id, kind, qty, qty_after, unit_cost, reason, actor_id)
  values (v_biz, v_item.id, p_kind, v_delta, v_after, v_cost, v_reason, v_ctx.user_id)
  returning id into v_mov;

  perform public.stock_audit(v_biz, v_ctx.user_id, 'existencias.' || p_kind, v_nombre,
    jsonb_build_object('item_id', v_item.id, 'qty', v_delta, 'qty_after', v_after,
                       'reason', v_reason, 'unit_cost', v_cost));

  return jsonb_build_object('item_id', p_item, 'variant_id', v_item.variant_id, 'kind', p_kind,
    'qty', v_delta, 'qty_after', v_after, 'moved', true, 'movement_id', v_mov,
    'cost_updated', v_cost is not null and v_item.variant_id is not null);
end;
$$;
revoke execute on function public.stock_move(uuid, text, numeric, text, numeric) from public, anon;
grant execute on function public.stock_move(uuid, text, numeric, text, numeric) to authenticated;

-- ── 9) create_ticket: la venta descuenta, ahora por item ────────────
-- Se parchea la definición viva con anclas exactas (patrón de las migraciones
-- 40, 51 y 57): las anclas son el texto que dejó la 57. Si no están, la
-- migración falla en vez de seguir a ciegas.
do $$
declare
  v_def text;
  v_a1 text := '  v_custom_count int := 0;' || chr(10) ||
               '  v_stock_after int;' || chr(10) ||
               '  v_stock_changes jsonb := ''[]''::jsonb;' || chr(10) || 'begin';
  v_a2 text := '    if r.variant_id is not null then' || chr(10) ||
               '      update public.stock_items s' || chr(10) ||
               '         set qty = s.qty - v_qty, updated_at = now()' || chr(10) ||
               '       where s.variant_id = r.variant_id and s.business_id = v_biz' || chr(10) ||
               '       returning s.qty into v_stock_after;' || chr(10) ||
               '      if found then' || chr(10) ||
               '        insert into public.stock_movements (business_id, variant_id, kind, qty, qty_after, ticket_id, actor_id)' || chr(10) ||
               '        values (v_biz, r.variant_id, ''venta'', -v_qty, v_stock_after, v_ticket_id, v_ctx.user_id);' || chr(10) ||
               '        v_stock_changes := v_stock_changes || jsonb_build_object(''variant_id'', r.variant_id, ''qty'', v_stock_after);' || chr(10) ||
               '      end if;' || chr(10) ||
               '    end if;';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_ticket';
  if v_def is null then
    raise exception 'No existe public.create_ticket: nada que parchear.';
  end if;
  if position('v_stock_item' in v_def) > 0 then
    raise notice 'create_ticket ya descuenta por item; no se toca.';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1 then
    raise exception 'create_ticket: el ancla de las variables no está exactamente una vez.';
  end if;
  if (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2) <> 1 then
    raise exception 'create_ticket: el ancla del descuento no está exactamente una vez.';
  end if;

  v_def := replace(v_def, v_a1,
    '  v_custom_count int := 0;' || chr(10) ||
    '  v_stock_item uuid;' || chr(10) ||
    '  v_stock_after numeric;' || chr(10) ||
    '  v_stock_changes jsonb := ''[]''::jsonb;' || chr(10) || 'begin');
  v_def := replace(v_def, v_a2,
    '    if r.variant_id is not null then' || chr(10) ||
    '      update public.stock_items s' || chr(10) ||
    '         set qty = s.qty - v_qty, updated_at = now()' || chr(10) ||
    '       where s.variant_id = r.variant_id and s.business_id = v_biz and s.tracked' || chr(10) ||
    '       returning s.id, s.qty into v_stock_item, v_stock_after;' || chr(10) ||
    '      if found then' || chr(10) ||
    '        insert into public.stock_movements (business_id, item_id, kind, qty, qty_after, ticket_id, actor_id)' || chr(10) ||
    '        values (v_biz, v_stock_item, ''venta'', -v_qty, v_stock_after, v_ticket_id, v_ctx.user_id);' || chr(10) ||
    '        v_stock_changes := v_stock_changes || jsonb_build_object(''variant_id'', r.variant_id, ''qty'', v_stock_after);' || chr(10) ||
    '      end if;' || chr(10) ||
    '    end if;');
  execute v_def;
end $$;

-- ── 10) cancel_ticket: devuelve lo que ESTA venta descontó ──────────
-- Se lee del diario, no de los renglones del ticket: así devuelve exactamente
-- lo que se descontó, y solo si ese renglón es posterior al sello de la cuenta
-- viva (`tracked_seq`). Cancelar hoy una venta de antes de empezar a contar
-- —o de antes de volver a contar— no inventa piezas.
do $$
declare
  v_def text;
  v_a1 text := '  v_it record;' || chr(10) ||
               '  v_stock_after int;' || chr(10) ||
               '  v_stock_changes jsonb := ''[]''::jsonb;' || chr(10) || 'begin';
  v_a2 text := '  -- P45: lo que esta venta descontó vuelve al estante.' || chr(10) ||
               '  for v_it in' || chr(10) ||
               '    select ti.variant_id, ti.quantity' || chr(10) ||
               '      from public.ticket_items ti' || chr(10) ||
               '     where ti.ticket_id = v_ticket.id and ti.variant_id is not null' || chr(10) ||
               '       and exists (select 1 from public.stock_movements m' || chr(10) ||
               '                    where m.ticket_id = v_ticket.id and m.variant_id = ti.variant_id and m.kind = ''venta'')' || chr(10) ||
               '  loop' || chr(10) ||
               '    update public.stock_items s' || chr(10) ||
               '       set qty = s.qty + v_it.quantity, updated_at = now()' || chr(10) ||
               '     where s.variant_id = v_it.variant_id and s.business_id = v_biz' || chr(10) ||
               '     returning s.qty into v_stock_after;' || chr(10) ||
               '    if found then' || chr(10) ||
               '      insert into public.stock_movements (business_id, variant_id, kind, qty, qty_after, ticket_id, actor_id)' || chr(10) ||
               '      values (v_biz, v_it.variant_id, ''cancelacion'', v_it.quantity, v_stock_after, v_ticket.id, v_ctx.user_id);' || chr(10) ||
               '      v_stock_changes := v_stock_changes || jsonb_build_object(''variant_id'', v_it.variant_id, ''qty'', v_stock_after);' || chr(10) ||
               '    end if;' || chr(10) ||
               '  end loop;';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'cancel_ticket';
  if v_def is null then
    raise exception 'No existe public.cancel_ticket: nada que parchear.';
  end if;
  if position('v_stock_variant' in v_def) > 0 then
    raise notice 'cancel_ticket ya devuelve por item; no se toca.';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1 then
    raise exception 'cancel_ticket: el ancla de las variables no está exactamente una vez.';
  end if;
  if (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2) <> 1 then
    raise exception 'cancel_ticket: el ancla de la devolución no está exactamente una vez.';
  end if;

  v_def := replace(v_def, v_a1,
    '  v_it record;' || chr(10) ||
    '  v_stock_after numeric;' || chr(10) ||
    '  v_stock_variant uuid;' || chr(10) ||
    '  v_stock_changes jsonb := ''[]''::jsonb;' || chr(10) || 'begin');
  v_def := replace(v_def, v_a2,
    '  -- P45: vuelve al estante exactamente lo que ESTA venta descontó, y solo' || chr(10) ||
    '  -- si ese artículo se ha contado sin interrupción desde entonces.' || chr(10) ||
    '  for v_it in' || chr(10) ||
    '    select m.item_id, sum(-m.qty) as qty' || chr(10) ||
    '      from public.stock_movements m' || chr(10) ||
    '      join public.stock_items s on s.id = m.item_id' || chr(10) ||
    '     where m.ticket_id = v_ticket.id and m.kind = ''venta''' || chr(10) ||
    '       and s.tracked and m.seq > s.tracked_seq' || chr(10) ||
    '     group by m.item_id' || chr(10) ||
    '  loop' || chr(10) ||
    '    update public.stock_items s' || chr(10) ||
    '       set qty = s.qty + v_it.qty, updated_at = now()' || chr(10) ||
    '     where s.id = v_it.item_id and s.business_id = v_biz' || chr(10) ||
    '     returning s.qty, s.variant_id into v_stock_after, v_stock_variant;' || chr(10) ||
    '    if found then' || chr(10) ||
    '      insert into public.stock_movements (business_id, item_id, kind, qty, qty_after, ticket_id, actor_id)' || chr(10) ||
    '      values (v_biz, v_it.item_id, ''cancelacion'', v_it.qty, v_stock_after, v_ticket.id, v_ctx.user_id);' || chr(10) ||
    '      if v_stock_variant is not null then' || chr(10) ||
    '        v_stock_changes := v_stock_changes || jsonb_build_object(''variant_id'', v_stock_variant, ''qty'', v_stock_after);' || chr(10) ||
    '      end if;' || chr(10) ||
    '    end if;' || chr(10) ||
    '  end loop;');
  execute v_def;
end $$;

-- ── 11) Borrar la cafetería se lleva también los insumos ────────────
-- Regla del repo: toda tabla nueva con business_id entra en delete_business.
do $$
declare
  v_def text;
  v_ancla text := '  delete from stock_items where business_id = p_business_id;';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'delete_business';
  if v_def is null then
    raise exception 'No existe public.delete_business: nada que parchear.';
  end if;
  if position('supplies' in v_def) > 0 then
    raise notice 'delete_business ya borra los insumos; no se toca.';
    return;
  end if;
  if position(v_ancla in v_def) = 0 then
    raise exception 'El ancla no está en delete_business; revisar antes de seguir.';
  end if;
  execute replace(v_def, v_ancla,
    v_ancla || chr(10) ||
    '  delete from supplies where business_id = p_business_id;');
end $$;
