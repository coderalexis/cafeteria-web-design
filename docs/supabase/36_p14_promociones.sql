-- 36_p14_promociones.sql — P14: promociones por horario (migración: p14_promociones)
--
-- El análisis ya sabía que el martes a las 4 de la tarde está muerto: el mapa
-- de calor lo dice desde la migración 12. Pero ese hallazgo no tenía ninguna
-- acción pegada — el dueño lo leía y ahí se quedaba. Esto le pone la acción:
-- «martes y miércoles de 3 a 6, 20 % en frappés», y el POS la aplica solo.
--
-- ── La decisión de fondo: una promoción ES un descuento ─────────────
-- No cambia precios de línea. Cambiar `unit_price` rompería el margen (que se
-- calcula contra el precio fotografiado) y obligaría a tocar los reportes, el
-- ticket y la cancelación. Una promoción es un descuento cuya REGLA la pone el
-- dueño en vez del criterio del cajero, así que entra por la casilla que ya
-- existe: `discount_total` + `discount_reason`. Gratis: el ticket ya la
-- imprime, `sales_insights` ya agrupa descuentos por motivo, `cancel_ticket`
-- ya revierte y los reportes de margen no se enteran.
--
-- ── Lo que NO hace, a propósito ─────────────────────────────────────
-- · No se acumula con un descuento a mano ni con un premio de lealtad. El
--   ticket tiene UNA casilla de descuento, y apilar es justo donde se cuelan
--   los errores de dinero. Si la venta ya trae descuento, la promo no entra.
-- · No se acumulan dos promociones entre sí: si dos aplican, gana la que más
--   descuenta. Sin reglas de prioridad que nadie va a recordar.
-- · No cruza la medianoche (`end_hour > start_hour`). Una cafetería no corre
--   promociones de 11 pm a 2 am, y permitirlo duplicaría la lógica de horas.
--
-- ── Dónde se decide ─────────────────────────────────────────────────
-- En el SERVIDOR, dentro de `create_ticket`, y con la hora de CAPTURA
-- (`v_created`), no la de subida: una venta que estuvo en la cola sin internet
-- recibe la promoción que estaba viva cuando se cobró, no la de ahora. El POS
-- también la consulta (`promo_preview`) para poder decírselo al cliente antes
-- de cobrar, pero eso es SOLO pantalla: si difieren, manda el servidor.

-- ── 1) La tabla ────────────────────────────────────────────────────
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 60),
  -- Cuánto descuenta y cómo
  kind text not null check (kind in ('porcentaje', 'monto')),
  value numeric(10,2) not null check (value > 0 and value <= 99999),
  -- Sobre qué: toda la venta o una categoría del menú
  scope text not null check (scope in ('ticket', 'categoria')),
  category_id uuid,
  -- Cuándo: días de la semana (0 = domingo, como extract(dow)) y franja horaria
  weekdays smallint[] not null
    check (array_length(weekdays, 1) between 1 and 7
           and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  start_hour smallint not null check (start_hour between 0 and 23),
  end_hour smallint not null check (end_hour between 1 and 24),
  -- Vigencia opcional (una promoción de temporada)
  starts_on date,
  ends_on date,
  -- Compra mínima para que aplique
  min_ticket numeric(10,2) not null default 0 check (min_ticket >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint promotions_horas check (end_hour > start_hour),
  constraint promotions_vigencia check (starts_on is null or ends_on is null or ends_on >= starts_on),
  -- Una promoción de categoría necesita categoría; una de ticket no la admite
  constraint promotions_ambito check (
    (scope = 'categoria' and category_id is not null) or
    (scope = 'ticket' and category_id is null)),
  -- Un porcentaje no puede pasar de 100
  constraint promotions_porcentaje check (kind <> 'porcentaje' or value <= 100),
  -- FK COMPUESTA: la categoría tiene que ser del mismo negocio. Sin esto, una
  -- promoción podría apuntar a una categoría de otra cafetería.
  constraint promotions_categoria_fkey foreign key (category_id, business_id)
    references public.menu_categories(id, business_id) on delete restrict
);

comment on table public.promotions is
  'Descuentos automáticos por horario. El POS los muestra, pero quien decide si aplican y cuánto es create_ticket, con la hora de captura de la venta.';

create index promotions_biz_idx on public.promotions (business_id) where is_active;

create trigger set_promotions_updated_at before update on public.promotions
  for each row execute function public.set_updated_at();

alter table public.promotions enable row level security;

-- Leer sí puede el cajero: necesita saber qué promoción está corriendo para
-- decírselo al cliente. Escribir, solo dueño o administrador.
create policy promotions_select_member on public.promotions
  for select to authenticated
  using (business_id = (select public.current_business_id()));
create policy promotions_insert_admin on public.promotions
  for insert to authenticated
  with check (business_id = (select public.current_business_id())
              and (select public.current_member_role()) in ('owner','admin'));
create policy promotions_update_admin on public.promotions
  for update to authenticated
  using (business_id = (select public.current_business_id())
         and (select public.current_member_role()) in ('owner','admin'))
  with check (business_id = (select public.current_business_id())
              and (select public.current_member_role()) in ('owner','admin'));
create policy promotions_delete_admin on public.promotions
  for delete to authenticated
  using (business_id = (select public.current_business_id())
         and (select public.current_member_role()) in ('owner','admin'));

revoke all on table public.promotions from public, anon;
grant select, insert, update, delete on table public.promotions to authenticated;

-- ── 2) El ticket recuerda qué promoción lo tocó ────────────────────
-- `on delete set null`: borrar una promoción vieja no puede tumbar ventas.
alter table public.tickets
  add column promotion_id uuid references public.promotions(id) on delete set null;

create index tickets_promotion_idx on public.tickets (business_id, promotion_id)
  where promotion_id is not null;

-- ── 3) El evaluador ────────────────────────────────────────────────
--
-- Una sola función decide, y la usan los dos lados: `create_ticket` al cobrar
-- y `promo_preview` al pintar el carrito. Tener dos implementaciones —una en
-- SQL y otra en la pantalla— es garantía de que algún día digan cosas
-- distintas y el cliente reclame con razón.
--
-- No se otorga a nadie: recibe el negocio como parámetro y se llama solo desde
-- funciones que ya lo derivaron de la sesión.
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
    select p.category_id,
           round(round(v.price + coalesce(md.delta, 0), 2) * (e.elem->>'quantity')::int, 2) as importe
    from jsonb_array_elements(p_items) as e(elem)
    join public.menu_variants v on v.id = (e.elem->>'variant_id')::uuid and v.business_id = p_biz
    join public.menu_products p on p.id = v.product_id and p.business_id = p_biz
    left join lateral (
      select sum(m.price_delta) as delta
      from jsonb_array_elements_text(
        case when jsonb_typeof(e.elem->'modifiers') = 'array' then e.elem->'modifiers' else '[]'::jsonb end
      ) as sm(mid)
      join public.modifiers m on m.id = sm.mid::uuid and m.business_id = p_biz
    ) md on true
  ),
  tot as (select coalesce(sum(importe), 0) as subtotal from lineas),
  -- La hora local del negocio: una promoción de «3 a 6» es de las 3 a las 6
  -- donde está la cafetería, no en UTC.
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
  -- Si dos aplican, gana la que más descuenta; el id desempata para que dos
  -- llamadas iguales den siempre lo mismo.
  order by discount desc, pr.id
  limit 1;
$fn$;

revoke all on function public.promo_best(uuid, jsonb, timestamptz, text) from public, anon, authenticated;

-- Vista previa para el POS: mismo evaluador, negocio derivado de la sesión.
-- Es SOLO para pantalla —quien decide de verdad es create_ticket al cobrar—,
-- así que si el carrito trae basura devuelve null en vez de reventar.
create or replace function public.promo_preview(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_ctx record;
  r record;
begin
  select * into v_ctx from public.member_ctx();
  if not found then return null; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return null;
  end if;

  select * into r from public.promo_best(v_ctx.business_id, p_items, now(), v_ctx.timezone);
  if not found or coalesce(r.discount, 0) <= 0 then return null; end if;

  return jsonb_build_object('id', r.id, 'name', r.name, 'discount', r.discount);
exception when others then
  -- Una vista previa que revienta dejaría el carrito inservible por algo que
  -- ni siquiera es dinero todavía.
  return null;
end;
$fn$;

revoke execute on function public.promo_preview(jsonb) from public, anon;
grant execute on function public.promo_preview(jsonb) to authenticated;

-- ── 4) create_ticket aprende a aplicarlas ──────────────────────────
--
-- Se PARCHEA la definición viva en vez de volver a escribir la función entera.
-- `create_ticket` lleva diez revisiones (folio, idempotencia, lealtad, hora de
-- captura, para llevar, techo de descuento del cajero); retipear sus 400
-- líneas es la forma más fácil de revertir en silencio alguno de esos
-- arreglos. Cada reemplazo se comprueba antes de aplicarse: si el texto
-- esperado no está —porque la función cambió— esto falla ruidosamente en vez
-- de generar una función a medias.
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

  -- (a) variables nuevas
  v_antes := E'  r record;\nbegin\n';
  v_despues := E'  r record;\n  v_promo_id uuid;\n  v_promo_name text;\n  v_promo_disc numeric(10,2);\nbegin\n';
  if position(v_antes in v_def) = 0 then
    raise exception 'Parche (a): no encontré la declaración de variables.';
  end if;
  v_def := replace(v_def, v_antes, v_despues);

  -- (b) evaluación de la promoción, justo antes de calcular el total
  v_antes := E'  v_total := v_subtotal - v_discount;\n';
  if (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 then
    raise exception 'Parche (b): esperaba UNA sola línea de v_total.';
  end if;
  v_despues :=
    E'  -- Promoción automática. Solo si la venta no trae ya un descuento: el\n'
    '  -- ticket tiene UNA casilla de descuento y apilar promoción con descuento\n'
    '  -- a mano o con premio de lealtad es donde se cuelan los errores de\n'
    '  -- dinero. Se evalúa con la hora de CAPTURA, no la de subida, para que\n'
    '  -- una venta que esperó en la cola sin internet reciba la promoción que\n'
    '  -- estaba viva cuando se cobró.\n'
    '  if p_discount is null then\n'
    '    select b.id, b.name, b.discount into v_promo_id, v_promo_name, v_promo_disc\n'
    '    from public.promo_best(v_biz, p_items, v_created, v_ctx.timezone) b;\n'
    '    if coalesce(v_promo_disc, 0) > 0 then\n'
    '      v_discount := v_promo_disc;\n'
    '      v_discount_reason := left(''Promoción: '' || v_promo_name, 200);\n'
    '    else\n'
    '      v_promo_id := null;\n'
    '    end if;\n'
    '  end if;\n\n'
    || v_antes;
  v_def := replace(v_def, v_antes, v_despues);

  -- (c) guardar cuál promoción tocó la venta
  v_antes := 'loyalty_customer_id, loyalty_delta, takeout_fee, created_at)';
  if position(v_antes in v_def) = 0 then
    raise exception 'Parche (c1): no encontré las columnas del insert.';
  end if;
  v_def := replace(v_def, v_antes, 'loyalty_customer_id, loyalty_delta, takeout_fee, created_at, promotion_id)');

  v_antes := E'p_loyalty_customer, v_loyalty_delta, v_takeout, v_created\n';
  if position(v_antes in v_def) = 0 then
    raise exception 'Parche (c2): no encontré los valores del insert.';
  end if;
  v_def := replace(v_def, v_antes, E'p_loyalty_customer, v_loyalty_delta, v_takeout, v_created, v_promo_id\n');

  -- (d) devolverla, para que el POS pueda decir cuál se aplicó
  v_antes := E'    ''loyalty'', case when p_loyalty_customer is null then null';
  if position(v_antes in v_def) = 0 then
    raise exception 'Parche (d): no encontré el bloque de retorno.';
  end if;
  v_def := replace(v_def, v_antes,
    E'    ''promotion'', case when v_promo_id is null then null else jsonb_build_object(\n'
    '      ''id'', v_promo_id, ''name'', v_promo_name, ''discount'', v_discount) end,\n'
    || v_antes);

  execute v_def;
end;
$patch$;

-- `create or replace` conserva los grants, pero se confirman por si acaso.
revoke execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean, timestamptz) from public, anon;
grant execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean, timestamptz) to authenticated;

-- ── 5) ¿Sirvió? ────────────────────────────────────────────────────
-- Una promoción sin medición es un descuento con buenas intenciones. Esto
-- responde lo único que importa: cuántas ventas trajo, cuánto se dejó de
-- cobrar y cuánto entró de todas formas.
create or replace function public.promotions_report(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_ctx record;
  v_desde timestamptz;
begin
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo el dueño o un administrador puede ver el resultado de las promociones.';
  end if;

  v_desde := ((public.business_day(now(), v_ctx.timezone) - greatest(least(p_days, 365), 1) + 1)::timestamp)
             at time zone v_ctx.timezone;

  return jsonb_build_object(
    'days', greatest(least(p_days, 365), 1),
    'by_promotion', (
      select coalesce(jsonb_agg(x order by x_ventas desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'id', pr.id,
                 'name', pr.name,
                 'is_active', pr.is_active,
                 'tickets', count(t.id),
                 'revenue', coalesce(sum(t.total), 0),
                 'discount', coalesce(sum(t.discount_total), 0)
               ) as x,
               count(t.id) as x_ventas
        from public.promotions pr
        left join public.tickets t
          on t.promotion_id = pr.id and t.status = 'completado' and t.created_at >= v_desde
        where pr.business_id = v_ctx.business_id
        group by pr.id, pr.name, pr.is_active
      ) q
    )
  );
end;
$fn$;

revoke execute on function public.promotions_report(int) from public, anon;
grant execute on function public.promotions_report(int) to authenticated;
