-- 57_p45_inventario.sql — P45: inventario por pieza, el núcleo (migración: p45_inventario).
--
-- Diseño completo en docs/inventario.md. Lo esencial, para quien llegue aquí:
--
--   · Se cuenta POR PIEZA lo que se compra y se vende como la misma cosa (la
--     orejita, la botella). Nada de recetas: nadie mantiene gramos por bebida.
--   · NUNCA se bloquea una venta por existencias. Si el sistema dice cero y la
--     cajera tiene el muffin en la mano, el que está mal es el sistema: la
--     venta pasa, la existencia queda en negativo y el conteo lo corrige.
--   · El sistema mueve la existencia con ventas y cancelaciones; las personas
--     registran entradas, mermas y conteos. Todo por RPC: NINGÚN cliente
--     escribe estas tablas (por eso son tablas aparte y no columnas en
--     menu_variants, que el dueño sí edita por PostgREST).
--   · Todo movimiento deja rastro en un diario con el saldo que quedó
--     (`qty_after`): «compré 30 y tengo 3, ¿a dónde se fueron 27?» se contesta
--     leyendo, sin sumar.
--   · Una entrada con costo actualiza `menu_variants.cost`: es la única forma
--     realista de que el costo se capture (hoy está en $0 en 42 de 43
--     productos de un café real, y el margen lleva inflado desde que existe).
--
-- Permisos, decididos con el usuario: la cajera registra entradas (recibe el
-- pan a las 7) pero SIN costo, y mermas con motivo; contar y decidir qué se
-- cuenta es de admin o dueño. Las reglas viven aquí, no en la pantalla.
--
-- Un café que no marca nada no ve nada: sin filas en stock_items, los parches
-- de create_ticket y cancel_ticket no encuentran qué tocar y no hacen nada.

-- ── 1) Lo que se cuenta ─────────────────────────────────────────────
create table public.stock_items (
  variant_id uuid primary key references public.menu_variants(id) on delete cascade,
  business_id uuid not null default public.current_business_id()
    references public.businesses(id) on delete restrict,
  -- Puede ser negativo a propósito: ver arriba.
  qty integer not null default 0,
  -- 0 = sin aviso.
  min_qty integer not null default 0 check (min_qty >= 0),
  updated_at timestamptz not null default now()
);
comment on table public.stock_items is
  'Existencia actual de cada variante que se cuenta por pieza. Solo la escriben los RPC; el diario está en stock_movements.';
create index stock_items_business on public.stock_items (business_id);

-- ── 2) El diario ────────────────────────────────────────────────────
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  -- El orden REAL. `created_at` no sirve para ordenar: dentro de una misma
  -- transacción `now()` es igual para todos (una venta con dos artículos
  -- contados deja dos renglones con la misma hora), y el ensayo lo cazó:
  -- ordenando por hora e id, el diario no cuadraba.
  seq bigint generated always as identity,
  business_id uuid not null default public.current_business_id()
    references public.businesses(id) on delete restrict,
  variant_id uuid not null references public.menu_variants(id) on delete cascade,
  -- Texto con check y no enum: un valor nuevo de enum exige su propia
  -- migración, y este catálogo va a crecer.
  kind text not null check (kind in ('entrada', 'venta', 'cancelacion', 'merma', 'conteo')),
  -- El CAMBIO, con signo: +12 entrada, -1 venta, -3 merma, ±n conteo.
  qty integer not null check (qty <> 0),
  -- Lo que quedó. Redundante a propósito: el historial se lee como estado de
  -- cuenta y sirve para notar si alguien tocó `qty` por fuera.
  qty_after integer not null,
  -- Solo en entradas: lo que costó cada pieza.
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
create index stock_movements_variant on public.stock_movements (business_id, variant_id, seq desc);
create index stock_movements_ticket on public.stock_movements (ticket_id) where ticket_id is not null;

-- ── 3) RLS: se lee dentro del negocio, no se escribe desde el cliente ─
alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
-- La cajera necesita VER existencias (la esquina «quedan 3» del POS).
create policy stock_items_select on public.stock_items for select to authenticated
  using (business_id = (select public.current_business_id()));
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (business_id = (select public.current_business_id()));
-- Sin políticas de escritura: se escribe solo por RPC.
revoke all on public.stock_items from anon;
revoke all on public.stock_movements from anon;

-- ── 4) Quién es quien firma (bitácora del lado del cajero) ───────────
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

-- ── 5) stock_track: decidir qué se cuenta ───────────────────────────
-- p_on = true: empieza a contarse (o ajusta el mínimo); si trae p_qty, esa es
-- la existencia real y se registra como conteo («Existencia inicial» la
-- primera vez). p_on = false: deja de contarse; el diario se queda.
create or replace function public.stock_track(
  p_variant uuid,
  p_on boolean,
  p_qty integer default null,
  p_min integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_nombre text;
  v_qty integer;
  v_nuevo boolean := false;
  v_delta integer;
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
    raise exception 'Solo un administrador puede decidir qué se cuenta por pieza.';
  end if;

  select p.name || case when v.name <> 'Único' then ' · ' || v.name else '' end
    into v_nombre
  from public.menu_variants v
  join public.menu_products p on p.id = v.product_id
  where v.id = p_variant and v.business_id = v_biz;
  if v_nombre is null then
    raise exception 'Ese artículo no está en tu menú.';
  end if;

  if not p_on then
    delete from public.stock_items where variant_id = p_variant and business_id = v_biz;
    if found then
      perform public.stock_audit(v_biz, v_ctx.user_id, 'existencias.desmarcado', v_nombre,
        jsonb_build_object('variant_id', p_variant));
    end if;
    return jsonb_build_object('variant_id', p_variant, 'tracked', false);
  end if;

  if p_min is not null and p_min < 0 then
    raise exception 'El mínimo no puede ser negativo.';
  end if;
  if p_qty is not null and p_qty < 0 then
    raise exception 'La existencia no puede ser negativa.';
  end if;

  select qty into v_qty from public.stock_items
  where variant_id = p_variant and business_id = v_biz for update;
  if not found then
    insert into public.stock_items (variant_id, business_id, qty, min_qty)
    values (p_variant, v_biz, 0, coalesce(p_min, 0));
    v_qty := 0;
    v_nuevo := true;
  elsif p_min is not null then
    update public.stock_items set min_qty = p_min, updated_at = now()
    where variant_id = p_variant and business_id = v_biz;
  end if;

  if p_qty is not null and p_qty <> v_qty then
    v_delta := p_qty - v_qty;
    update public.stock_items set qty = p_qty, updated_at = now()
    where variant_id = p_variant and business_id = v_biz;
    insert into public.stock_movements (business_id, variant_id, kind, qty, qty_after, reason, actor_id)
    values (v_biz, p_variant, 'conteo', v_delta, p_qty,
            case when v_nuevo then 'Existencia inicial' else 'Conteo' end, v_ctx.user_id);
    v_qty := p_qty;
  end if;

  perform public.stock_audit(v_biz, v_ctx.user_id,
    case when v_nuevo then 'existencias.marcado' else 'existencias.ajustado' end, v_nombre,
    jsonb_build_object('variant_id', p_variant, 'qty', v_qty, 'min_qty', p_min));

  return jsonb_build_object('variant_id', p_variant, 'tracked', true, 'qty', v_qty,
    'min_qty', (select min_qty from public.stock_items where variant_id = p_variant));
end;
$$;
revoke execute on function public.stock_track(uuid, boolean, integer, integer) from public, anon;
grant execute on function public.stock_track(uuid, boolean, integer, integer) to authenticated;

-- ── 6) stock_move: entrada, merma o conteo ──────────────────────────
-- p_qty es POSITIVO siempre: cuántas llegaron, cuántas se perdieron, o
-- cuántas hay de verdad (conteo). El signo lo pone el tipo.
create or replace function public.stock_move(
  p_variant uuid,
  p_kind text,
  p_qty integer,
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
  v_delta integer;
  v_after integer;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
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
    raise exception 'Indica cuántas piezas.';
  end if;
  if p_qty > 100000 then
    raise exception 'Son demasiadas piezas para un solo movimiento.';
  end if;

  select * into v_item from public.stock_items
  where variant_id = p_variant and business_id = v_biz for update;
  if not found then
    raise exception 'Ese artículo no se cuenta por pieza.';
  end if;

  select p.name || case when v.name <> 'Único' then ' · ' || v.name else '' end
    into v_nombre
  from public.menu_variants v
  join public.menu_products p on p.id = v.product_id
  where v.id = p_variant;

  if p_kind = 'entrada' then
    v_delta := p_qty;
    if p_unit_cost is not null then
      -- El costo toca el margen de todas las ventas que siguen: lo pone quien
      -- responde por los números, no quien recibe el pan.
      if not v_admin then
        raise exception 'Solo un administrador puede poner el costo.';
      end if;
      if p_unit_cost < 0 or p_unit_cost > 99999 then
        raise exception 'El costo no es válido.';
      end if;
      v_cost := round(p_unit_cost, 2);
      update public.menu_variants set cost = v_cost where id = p_variant and business_id = v_biz;
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
      return jsonb_build_object('variant_id', p_variant, 'kind', p_kind, 'qty', 0,
        'qty_after', v_item.qty, 'moved', false);
    end if;
    v_reason := coalesce(v_reason, 'Conteo');
  end if;

  v_after := v_item.qty + v_delta;
  update public.stock_items set qty = v_after, updated_at = now()
  where variant_id = p_variant and business_id = v_biz;
  insert into public.stock_movements (business_id, variant_id, kind, qty, qty_after, unit_cost, reason, actor_id)
  values (v_biz, p_variant, p_kind, v_delta, v_after, v_cost, v_reason, v_ctx.user_id)
  returning id into v_mov;

  perform public.stock_audit(v_biz, v_ctx.user_id, 'existencias.' || p_kind, v_nombre,
    jsonb_build_object('variant_id', p_variant, 'qty', v_delta, 'qty_after', v_after,
                       'reason', v_reason, 'unit_cost', v_cost));

  return jsonb_build_object('variant_id', p_variant, 'kind', p_kind, 'qty', v_delta,
    'qty_after', v_after, 'moved', true, 'movement_id', v_mov, 'cost_updated', v_cost is not null);
end;
$$;
revoke execute on function public.stock_move(uuid, text, integer, text, numeric) from public, anon;
grant execute on function public.stock_move(uuid, text, integer, text, numeric) to authenticated;

-- ── 7) create_ticket: la venta descuenta ────────────────────────────
-- Se PARCHEA la definición viva con tres anclas exactas (patrón de las
-- migraciones 40 y 51): la variable, el bucle de renglones y lo que devuelve.
-- Retipear una función con quince revisiones es como se revierten arreglos
-- sin darse cuenta. Cada ancla tiene que estar EXACTAMENTE UNA vez; si no,
-- la migración falla en vez de seguir a ciegas.
do $$
declare
  v_def text;
  v_a1 text := '  v_custom_count int := 0;' || chr(10) || 'begin';
  v_a2 text := '    returning id into v_item_id;' || chr(10) || chr(10) ||
               '    insert into public.ticket_item_modifiers';
  v_a3 text := '    ''ticket_id'', v_ticket_id,' || chr(10) || '    ''folio'', v_folio,';
  v_bloque text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_ticket';
  if v_def is null then
    raise exception 'No existe public.create_ticket: nada que parchear.';
  end if;
  if position('stock_items' in v_def) > 0 then
    raise notice 'create_ticket ya descuenta existencias; no se toca.';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1 then
    raise exception 'create_ticket: el ancla de la variable no está exactamente una vez.';
  end if;
  if (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2) <> 1 then
    raise exception 'create_ticket: el ancla del bucle no está exactamente una vez.';
  end if;
  if (length(v_def) - length(replace(v_def, v_a3, ''))) / length(v_a3) <> 1 then
    raise exception 'create_ticket: el ancla del resultado no está exactamente una vez.';
  end if;

  v_bloque :=
    '    returning id into v_item_id;' || chr(10) || chr(10) ||
    '    -- P45: lo que se cuenta por pieza baja con la venta, en esta misma' || chr(10) ||
    '    -- transacción: un reintento por client_ref no descuenta dos veces.' || chr(10) ||
    '    -- Sin fila en stock_items no pasa nada, y nunca se bloquea la venta.' || chr(10) ||
    '    if r.variant_id is not null then' || chr(10) ||
    '      update public.stock_items s' || chr(10) ||
    '         set qty = s.qty - v_qty, updated_at = now()' || chr(10) ||
    '       where s.variant_id = r.variant_id and s.business_id = v_biz' || chr(10) ||
    '       returning s.qty into v_stock_after;' || chr(10) ||
    '      if found then' || chr(10) ||
    '        insert into public.stock_movements (business_id, variant_id, kind, qty, qty_after, ticket_id, actor_id)' || chr(10) ||
    '        values (v_biz, r.variant_id, ''venta'', -v_qty, v_stock_after, v_ticket_id, v_ctx.user_id);' || chr(10) ||
    '        v_stock_changes := v_stock_changes || jsonb_build_object(''variant_id'', r.variant_id, ''qty'', v_stock_after);' || chr(10) ||
    '      end if;' || chr(10) ||
    '    end if;' || chr(10) || chr(10) ||
    '    insert into public.ticket_item_modifiers';

  v_def := replace(v_def, v_a1,
    '  v_custom_count int := 0;' || chr(10) ||
    '  v_stock_after int;' || chr(10) ||
    '  v_stock_changes jsonb := ''[]''::jsonb;' || chr(10) ||
    'begin');
  v_def := replace(v_def, v_a2, v_bloque);
  v_def := replace(v_def, v_a3,
    '    ''ticket_id'', v_ticket_id,' || chr(10) ||
    '    ''folio'', v_folio,' || chr(10) ||
    '    ''stock'', v_stock_changes,');
  execute v_def;
end $$;

-- ── 8) cancel_ticket: la cancelación devuelve ───────────────────────
-- Solo devuelve lo que ESTA venta descontó (hay movimiento «venta» de ese
-- ticket y esa variante): cancelar hoy una venta de antes de empezar a
-- contar no inventa piezas. correct_ticket cancela y vuelve a cobrar con
-- estas dos funciones, así que corregir sale gratis.
do $$
declare
  v_def text;
  v_a1 text := '  v_reason text := nullif(trim(coalesce(p_reason, '''')), '''');' || chr(10) || 'begin';
  v_a2 text := '      cancel_reason = v_reason' || chr(10) || '  where id = v_ticket.id;';
  v_a3 text := '  return jsonb_build_object(''ticket_id'', v_ticket.id, ''folio'', v_ticket.folio, ''status'', ''cancelado'');';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'cancel_ticket';
  if v_def is null then
    raise exception 'No existe public.cancel_ticket: nada que parchear.';
  end if;
  if position('stock_items' in v_def) > 0 then
    raise notice 'cancel_ticket ya devuelve existencias; no se toca.';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1 then
    raise exception 'cancel_ticket: el ancla de la variable no está exactamente una vez.';
  end if;
  if (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2) <> 1 then
    raise exception 'cancel_ticket: el ancla del update no está exactamente una vez.';
  end if;
  if (length(v_def) - length(replace(v_def, v_a3, ''))) / length(v_a3) <> 1 then
    raise exception 'cancel_ticket: el ancla del resultado no está exactamente una vez.';
  end if;

  v_def := replace(v_def, v_a1,
    '  v_reason text := nullif(trim(coalesce(p_reason, '''')), '''');' || chr(10) ||
    '  v_it record;' || chr(10) ||
    '  v_stock_after int;' || chr(10) ||
    '  v_stock_changes jsonb := ''[]''::jsonb;' || chr(10) ||
    'begin');
  v_def := replace(v_def, v_a2,
    v_a2 || chr(10) || chr(10) ||
    '  -- P45: lo que esta venta descontó vuelve al estante.' || chr(10) ||
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
    '  end loop;');
  v_def := replace(v_def, v_a3,
    '  return jsonb_build_object(''ticket_id'', v_ticket.id, ''folio'', v_ticket.folio, ''status'', ''cancelado'', ''stock'', v_stock_changes);');
  execute v_def;
end $$;

-- ── 9) Borrar la cafetería se lleva su inventario ───────────────────
-- Regla del repo: toda tabla nueva con business_id entra en delete_business.
-- (Las FK en cascada desde menu_variants lo harían solas, pero mejor dicho.)
do $$
declare
  v_def text;
  v_ancla text := '  delete from business_members where business_id = p_business_id;';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'delete_business';
  if v_def is null then
    raise exception 'No existe public.delete_business: nada que parchear.';
  end if;
  if position('stock_movements' in v_def) > 0 then
    raise notice 'delete_business ya borra el inventario; no se toca.';
    return;
  end if;
  if position(v_ancla in v_def) = 0 then
    raise exception 'El ancla no está en delete_business; revisar antes de seguir.';
  end if;
  execute replace(v_def, v_ancla,
    '  -- El inventario por pieza: el diario y lo que se contaba.' || chr(10) ||
    '  delete from stock_movements where business_id = p_business_id;' || chr(10) ||
    '  delete from stock_items where business_id = p_business_id;' || chr(10) ||
    v_ancla);
end $$;
