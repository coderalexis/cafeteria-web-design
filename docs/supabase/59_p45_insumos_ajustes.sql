-- 59_p45_insumos_ajustes.sql — P45: lo que la revisión de estabilidad encontró
-- en la 58 (migración: p45_insumos_ajustes).
--
-- Revisión del 2026-09-18, cada punto comprobado con ejecución real en un
-- ensayo revertido, no por lectura. Todo cae sobre tablas que siguen VACÍAS
-- en los cinco cafés y sobre funciones que ningún código en producción llama
-- todavía: el PR #71 se fusiona DESPUÉS de aplicar esto (regla del repo).
--
--   1. Un insumo que se dejó de contar NO se podía volver a agregar: el índice
--      único del nombre chocaba («Ya cuentas algo con ese nombre») y la
--      pantalla, que promete «puedes volver a contarlo», no daba otra salida.
--      → El índice pasa a ser PARCIAL (`where is_active`): un insumo apagado no
--        bloquea su nombre; el nuevo nace limpio, con su propio diario, y el
--        viejo conserva el suyo.
--   2. «Dejar de contar» un insumo le pisaba la unidad con 'pieza': `p_unit`
--      tenía `default 'pieza'` y la acción no manda unidad. → default null.
--   3. Al diario le faltaban índices que empezaran por `item_id` (el que había
--      empezaba por `business_id`: no sirve para borrar en cascada ni para el
--      historial de un artículo) y por `actor_id`.
--   4. La cajera podía leer por API el diario entero, con `unit_cost`, y su
--      pantalla no lo usa. → SELECT solo para owner|admin. Ventas y
--      cancelaciones lo escriben desde SECURITY DEFINER, así que no les afecta.
--   5. Una cantidad con más de tres decimales se guardaba redondeada por la
--      columna pero el RPC la devolvía sin redondear. → se redondea al entrar.
--   6. Las tres funciones se recrean con el texto de ESTE archivo. La 58 se
--      aplicó desde una copia sin sus comentarios internos, así que producción
--      y repo no eran idénticos; el archivo 58 ya se corrigió en el renglón que
--      difería dentro del parche de cancel_ticket, y aquí se comprueba al final
--      que cada cuerpo en la base es el de este archivo (por md5).

-- ── 1) El nombre de un insumo solo es único entre los ACTIVOS ─────────
drop index if exists public.supplies_nombre;
create unique index supplies_nombre on public.supplies (business_id, lower(btrim(name)))
  where is_active;

-- ── 3) Índices del diario ───────────────────────────────────────────
-- El historial de un artículo y el borrado en cascada buscan por item_id;
-- con RLS la consulta además filtra por business_id, que aquí sobra porque
-- un item_id es de un solo café.
drop index if exists public.stock_movements_item;
create index stock_movements_item on public.stock_movements (item_id, seq desc);
create index stock_movements_actor on public.stock_movements (actor_id) where actor_id is not null;

-- ── 4) El diario lo leen dueños y administradores ───────────────────
drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (business_id = (select public.current_business_id())
     and (select public.current_member_role()) in ('owner', 'admin'));

-- ── 2, 5 y 6) Las tres funciones, con el texto del repo ─────────────
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

create or replace function public.supply_save(
  p_name text,
  -- null = «no lo cambies». Con default 'pieza', dejar de contar (que no
  -- manda unidad) le pisaba los kilos a un insumo.
  p_unit text default null,
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
      -- Mientras estuvo apagado pudo nacer otro con el mismo nombre (el índice
      -- único solo mira los activos): se avisa igual que al crear.
      begin
        update public.supplies set is_active = true where id = v_supply.id;
      exception when unique_violation then
        raise exception 'Ya cuentas algo con ese nombre.';
      end;
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
  -- Lo que se guarda: la columna es numeric(12,3), así que se redondea aquí
  -- y todo lo que sigue (saldo, diario, respuesta) habla del mismo número.
  v_qty numeric;
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
  if p_qty is null or p_qty < 0 then
    raise exception 'Indica cuánto.';
  end if;
  v_qty := round(p_qty, 3);
  if p_kind <> 'conteo' and v_qty = 0 then
    raise exception 'Indica cuánto.';
  end if;
  if v_qty > 100000 then
    raise exception 'Es demasiado para un solo movimiento.';
  end if;

  select * into v_item from public.stock_items
  where id = p_item and business_id = v_biz for update;
  if not found or not v_item.tracked then
    raise exception 'Eso no se está contando.';
  end if;
  -- Lo del menú se cuenta entero; un insumo puede llevar decimales (2.5 kg).
  if v_item.variant_id is not null and v_qty <> trunc(v_qty) then
    raise exception 'Lo que está en el menú se cuenta en piezas enteras.';
  end if;

  v_nombre := public.stock_item_name(p_item);

  if p_kind = 'entrada' then
    v_delta := v_qty;
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
    v_delta := -v_qty;
  else
    if not v_admin then
      raise exception 'Solo un administrador puede contar.';
    end if;
    v_delta := v_qty - v_item.qty;
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

revoke execute on function public.stock_track(uuid, boolean, numeric, numeric) from public, anon;
grant execute on function public.stock_track(uuid, boolean, numeric, numeric) to authenticated;
revoke execute on function public.supply_save(text, text, uuid, numeric, numeric, boolean) from public, anon;
grant execute on function public.supply_save(text, text, uuid, numeric, numeric, boolean) to authenticated;
revoke execute on function public.stock_move(uuid, text, numeric, text, numeric) from public, anon;
grant execute on function public.stock_move(uuid, text, numeric, text, numeric) to authenticated;

-- ── Comprobación: la base tiene exactamente estos cuerpos ───────────
-- md5 de cada cuerpo entre los `$$` de arriba, calculado sobre este mismo
-- archivo al armarlo. Si no coincide, la migración falla y se revisa.
do $$
declare
  v_esperado jsonb := '{"stock_track":"f7d7b989b90a8374302ecd55838adb09","supply_save":"6e7af7165c916270ce5374e0ad7e7a63","stock_move":"71edeb91b30b3193e8afd6011d576198"}'::jsonb;
  v_nombre text;
  v_real text;
begin
  for v_nombre in select jsonb_object_keys(v_esperado) loop
    select md5(p.prosrc) into v_real
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_nombre;
    if v_real is distinct from (v_esperado->>v_nombre) then
      raise exception 'El cuerpo de % en la base no es el de este archivo (md5 % vs %).',
        v_nombre, v_real, v_esperado->>v_nombre;
    end if;
  end loop;
  raise notice 'p45_insumos_ajustes: las tres funciones coinciden con el archivo.';
end $$;
