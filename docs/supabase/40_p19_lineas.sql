-- 40_p19_lineas.sql — P19: el precio de cada línea se calcula en UN solo
-- lugar del servidor (migración: p19_lineas). Punto 8 de la auditoría.
--
-- Hasta hoy el subtotal de una venta se calculaba tres veces: en el carrito
-- (para pintarlo), en `promo_best` (para saber cuánto descuenta la promo) y
-- en `create_ticket` (para cobrarlo). Las dos de SQL eran copias del mismo
-- CTE — precio de la variante más la suma de extras, redondeado, por
-- cantidad — y una copia es una promesa de que algún día difieran: el POS
-- diría un total y se cobraría otro.
--
-- `ticket_lines(p_biz, p_items)` es ahora la única función que convierte el
-- JSON del carrito en líneas con precio. La usan:
--   · `promo_best`, para la base del descuento (toda la venta o una categoría),
--   · `create_ticket`, para el subtotal Y para grabar los renglones del ticket.
-- El carrito de la pantalla sigue con su propia suma —no puede llamar a SQL
-- para pintar cada tecla— pero es un espejo: quien manda es esto, y las
-- pruebas (tests/sql/t_08 y tests/unit/cart) fijan que digan lo mismo.
--
-- Qué NO cambia: ninguna validación. Existencia, activo, extras que aplican
-- al producto, mínimos y máximos de cada grupo, techo del cajero, lealtad,
-- propina, hora de captura y promoción siguen exactamente donde estaban.
-- Solo se quita el cálculo repetido. La suite SQL (t_02, t_03) es la que
-- garantiza que el resultado es el mismo peso por peso.

-- ── 1) Una sola forma de poner precio a un carrito ─────────────────
-- No se otorga a nadie: recibe el negocio como parámetro y la llaman solo
-- funciones que ya lo derivaron de la sesión.
create or replace function public.ticket_lines(p_biz uuid, p_items jsonb)
returns table (
  idx bigint,
  variant_id uuid,
  product_id uuid,
  category_id uuid,
  product_name text,
  variant_name text,
  size_label text,
  quantity int,
  unit_price numeric,
  line_total numeric,
  unit_cost numeric,
  notes text,
  modifier_ids jsonb
)
language sql
stable
security definer
set search_path = public
as $fn$
  select e.idx,
         v.id,
         p.id,
         p.category_id,
         p.name,
         v.name,
         v.size_label,
         (e.elem->>'quantity')::int,
         round(v.price + coalesce(md.delta, 0), 2),
         round(round(v.price + coalesce(md.delta, 0), 2) * (e.elem->>'quantity')::int, 2),
         v.cost,
         nullif(trim(coalesce(e.elem->>'notes', '')), ''),
         case when jsonb_typeof(e.elem->'modifiers') = 'array' then e.elem->'modifiers' else '[]'::jsonb end
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  join public.menu_variants v on v.id = (e.elem->>'variant_id')::uuid and v.business_id = p_biz
  join public.menu_products p on p.id = v.product_id and p.business_id = p_biz
  left join lateral (
    select sum(m.price_delta) as delta
    from jsonb_array_elements_text(
      case when jsonb_typeof(e.elem->'modifiers') = 'array' then e.elem->'modifiers' else '[]'::jsonb end
    ) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid and m.business_id = p_biz
  ) md on true
  order by e.idx
$fn$;

revoke all on function public.ticket_lines(uuid, jsonb) from public, anon, authenticated;

-- ── 2) promo_best sobre las mismas líneas ──────────────────────────
create or replace function public.promo_best(
  p_biz uuid,
  p_items jsonb,
  p_when timestamptz,
  p_tz text
) returns table (id uuid, name text, discount numeric)
language sql
stable
security definer
set search_path = public
as $fn$
  with lineas as (
    select category_id, line_total as importe from public.ticket_lines(p_biz, p_items)
  ),
  tot as (select coalesce(sum(importe), 0) as subtotal from lineas),
  loc as (select (p_when at time zone p_tz) as t)
  select pr.id,
         pr.name,
         least(
           round(case when pr.kind = 'porcentaje' then base.monto * pr.value / 100 else pr.value end, 2),
           base.monto
         )::numeric(10,2) as discount
  from public.promotions pr
  cross join loc
  cross join tot
  cross join lateral (
    select case
             when pr.scope = 'ticket' then tot.subtotal
             else coalesce((select sum(l.importe) from lineas l where l.category_id = pr.category_id), 0)
           end as monto
  ) base
  where pr.business_id = p_biz
    and pr.is_active
    and (pr.starts_on is null or loc.t::date >= pr.starts_on)
    and (pr.ends_on is null or loc.t::date <= pr.ends_on)
    and extract(dow from loc.t)::smallint = any(pr.weekdays)
    and extract(hour from loc.t)::int >= pr.start_hour
    and extract(hour from loc.t)::int < pr.end_hour
    and tot.subtotal >= pr.min_ticket
    and base.monto > 0
  order by discount desc, pr.id
  limit 1;
$fn$;

revoke all on function public.promo_best(uuid, jsonb, timestamptz, text) from public, anon, authenticated;

-- ── 3) create_ticket v14: mismo comportamiento, un solo cálculo ────
-- Se PARCHEA la definición viva (v13 = v12 + promociones) con dos reemplazos
-- comprobados, igual que en la 36: retipear la función entera es la forma
-- más fácil de revertir un arreglo en silencio.
--   (a) el subtotal sale de ticket_lines;
--   (b) los renglones del ticket se graban desde ticket_lines.
do $patch$
declare
  v_def text;
  v_antes text;
  v_despues text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_ticket';
  if v_def is null then
    raise exception 'No encontré create_ticket.';
  end if;

  -- (a) subtotal
  v_antes :=
    E'  select round(sum(round(v.price + coalesce(md.delta, 0), 2) * (elem->>''quantity'')::int), 2)\n'
    '  into v_subtotal\n'
    '  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)\n'
    '  join public.menu_variants v on v.id = (elem->>''variant_id'')::uuid and v.business_id = v_biz\n'
    '  left join lateral (\n'
    '    select sum(m.price_delta) as delta\n'
    '    from jsonb_array_elements_text(\n'
    '      case when jsonb_typeof(elem->''modifiers'') = ''array'' then elem->''modifiers'' else ''[]''::jsonb end\n'
    '    ) as sm(mid)\n'
    '    join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz\n'
    '  ) md on true;\n';
  if position(v_antes in v_def) = 0 then
    raise exception 'Parche (a): no encontré el cálculo del subtotal.';
  end if;
  v_despues :=
    E'  -- Una sola forma de poner precio a un carrito (migración 40).\n'
    '  select coalesce(round(sum(line_total), 2), 0) into v_subtotal\n'
    '  from public.ticket_lines(v_biz, p_items);\n';
  v_def := replace(v_def, v_antes, v_despues);

  -- (b) renglones
  v_antes :=
    E'  for r in\n'
    '    select\n'
    '      e.elem,\n'
    '      e.idx,\n'
    '      v.id as variant_id,\n'
    '      v.price,\n'
    '      v.cost,\n'
    '      v.name as variant_name,\n'
    '      v.size_label,\n'
    '      p.id as product_id,\n'
    '      p.name as product_name,\n'
    '      case when jsonb_typeof(e.elem->''modifiers'') = ''array'' then e.elem->''modifiers'' else ''[]''::jsonb end as mods,\n'
    '      coalesce((\n'
    '        select sum(m.price_delta)\n'
    '        from jsonb_array_elements_text(\n'
    '          case when jsonb_typeof(e.elem->''modifiers'') = ''array'' then e.elem->''modifiers'' else ''[]''::jsonb end\n'
    '        ) as sm(mid)\n'
    '        join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz\n'
    '      ), 0) as delta\n'
    '    from jsonb_array_elements(p_items) with ordinality as e(elem, idx)\n'
    '    join public.menu_variants v on v.id = (e.elem->>''variant_id'')::uuid and v.business_id = v_biz\n'
    '    join public.menu_products p on p.id = v.product_id and p.business_id = v_biz\n'
    '    order by e.idx\n'
    '  loop\n'
    '    v_qty := (r.elem->>''quantity'')::int;\n'
    '    v_unit := round(r.price + r.delta, 2);\n'
    '\n'
    '    insert into public.ticket_items\n'
    '      (business_id, ticket_id, product_id, variant_id, quantity, unit_price, line_total, notes,\n'
    '       product_name, variant_name, size_label, unit_cost)\n'
    '    values (\n'
    '      v_biz, v_ticket_id, r.product_id, r.variant_id, v_qty, v_unit, round(v_unit * v_qty, 2),\n'
    '      nullif(trim(coalesce(r.elem->>''notes'', '''')), ''''),\n'
    '      r.product_name, r.variant_name, r.size_label, r.cost\n'
    '    )\n'
    '    returning id into v_item_id;\n'
    '\n'
    '    insert into public.ticket_item_modifiers (business_id, ticket_item_id, modifier_id, modifier_name, modifier_price)\n'
    '    select v_biz, v_item_id, m.id, m.name, m.price_delta\n'
    '    from jsonb_array_elements_text(r.mods) as sm(mid)\n';
  if position(v_antes in v_def) = 0 then
    raise exception 'Parche (b): no encontré el bucle de renglones.';
  end if;
  v_despues :=
    E'  for r in\n'
    '    select * from public.ticket_lines(v_biz, p_items)\n'
    '  loop\n'
    '    v_qty := r.quantity;\n'
    '    v_unit := r.unit_price;\n'
    '\n'
    '    insert into public.ticket_items\n'
    '      (business_id, ticket_id, product_id, variant_id, quantity, unit_price, line_total, notes,\n'
    '       product_name, variant_name, size_label, unit_cost)\n'
    '    values (\n'
    '      v_biz, v_ticket_id, r.product_id, r.variant_id, v_qty, v_unit, r.line_total,\n'
    '      r.notes,\n'
    '      r.product_name, r.variant_name, r.size_label, r.unit_cost\n'
    '    )\n'
    '    returning id into v_item_id;\n'
    '\n'
    '    insert into public.ticket_item_modifiers (business_id, ticket_item_id, modifier_id, modifier_name, modifier_price)\n'
    '    select v_biz, v_item_id, m.id, m.name, m.price_delta\n'
    '    from jsonb_array_elements_text(r.modifier_ids) as sm(mid)\n';
  v_def := replace(v_def, v_antes, v_despues);

  execute v_def;
end;
$patch$;

revoke execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean, timestamptz) from public, anon;
grant execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean, timestamptz) to authenticated;
