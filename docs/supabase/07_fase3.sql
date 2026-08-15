-- ============================================================
-- Fase 3 — Extras de menú: modificadores en la venta y descuento
-- por ticket. Aplicar después de 06_fase2.sql.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Descuento: motivo + consistencia de importes
-- ────────────────────────────────────────────────────────────

alter table public.tickets
  add column discount_reason text,
  add constraint tickets_discount_range check (discount_total >= 0 and discount_total <= subtotal),
  add constraint tickets_total_consistency check (total = subtotal - discount_total + tax_total),
  add constraint tickets_discount_reason_consistency check (
    (discount_total = 0 and discount_reason is null) or (discount_total > 0 and discount_reason is not null)
  );

-- ────────────────────────────────────────────────────────────
-- 2. create_ticket v3: modificadores por artículo + descuento
--    (se elimina la firma anterior para que PostgREST no tenga
--    dos candidatas)
--
--    p_items: [{ "variant_id": uuid, "quantity": int, "notes"?: text,
--                "modifiers"?: [uuid, ...] }]
--    p_discount: { "type": "percent"|"amount", "value": number,
--                  "reason": text } | null
-- ────────────────────────────────────────────────────────────

drop function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric);

create or replace function public.create_ticket(
  p_client_ref uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_notes text default null,
  p_cash_received numeric default null,
  p_discount jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_role public.app_role;
  v_existing jsonb;
  v_session_id uuid;
  v_input_count int;
  v_valid_count int;
  v_bad int;
  v_subtotal numeric(10,2);
  v_discount numeric(10,2) := 0;
  v_discount_type text;
  v_discount_value numeric;
  v_discount_reason text;
  v_total numeric(10,2);
  v_cash_received numeric(10,2);
  v_change_due numeric(10,2);
  v_ticket_id uuid;
  v_folio bigint;
  v_item_id uuid;
  v_qty int;
  v_unit numeric(10,2);
  r record;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sesión inválida.';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then
    raise exception 'Perfil no encontrado.';
  end if;

  if p_client_ref is null then
    raise exception 'Falta la referencia del ticket (client_ref).';
  end if;

  -- Idempotencia: si este client_ref ya se registró, devolver el existente.
  select jsonb_build_object(
    'ticket_id', t.id, 'folio', t.folio, 'subtotal', t.subtotal, 'discount_total', t.discount_total,
    'total', t.total, 'cash_received', t.cash_received, 'change_due', t.change_due, 'duplicate', true
  )
  into v_existing
  from public.tickets t
  where t.client_ref = p_client_ref;
  if v_existing is not null then
    return v_existing;
  end if;

  select id into v_session_id from public.cash_sessions where status = 'abierta';
  if v_session_id is null then
    raise exception 'La caja está cerrada. Abre la caja antes de cobrar.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El ticket debe incluir al menos un artículo.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Demasiados artículos en el ticket (máximo 50).';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as e(elem)
    where coalesce(elem->>'quantity', '') !~ '^[0-9]+$'
       or (elem->>'quantity')::int < 1
       or (elem->>'quantity')::int > 99
  ) then
    raise exception 'Cantidad inválida en un artículo (debe ser un entero de 1 a 99).';
  end if;

  -- Toda variante debe existir y estar activa (y su producto también).
  select count(*) into v_input_count from jsonb_array_elements(p_items);

  select count(*) into v_valid_count
  from jsonb_array_elements(p_items) as e(elem)
  join public.menu_variants v
    on v.id = (elem->>'variant_id')::uuid and v.is_active
  join public.menu_products p
    on p.id = v.product_id and p.is_active;

  if v_valid_count <> v_input_count then
    raise exception 'Uno o más artículos no existen o están inactivos.';
  end if;

  -- ── Modificadores ────────────────────────────────────────────
  -- a) Cada modificador debe existir, estar activo, en un grupo activo
  --    ligado al producto del artículo.
  select count(*) into v_bad
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
  ) as sm(mid)
  left join public.modifiers m on m.id = sm.mid::uuid and m.is_active
  left join public.modifier_groups g on g.id = m.group_id and g.is_active
  left join public.menu_variants v on v.id = (elem->>'variant_id')::uuid
  left join public.product_modifier_groups pmg on pmg.group_id = g.id and pmg.product_id = v.product_id
  where m.id is null or g.id is null or pmg.product_id is null;
  if v_bad > 0 then
    raise exception 'Uno o más modificadores no existen o no aplican al producto.';
  end if;

  -- b) Sin repetidos dentro del mismo artículo.
  select count(*) into v_bad
  from (
    select idx, sm.mid
    from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
    ) as sm(mid)
    group by idx, sm.mid
    having count(*) > 1
  ) d;
  if v_bad > 0 then
    raise exception 'Modificador repetido en un artículo.';
  end if;

  -- c) Mínimo/máximo por grupo (incluye grupos obligatorios sin selección).
  select count(*) into v_bad
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  join public.menu_variants v on v.id = (elem->>'variant_id')::uuid
  join public.product_modifier_groups pmg on pmg.product_id = v.product_id
  join public.modifier_groups g on g.id = pmg.group_id and g.is_active
  cross join lateral (
    select count(*) as cnt
    from jsonb_array_elements_text(
      case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
    ) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid
    where m.group_id = g.id
  ) c
  where c.cnt < greatest(g.min_select, case when g.is_required then 1 else 0 end)
     or (g.max_select is not null and c.cnt > g.max_select);
  if v_bad > 0 then
    raise exception 'Faltan o sobran opciones en un grupo de modificadores.';
  end if;

  -- ── Subtotal con precios del servidor (variante + modificadores) ──
  select round(sum(round(v.price + coalesce(md.delta, 0), 2) * (elem->>'quantity')::int), 2)
  into v_subtotal
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  join public.menu_variants v on v.id = (elem->>'variant_id')::uuid
  left join lateral (
    select sum(m.price_delta) as delta
    from jsonb_array_elements_text(
      case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
    ) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid
  ) md on true;

  -- ── Descuento por ticket ─────────────────────────────────────
  if p_discount is not null and jsonb_typeof(p_discount) = 'object' then
    v_discount_type := p_discount->>'type';
    v_discount_reason := nullif(trim(coalesce(p_discount->>'reason', '')), '');
    begin
      v_discount_value := (p_discount->>'value')::numeric;
    exception when others then
      raise exception 'Monto de descuento inválido.';
    end;

    if v_discount_type not in ('percent', 'amount') then
      raise exception 'Tipo de descuento inválido.';
    end if;
    if v_discount_value is null or v_discount_value <= 0 then
      raise exception 'El descuento debe ser mayor a 0.';
    end if;
    if v_discount_reason is null then
      raise exception 'Indica el motivo del descuento.';
    end if;
    if length(v_discount_reason) > 200 then
      raise exception 'El motivo del descuento es demasiado largo (máximo 200 caracteres).';
    end if;

    if v_discount_type = 'percent' then
      if v_discount_value > 100 then
        raise exception 'El porcentaje de descuento no puede ser mayor a 100.';
      end if;
      v_discount := round(v_subtotal * v_discount_value / 100, 2);
    else
      v_discount := round(v_discount_value, 2);
    end if;

    if v_discount > v_subtotal then
      raise exception 'El descuento (%) no puede ser mayor que el subtotal (%).', v_discount, v_subtotal;
    end if;
    if v_discount = 0 then
      v_discount_reason := null;
    end if;
  end if;

  v_total := v_subtotal - v_discount;

  -- ── Efectivo recibido / cambio (sobre el total con descuento) ────
  if p_payment_method = 'efectivo' and p_cash_received is not null then
    v_cash_received := round(p_cash_received, 2);
    if v_cash_received < v_total then
      raise exception 'El efectivo recibido (%) es menor que el total (%).', v_cash_received, v_total;
    end if;
    v_change_due := round(v_cash_received - v_total, 2);
  end if;

  -- ── Inserción atómica ────────────────────────────────────────
  insert into public.tickets
    (cashier_id, session_id, payment_method, subtotal, discount_total, discount_reason, total,
     notes, client_ref, cash_received, change_due)
  values (
    v_uid, v_session_id, p_payment_method, v_subtotal, v_discount, v_discount_reason, v_total,
    nullif(trim(coalesce(p_notes, '')), ''), p_client_ref, v_cash_received, v_change_due
  )
  returning id, folio into v_ticket_id, v_folio;

  for r in
    select
      e.elem,
      e.idx,
      v.id as variant_id,
      v.price,
      v.name as variant_name,
      v.size_label,
      p.id as product_id,
      p.name as product_name,
      case when jsonb_typeof(e.elem->'modifiers') = 'array' then e.elem->'modifiers' else '[]'::jsonb end as mods,
      coalesce((
        select sum(m.price_delta)
        from jsonb_array_elements_text(
          case when jsonb_typeof(e.elem->'modifiers') = 'array' then e.elem->'modifiers' else '[]'::jsonb end
        ) as sm(mid)
        join public.modifiers m on m.id = sm.mid::uuid
      ), 0) as delta
    from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
    join public.menu_variants v on v.id = (e.elem->>'variant_id')::uuid
    join public.menu_products p on p.id = v.product_id
    order by e.idx
  loop
    v_qty := (r.elem->>'quantity')::int;
    v_unit := round(r.price + r.delta, 2);

    insert into public.ticket_items
      (ticket_id, product_id, variant_id, quantity, unit_price, line_total, notes,
       product_name, variant_name, size_label)
    values (
      v_ticket_id, r.product_id, r.variant_id, v_qty, v_unit, round(v_unit * v_qty, 2),
      nullif(trim(coalesce(r.elem->>'notes', '')), ''),
      r.product_name, r.variant_name, r.size_label
    )
    returning id into v_item_id;

    insert into public.ticket_item_modifiers (ticket_item_id, modifier_id, modifier_name, modifier_price)
    select v_item_id, m.id, m.name, m.price_delta
    from jsonb_array_elements_text(r.mods) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid
    order by m.sort_order, m.name;
  end loop;

  return jsonb_build_object(
    'ticket_id', v_ticket_id,
    'folio', v_folio,
    'subtotal', v_subtotal,
    'discount_total', v_discount,
    'total', v_total,
    'cash_received', v_cash_received,
    'change_due', v_change_due
  );

exception
  when unique_violation then
    -- Carrera entre dos requests con el mismo client_ref: gana el primero.
    select jsonb_build_object(
      'ticket_id', t.id, 'folio', t.folio, 'subtotal', t.subtotal, 'discount_total', t.discount_total,
      'total', t.total, 'cash_received', t.cash_received, 'change_due', t.change_due, 'duplicate', true
    )
    into v_existing
    from public.tickets t
    where t.client_ref = p_client_ref;
    if v_existing is not null then
      return v_existing;
    end if;
    raise;
end;
$$;

revoke execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb) from public, anon;
grant execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. El resumen de corte incluye la suma de descuentos del turno
-- ────────────────────────────────────────────────────────────

create or replace function public.cash_session_summary(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'session_id', s.id,
    'status', s.status,
    'opened_at', s.opened_at,
    'closed_at', s.closed_at,
    'opened_by', coalesce(po.full_name, po.username, ''),
    'closed_by', coalesce(pc.full_name, pc.username),
    'opening_float', s.opening_float,
    'opening_notes', s.opening_notes,
    'closing_notes', s.closing_notes,
    'expected_cash', s.expected_cash,
    'counted_cash', s.counted_cash,
    'difference', s.difference,
    'tickets_count', (select count(*) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'revenue', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'discount_total', (select coalesce(sum(t.discount_total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'cash_sales', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado' and t.payment_method = 'efectivo'),
    'cancelled_count', (select count(*) from public.tickets t where t.session_id = s.id and t.status = 'cancelado'),
    'cancelled_amount', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'cancelado'),
    'by_method', (
      select coalesce(
        jsonb_agg(jsonb_build_object('method', m.method, 'tickets', m.tickets, 'revenue', m.revenue) order by m.method),
        '[]'::jsonb
      )
      from (
        select t.payment_method::text as method, count(*) as tickets, sum(t.total) as revenue
        from public.tickets t
        where t.session_id = s.id and t.status = 'completado'
        group by t.payment_method
      ) m
    )
  )
  from public.cash_sessions s
  left join public.profiles po on po.id = s.opened_by
  left join public.profiles pc on pc.id = s.closed_by
  where s.id = p_session_id
    and auth.uid() is not null
$$;
