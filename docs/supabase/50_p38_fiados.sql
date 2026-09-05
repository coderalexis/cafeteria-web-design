-- 50_p38_fiados.sql — P38: fiados por persona, con abonos (migración: p38_fiados).
--
-- Lo que pidió el gym: el entrenador pide varias veces y paga en quincena,
-- a veces una parte. Hasta hoy el POS solo sabía de «se fue sin pagar» (una
-- cuenta abierta marcada como fiado, migración 32): sin persona, sin
-- historial y sin abonos, y sin que la venta existiera hasta cobrarla.
--
-- El modelo:
--   · La venta a crédito ES una venta (ticket con método «fiado»), con la
--     hora y los precios del día en que se sirvió, a nombre de alguien
--     (`credit_customer_id`). No entra a la caja: como tarjeta, no es
--     efectivo del turno.
--   · Cada persona tiene su cuenta (`credit_customers`) y su saldo es la
--     resta: lo fiado (tickets completados) menos lo abonado
--     (`credit_payments`). Cancelar un ticket fiado baja la deuda solo.
--   · Un abono en efectivo entra a la caja como movimiento de entrada
--     («Abono de «Juan»») en el turno abierto, así el corte cuadra; por
--     tarjeta o transferencia solo queda en la cuenta.
--   · Es un módulo (`settings.credit`), apagado por omisión: fiar es una
--     decisión del dueño.
--
-- El «se fue sin pagar» de la 32 se queda para ese caso; esto es para el
-- cliente que pide a crédito a propósito.

-- ── 1) Cuentas de fiado ────────────────────────────────────────────
create table public.credit_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  phone text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.credit_customers is
  'Personas a las que se les fía. El saldo es lo fiado (tickets completados) menos lo abonado.';

-- Un nombre por negocio, sin importar mayúsculas: dos «Juan» serían dos deudas de la misma persona.
create unique index credit_customers_nombre_unico on public.credit_customers (business_id, lower(trim(name)));

alter table public.credit_customers enable row level security;
create policy credit_customers_select on public.credit_customers for select to authenticated
  using (business_id = (select public.current_business_id()));
-- Sin políticas de escritura: se escribe solo por RPC.
revoke all on public.credit_customers from anon;

-- ── 2) La venta fiada apunta a la persona ──────────────────────────
alter table public.tickets
  add column credit_customer_id uuid references public.credit_customers(id) on delete restrict;

alter table public.tickets add constraint tickets_fiado_con_cliente
  check ((payment_method = 'fiado') = (credit_customer_id is not null));

create index tickets_credit_customer_idx on public.tickets (credit_customer_id)
  where credit_customer_id is not null;

-- ── 3) Abonos ──────────────────────────────────────────────────────
create table public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses(id) on delete restrict,
  customer_id uuid not null references public.credit_customers(id) on delete restrict,
  amount numeric(10,2) not null check (amount > 0),
  method public.payment_method not null,
  -- En efectivo: en qué turno entró y qué movimiento de caja lo registró.
  session_id uuid references public.cash_sessions(id) on delete restrict,
  movement_id uuid references public.cash_movements(id) on delete restrict,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint credit_payments_metodo check (method <> 'fiado'),
  constraint credit_payments_efectivo_en_caja check ((method = 'efectivo') = (movement_id is not null))
);

comment on table public.credit_payments is
  'Abonos a una cuenta de fiado. Los de efectivo llevan su movimiento de entrada en la caja del turno.';

create index credit_payments_customer_idx on public.credit_payments (customer_id, created_at);
create index credit_payments_session_idx on public.credit_payments (session_id);
create index credit_payments_movement_idx on public.credit_payments (movement_id);
create index credit_payments_created_by_idx on public.credit_payments (created_by);

alter table public.credit_payments enable row level security;
create policy credit_payments_select on public.credit_payments for select to authenticated
  using (business_id = (select public.current_business_id()));
revoke all on public.credit_payments from anon;

-- ── 4) Saldo de una cuenta (interno) ───────────────────────────────
create or replace function public.credit_balance_of(p_customer uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select round(
    coalesce((select sum(t.total) from public.tickets t
              where t.credit_customer_id = p_customer and t.status = 'completado'), 0)
    - coalesce((select sum(p.amount) from public.credit_payments p where p.customer_id = p_customer), 0),
    2)
$fn$;

revoke all on function public.credit_balance_of(uuid) from public, anon, authenticated;

-- ── 5) Dar de alta (o encontrar) a quien se le fía ─────────────────
-- Cualquiera del equipo: quien toma el pedido es quien pregunta «¿a nombre
-- de quién?». Si el nombre ya existe (sin importar mayúsculas) es la misma
-- cuenta; si estaba dada de baja, revive.
create or replace function public.credit_customer_upsert(p_name text, p_phone text default null, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ctx record;
  v_biz uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_row public.credit_customers;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if not exists (select 1 from public.businesses b where b.id = v_biz and coalesce(b.settings->>'credit', 'false') = 'true') then
    raise exception 'El módulo de fiados está apagado. Se enciende en Datos y ajustes → Módulos.';
  end if;
  if length(v_name) < 1 or length(v_name) > 80 then
    raise exception 'Escribe el nombre de la persona (hasta 80 letras).';
  end if;

  select * into v_row from public.credit_customers
  where business_id = v_biz and lower(trim(name)) = lower(v_name)
  for update;
  if found then
    update public.credit_customers
    set is_active = true,
        phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
        notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
    where id = v_row.id
    returning * into v_row;
  else
    insert into public.credit_customers (business_id, name, phone, notes, created_by)
    values (v_biz, v_name, nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), v_ctx.user_id)
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'id', v_row.id, 'name', v_row.name, 'phone', v_row.phone, 'notes', v_row.notes,
    'balance', public.credit_balance_of(v_row.id)
  );
end;
$fn$;

revoke execute on function public.credit_customer_upsert(text, text, text) from public, anon;
grant execute on function public.credit_customer_upsert(text, text, text) to authenticated;

-- ── 6) Abonar ──────────────────────────────────────────────────────
create or replace function public.credit_pay(
  p_customer uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ctx record;
  v_biz uuid;
  v_cli public.credit_customers;
  v_amount numeric(10,2);
  v_balance numeric;
  v_session_id uuid;
  v_movement_id uuid;
  v_payment_id uuid;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_actor text;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if not exists (select 1 from public.businesses b where b.id = v_biz and coalesce(b.settings->>'credit', 'false') = 'true') then
    raise exception 'El módulo de fiados está apagado. Se enciende en Datos y ajustes → Módulos.';
  end if;
  if p_method is null or p_method = 'fiado' then
    raise exception 'Un abono se paga en efectivo, tarjeta o transferencia.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El abono debe ser mayor a 0.';
  end if;
  v_amount := round(p_amount, 2);
  if v_notes is not null and length(v_notes) > 120 then
    raise exception 'La nota es demasiado larga (máximo 120 caracteres).';
  end if;

  -- El candado serializa dos cajas abonando a la misma persona a la vez.
  select * into v_cli from public.credit_customers
  where id = p_customer and business_id = v_biz for update;
  if not found then
    raise exception 'Cuenta de fiado no encontrada.';
  end if;
  v_balance := public.credit_balance_of(v_cli.id);
  if v_balance <= 0 then
    raise exception '«%» no debe nada.', v_cli.name;
  end if;
  if v_amount > v_balance + 0.001 then
    raise exception '«%» solo debe $%: el abono no puede ser mayor.', v_cli.name, to_char(v_balance, 'FM999999990.00');
  end if;

  -- En efectivo el dinero entra a la caja del turno: sin caja abierta no hay
  -- dónde meterlo, y el corte de esta noche lo tiene que ver.
  if p_method = 'efectivo' then
    select id into v_session_id from public.cash_sessions where business_id = v_biz and status = 'abierta';
    if v_session_id is null then
      raise exception 'La caja está cerrada. Abre la caja para recibir el abono en efectivo.';
    end if;
    insert into public.cash_movements (business_id, session_id, kind, amount, reason, created_by)
    values (v_biz, v_session_id, 'entrada', v_amount,
            left('Abono de «' || v_cli.name || '»' || coalesce(' · ' || v_notes, ''), 200), v_ctx.user_id)
    returning id into v_movement_id;
  end if;

  insert into public.credit_payments (business_id, customer_id, amount, method, session_id, movement_id, notes, created_by)
  values (v_biz, v_cli.id, v_amount, p_method, v_session_id, v_movement_id, v_notes, v_ctx.user_id)
  returning id into v_payment_id;

  -- Bitácora en la MISMA transacción (como forgive_owed): dinero que entra
  -- a una cuenta debe quedar por escrito aunque quien lo registre sea cajero.
  select coalesce(nullif(p.full_name, ''), m.username, '') into v_actor
  from public.profiles p
  left join public.business_members m on m.user_id = p.id and m.business_id = v_biz
  where p.id = v_ctx.user_id;
  insert into public.audit_events (business_id, actor_id, actor_name, action, entity, details)
  values (v_biz, v_ctx.user_id, coalesce(v_actor, ''), 'fiado.abono', left(v_cli.name, 120),
          jsonb_build_object('customer_id', v_cli.id, 'amount', v_amount, 'method', p_method::text,
                             'balance_after', round(v_balance - v_amount, 2), 'notes', v_notes));

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'movement_id', v_movement_id,
    'customer_id', v_cli.id,
    'name', v_cli.name,
    'amount', v_amount,
    'balance', round(v_balance - v_amount, 2)
  );
end;
$fn$;

revoke execute on function public.credit_pay(uuid, numeric, public.payment_method, text) from public, anon;
grant execute on function public.credit_pay(uuid, numeric, public.payment_method, text) to authenticated;

-- ── 7) Quién debe cuánto ───────────────────────────────────────────
create or replace function public.credit_balances()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'phone', c.phone, 'notes', c.notes, 'is_active', c.is_active,
    'charged', x.charged, 'paid', x.paid, 'balance', round(x.charged - x.paid, 2),
    'tickets', x.tickets, 'last_charge_at', x.last_charge_at, 'last_payment_at', x.last_payment_at
  ) order by (x.charged - x.paid) desc, c.name), '[]'::jsonb)
  from public.credit_customers c
  cross join lateral (
    select coalesce((select sum(t.total) from public.tickets t where t.credit_customer_id = c.id and t.status = 'completado'), 0) as charged,
           coalesce((select sum(p.amount) from public.credit_payments p where p.customer_id = c.id), 0) as paid,
           (select count(*) from public.tickets t where t.credit_customer_id = c.id and t.status = 'completado') as tickets,
           (select max(t.created_at) from public.tickets t where t.credit_customer_id = c.id and t.status = 'completado') as last_charge_at,
           (select max(p.created_at) from public.credit_payments p where p.customer_id = c.id) as last_payment_at
  ) x
  where c.business_id = (select public.current_business_id())
$fn$;

revoke execute on function public.credit_balances() from public, anon;
grant execute on function public.credit_balances() to authenticated;

-- ── 8) El estado de cuenta de una persona ──────────────────────────
create or replace function public.credit_statement(p_customer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'customer', jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'notes', c.notes,
                                   'balance', public.credit_balance_of(c.id)),
    'entries', coalesce((
      select jsonb_agg(e order by (e->>'at') desc)
      from (
        select jsonb_build_object('kind', 'cargo', 'at', t.created_at, 'amount', t.total, 'folio', t.folio,
                                  'status', t.status, 'cancel_reason', t.cancel_reason, 'ticket_id', t.id,
                                  'items', (select string_agg(ti.quantity || '× ' || ti.product_name ||
                                              case when ti.variant_name <> 'Único' then ' (' || ti.variant_name || ')' else '' end, ', ' order by ti.id)
                                            from public.ticket_items ti where ti.ticket_id = t.id)) as e
        from public.tickets t where t.credit_customer_id = c.id
        union all
        select jsonb_build_object('kind', 'abono', 'at', p.created_at, 'amount', p.amount, 'method', p.method::text,
                                  'notes', p.notes, 'payment_id', p.id,
                                  'by', coalesce(nullif(pr.full_name, ''), m.username, ''))
        from public.credit_payments p
        left join public.profiles pr on pr.id = p.created_by
        left join public.business_members m on m.user_id = p.created_by and m.business_id = c.business_id
        where p.customer_id = c.id
      ) s
    ), '[]'::jsonb)
  )
  from public.credit_customers c
  where c.id = p_customer and c.business_id = (select public.current_business_id())
$fn$;

revoke execute on function public.credit_statement(uuid) from public, anon;
grant execute on function public.credit_statement(uuid) to authenticated;

-- ── 9) create_ticket v15: la venta fiada, a nombre de alguien ──────
-- Se tira la firma v14 (sin sobrecargas: PostgREST no sabría cuál llamar) y
-- se declara completa con `p_credit_customer`. Todo lo demás es la v14 tal
-- cual (líneas desde ticket_lines, promoción, lealtad, para llevar, hora de
-- captura). Lo nuevo:
--   · «fiado» exige el módulo encendido y una cuenta viva del negocio;
--     cualquier otro método rechaza que venga cuenta;
--   · la propina no se fía (se cobra al abonar, si quieren);
--   · el ticket guarda `credit_customer_id` y la respuesta trae el saldo
--     que queda, para el aviso y el ticket impreso.
drop function if exists public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean, timestamptz);

create function public.create_ticket(
  p_client_ref uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_notes text default null,
  p_cash_received numeric default null,
  p_discount jsonb default null,
  p_tip numeric default 0,
  p_loyalty_customer uuid default null,
  p_loyalty_redeem boolean default false,
  p_takeout boolean default false,
  p_captured_at timestamptz default null,
  p_credit_customer uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_ctx record;
  v_biz uuid;
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
  v_max_disc numeric;
  v_total numeric(10,2);
  v_tip numeric(10,2) := 0;
  v_due numeric(10,2);
  v_cash_received numeric(10,2);
  v_change_due numeric(10,2);
  v_ticket_id uuid;
  v_folio bigint;
  v_item_id uuid;
  v_qty int;
  v_unit numeric(10,2);
  v_loyalty public.loyalty_customers;
  v_loyalty_enabled boolean := false;
  v_loyalty_target int := 10;
  v_loyalty_delta int := 0;
  v_takeout numeric(10,2) := 0;
  v_created timestamptz := now();
  v_opened timestamptz;
  v_max_unit numeric(10,2);
  r record;
  v_promo_id uuid;
  v_promo_name text;
  v_promo_disc numeric(10,2);
  v_credit public.credit_customers;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if v_ctx.is_template then
    raise exception 'Este negocio es una plantilla y no admite ventas.';
  end if;

  if p_client_ref is null then
    raise exception 'Falta la referencia del ticket (client_ref).';
  end if;

  select jsonb_build_object(
    'ticket_id', t.id, 'folio', t.folio, 'subtotal', t.subtotal, 'discount_total', t.discount_total,
    'total', t.total, 'takeout_fee', t.takeout_fee, 'tip_amount', t.tip_amount, 'cash_received', t.cash_received,
    'change_due', t.change_due, 'duplicate', true
  )
  into v_existing
  from public.tickets t
  where t.business_id = v_biz and t.client_ref = p_client_ref;
  if v_existing is not null then
    return v_existing;
  end if;

  select id into v_session_id from public.cash_sessions where business_id = v_biz and status = 'abierta';
  if v_session_id is null then
    raise exception 'La caja está cerrada. Abre la caja antes de cobrar.';
  end if;

  -- ── Fiado: a nombre de alguien, con el módulo encendido ───────────
  if p_payment_method = 'fiado' then
    if not exists (select 1 from public.businesses b where b.id = v_biz and coalesce(b.settings->>'credit', 'false') = 'true') then
      raise exception 'El módulo de fiados está apagado. Se enciende en Datos y ajustes → Módulos.';
    end if;
    if p_credit_customer is null then
      raise exception 'Un fiado va a nombre de alguien: elige o escribe quién.';
    end if;
    select * into v_credit from public.credit_customers
    where id = p_credit_customer and business_id = v_biz and is_active for update;
    if not found then
      raise exception 'Cuenta de fiado no encontrada.';
    end if;
    if coalesce(p_tip, 0) > 0 then
      raise exception 'La propina no se fía: se deja al abonar.';
    end if;
  elsif p_credit_customer is not null then
    raise exception 'Solo una venta fiada lleva cuenta de fiado.';
  end if;

  if p_captured_at is not null then
    -- Venta capturada sin internet y subida después: vale la hora REAL de la
    -- venta, no la de la subida (si no, el reporte por horas y el día de
    -- operación mienten). Tres candados: nada del futuro, nada de hace más de
    -- 24 h, y nada anterior al turno abierto — una venta de un turno ya
    -- cerrado no puede colarse en el corte de este.
    v_created := p_captured_at;
    if v_created > now() + interval '2 minutes' then
      raise exception 'La hora de captura está en el futuro.';
    end if;
    if v_created < now() - interval '24 hours' then
      raise exception 'La venta es de hace más de 24 horas: regístrala a mano.';
    end if;
    select opened_at into v_opened from public.cash_sessions where id = v_session_id;
    if v_created < v_opened then
      raise exception 'Esta venta se capturó en un turno anterior que ya se cerró: regístrala a mano.';
    end if;
    if v_created > now() then v_created := now(); end if;
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

  select count(*) into v_input_count from jsonb_array_elements(p_items);

  select count(*) into v_valid_count
  from jsonb_array_elements(p_items) as e(elem)
  join public.menu_variants v
    on v.id = (elem->>'variant_id')::uuid and v.is_active and v.business_id = v_biz
  join public.menu_products p
    on p.id = v.product_id and p.is_active and p.business_id = v_biz;

  if v_valid_count <> v_input_count then
    raise exception 'Uno o más artículos no existen o están inactivos.';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
  ) as sm(mid)
  left join public.modifiers m on m.id = sm.mid::uuid and m.is_active and m.business_id = v_biz
  left join public.modifier_groups g on g.id = m.group_id and g.is_active and g.business_id = v_biz
  left join public.menu_variants v on v.id = (elem->>'variant_id')::uuid and v.business_id = v_biz
  left join public.product_modifier_groups pmg
    on pmg.group_id = g.id and pmg.product_id = v.product_id and pmg.business_id = v_biz
  where m.id is null or g.id is null or pmg.product_id is null;
  if v_bad > 0 then
    raise exception 'Uno o más modificadores no existen o no aplican al producto.';
  end if;

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

  select count(*) into v_bad
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  join public.menu_variants v on v.id = (elem->>'variant_id')::uuid and v.business_id = v_biz
  join public.product_modifier_groups pmg on pmg.product_id = v.product_id and pmg.business_id = v_biz
  join public.modifier_groups g on g.id = pmg.group_id and g.is_active and g.business_id = v_biz
  cross join lateral (
    select count(*) as cnt
    from jsonb_array_elements_text(
      case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
    ) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz
    where m.group_id = g.id
  ) c
  where c.cnt < greatest(g.min_select, case when g.is_required then 1 else 0 end)
     or (g.max_select is not null and c.cnt > g.max_select);
  if v_bad > 0 then
    raise exception 'Faltan o sobran opciones en un grupo de modificadores.';
  end if;

  -- Una sola forma de poner precio a un carrito (migración 40).
  select coalesce(round(sum(line_total), 2), 0) into v_subtotal
  from public.ticket_lines(v_biz, p_items);

  if coalesce(p_loyalty_redeem, false) and p_loyalty_customer is null then
    raise exception 'Falta el cliente de lealtad para canjear el premio.';
  end if;
  if p_loyalty_customer is not null then
    select coalesce(b.settings->>'loyalty', 'false') = 'true',
           greatest(2, least(30, coalesce((b.settings->>'loyalty_target')::int, 10)))
    into v_loyalty_enabled, v_loyalty_target
    from public.businesses b where b.id = v_biz;
    if not v_loyalty_enabled then
      raise exception 'El módulo de lealtad está apagado en este negocio.';
    end if;

    select * into v_loyalty from public.loyalty_customers
    where id = p_loyalty_customer and business_id = v_biz
    for update;
    if not found then
      raise exception 'Cliente de lealtad no encontrado.';
    end if;

    if coalesce(p_loyalty_redeem, false) then
      if v_loyalty.stamps < v_loyalty_target then
        raise exception 'Este cliente lleva % de % sellos: aún no hay premio que canjear.',
          v_loyalty.stamps, v_loyalty_target;
      end if;
      if p_discount is null then
        raise exception 'El canje del premio va como descuento del artículo gratis: falta el descuento.';
      end if;
      v_loyalty_delta := -v_loyalty_target;
    else
      v_loyalty_delta := 1;
    end if;
  end if;

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

    if v_ctx.member_role = 'cajero' and not coalesce(p_loyalty_redeem, false) then
      select coalesce((b.settings->>'discount_max_cashier')::numeric, 100)
      into v_max_disc
      from businesses b where b.id = v_biz;
      if v_max_disc <= 0 then
        raise exception 'Los descuentos los aplica un administrador.';
      end if;
      if v_subtotal > 0 and (v_discount * 100 / v_subtotal) > v_max_disc + 0.001 then
        raise exception 'El descuento supera el máximo permitido en caja (% %%).', round(v_max_disc, 2);
      end if;
    end if;
  end if;

  if p_loyalty_customer is not null and coalesce(p_loyalty_redeem, false) then
    if v_discount_type is distinct from 'amount' or v_discount <= 0 then
      raise exception 'El premio de lealtad se canjea como descuento de monto fijo.';
    end if;
    if v_discount_reason is distinct from 'Premio de lealtad' then
      raise exception 'El motivo del descuento de canje debe ser «Premio de lealtad».';
    end if;
    select max(round(v.price + coalesce(md.delta, 0), 2)) into v_max_unit
    from jsonb_array_elements(p_items) as e(elem)
    join public.menu_variants v on v.id = (elem->>'variant_id')::uuid and v.business_id = v_biz
    left join lateral (
      select sum(m.price_delta) as delta
      from jsonb_array_elements_text(
        case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
      ) as sm(mid)
      join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz
    ) md on true;
    if v_discount > v_max_unit + 0.001 then
      raise exception 'El premio (%) no puede valer más que el artículo más caro del ticket (%).',
        v_discount, v_max_unit;
    end if;
  end if;

  -- Promoción automática. Solo si la venta no trae ya un descuento: el
  -- ticket tiene UNA casilla de descuento y apilar promoción con descuento
  -- a mano o con premio de lealtad es donde se cuelan los errores de
  -- dinero. Se evalúa con la hora de CAPTURA, no la de subida, para que
  -- una venta que esperó en la cola sin internet reciba la promoción que
  -- estaba viva cuando se cobró.
  if p_discount is null then
    select b.id, b.name, b.discount into v_promo_id, v_promo_name, v_promo_disc
    from public.promo_best(v_biz, p_items, v_created, v_ctx.timezone) b;
    if coalesce(v_promo_disc, 0) > 0 then
      v_discount := v_promo_disc;
      v_discount_reason := left('Promoción: ' || v_promo_name, 200);
    else
      v_promo_id := null;
    end if;
  end if;

  v_total := v_subtotal - v_discount;

  if p_takeout then
    -- Cargo por «Para llevar»: el MONTO lo dictan los ajustes del negocio,
    -- nunca el cliente — el POS solo manda la bandera. Tope de 100 por si
    -- los ajustes traen basura. Va después del descuento a propósito: el
    -- cargo del empaque no se descuenta.
    select least(greatest(coalesce((b.settings->>'takeout_fee')::numeric, 0), 0), 100)
      into v_takeout
    from public.businesses b where b.id = v_biz;
    v_takeout := round(coalesce(v_takeout, 0), 2);
    v_total := v_total + v_takeout;
  end if;

  if p_tip is not null then
    v_tip := round(p_tip, 2);
    if v_tip < 0 then
      raise exception 'La propina no puede ser negativa.';
    end if;
    if v_tip > greatest(v_total, 0) * 2 + 1000 then
      raise exception 'La propina es demasiado alta para este ticket.';
    end if;
  end if;

  v_due := v_total + v_tip;

  if p_payment_method = 'efectivo' and p_cash_received is not null then
    v_cash_received := round(p_cash_received, 2);
    if v_cash_received < v_due then
      raise exception 'El efectivo recibido (%) es menor que el total a pagar (%).', v_cash_received, v_due;
    end if;
    v_change_due := round(v_cash_received - v_due, 2);
  end if;

  update public.business_counters
  set next_folio = next_folio + 1
  where business_id = v_biz
  returning next_folio - 1 into v_folio;
  if v_folio is null then
    raise exception 'Falta el contador de folios del negocio.';
  end if;

  insert into public.tickets
    (business_id, folio, cashier_id, session_id, payment_method, subtotal, discount_total, discount_reason, total,
     tip_amount, notes, client_ref, cash_received, change_due, loyalty_customer_id, loyalty_delta, takeout_fee, created_at, promotion_id,
     credit_customer_id)
  values (
    v_biz, v_folio, v_ctx.user_id, v_session_id, p_payment_method, v_subtotal, v_discount, v_discount_reason, v_total,
    v_tip, nullif(trim(coalesce(p_notes, '')), ''), p_client_ref, v_cash_received, v_change_due,
    p_loyalty_customer, v_loyalty_delta, v_takeout, v_created, v_promo_id,
    case when p_payment_method = 'fiado' then p_credit_customer else null end
  )
  returning id into v_ticket_id;

  for r in
    select * from public.ticket_lines(v_biz, p_items)
  loop
    v_qty := r.quantity;
    v_unit := r.unit_price;

    insert into public.ticket_items
      (business_id, ticket_id, product_id, variant_id, quantity, unit_price, line_total, notes,
       product_name, variant_name, size_label, unit_cost)
    values (
      v_biz, v_ticket_id, r.product_id, r.variant_id, v_qty, v_unit, r.line_total,
      r.notes,
      r.product_name, r.variant_name, r.size_label, r.unit_cost
    )
    returning id into v_item_id;

    insert into public.ticket_item_modifiers (business_id, ticket_item_id, modifier_id, modifier_name, modifier_price)
    select v_biz, v_item_id, m.id, m.name, m.price_delta
    from jsonb_array_elements_text(r.modifier_ids) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz
    order by m.sort_order, m.name;
  end loop;

  if p_loyalty_customer is not null then
    update public.loyalty_customers
    set stamps = stamps + v_loyalty_delta,
        visits = visits + 1,
        rewards_redeemed = rewards_redeemed + case when coalesce(p_loyalty_redeem, false) then 1 else 0 end,
        last_visit_at = now()
    where id = p_loyalty_customer;
  end if;

  return jsonb_build_object(
    'ticket_id', v_ticket_id,
    'folio', v_folio,
    'subtotal', v_subtotal,
    'discount_total', v_discount,
    'total', v_total,
    'takeout_fee', v_takeout,
    'tip_amount', v_tip,
    'cash_received', v_cash_received,
    'change_due', v_change_due,
    'promotion', case when v_promo_id is null then null else jsonb_build_object(
      'id', v_promo_id, 'name', v_promo_name, 'discount', v_discount) end,
    'loyalty', case when p_loyalty_customer is null then null else jsonb_build_object(
      'customer_id', v_loyalty.id,
      'name', v_loyalty.name,
      'phone', v_loyalty.phone,
      'stamps', v_loyalty.stamps + v_loyalty_delta,
      'target', v_loyalty_target,
      'redeemed', coalesce(p_loyalty_redeem, false)
    ) end,
    'credit', case when p_payment_method <> 'fiado' then null else jsonb_build_object(
      'customer_id', v_credit.id,
      'name', v_credit.name,
      'balance', public.credit_balance_of(v_credit.id)
    ) end
  );

exception
  when unique_violation then
    select jsonb_build_object(
      'ticket_id', t.id, 'folio', t.folio, 'subtotal', t.subtotal, 'discount_total', t.discount_total,
      'total', t.total, 'takeout_fee', t.takeout_fee, 'tip_amount', t.tip_amount, 'cash_received', t.cash_received,
      'change_due', t.change_due, 'duplicate', true
    )
    into v_existing
    from public.tickets t
    where t.business_id = v_biz and t.client_ref = p_client_ref;
    if v_existing is not null then
      return v_existing;
    end if;
    raise;
end;
$function$;

revoke execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean, timestamptz, uuid) from public, anon;
grant execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean, timestamptz, uuid) to authenticated;

-- ── 10) correct_ticket v2: corregir también una venta fiada ────────
drop function if exists public.correct_ticket(uuid, uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean);

create function public.correct_ticket(
  p_original uuid,
  p_client_ref uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_notes text default null,
  p_cash_received numeric default null,
  p_discount jsonb default null,
  p_tip numeric default 0,
  p_loyalty_customer uuid default null,
  p_loyalty_redeem boolean default false,
  p_takeout boolean default false,
  p_credit_customer uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_orig public.tickets;
  v_session_status text;
  v_repetida jsonb;
  v_nuevo jsonb;
  v_nuevo_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if p_client_ref is null then
    raise exception 'Falta la referencia del ticket (client_ref).';
  end if;

  select * into v_orig from public.tickets
  where id = p_original and business_id = v_biz for update;
  if not found then
    raise exception 'Ticket no encontrado.';
  end if;

  select jsonb_build_object(
    'ticket_id', t.id, 'folio', t.folio, 'subtotal', t.subtotal, 'discount_total', t.discount_total,
    'total', t.total, 'takeout_fee', t.takeout_fee, 'tip_amount', t.tip_amount, 'cash_received', t.cash_received,
    'change_due', t.change_due, 'duplicate', true,
    'corrected_from', v_orig.id, 'original_folio', v_orig.folio
  )
  into v_repetida
  from public.tickets t
  where t.business_id = v_biz and t.client_ref = p_client_ref and t.corrected_from = v_orig.id;
  if v_repetida is not null then
    return v_repetida;
  end if;

  if v_orig.status <> 'completado' then
    raise exception 'Esa venta ya está cancelada; cóbrala de nuevo como una venta normal.';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') and v_orig.cashier_id <> v_ctx.user_id then
    raise exception 'Solo puedes corregir tus propias ventas.';
  end if;
  select status into v_session_status from public.cash_sessions where id = v_orig.session_id;
  if v_session_status is distinct from 'abierta' then
    raise exception 'La caja de esa venta ya se cerró: ya no se puede corregir, solo cancelar.';
  end if;

  perform public.cancel_ticket(v_orig.id, 'Corregida');

  v_nuevo := public.create_ticket(
    p_client_ref, p_payment_method, p_items, p_notes, p_cash_received, p_discount, p_tip,
    p_loyalty_customer, p_loyalty_redeem, p_takeout, v_orig.created_at, p_credit_customer
  );
  v_nuevo_id := (v_nuevo->>'ticket_id')::uuid;
  update public.tickets set corrected_from = v_orig.id where id = v_nuevo_id;

  update public.tickets
  set cancel_reason = 'Corregida: ahora es el ticket #' || (v_nuevo->>'folio')
  where id = v_orig.id;

  return v_nuevo || jsonb_build_object('corrected_from', v_orig.id, 'original_folio', v_orig.folio);
end;
$$;

revoke execute on function public.correct_ticket(uuid, uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean, uuid) from public, anon;
grant execute on function public.correct_ticket(uuid, uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean, uuid) to authenticated;

-- ── 11) El corte ve lo fiado y los abonos ──────────────────────────
-- `credit_sales`: ventas del turno que no entraron a la caja por ser fiado.
-- `credit_paid_cash`: abonos en efectivo del turno (ya están en
-- movements_in; se desglosan para que el corte lo diga con palabras).
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
    'opened_by', coalesce(po.full_name, mo.username, ''),
    'closed_by', coalesce(pc.full_name, mc.username),
    'opening_float', s.opening_float,
    'opening_notes', s.opening_notes,
    'closing_notes', s.closing_notes,
    'expected_cash', s.expected_cash,
    'counted_cash', s.counted_cash,
    'difference', s.difference,
    'count_detail', s.count_detail,
    'next_float', s.next_float,
    'tickets_count', (select count(*) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'revenue', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'discount_total', (select coalesce(sum(t.discount_total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'cash_sales', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado' and t.payment_method = 'efectivo'),
    'tips_total', (select coalesce(sum(t.tip_amount), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'cash_tips', (select coalesce(sum(t.tip_amount), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado' and t.payment_method = 'efectivo'),
    'credit_sales', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado' and t.payment_method = 'fiado'),
    'credit_paid_cash', (select coalesce(sum(p.amount), 0) from public.credit_payments p where p.session_id = s.id and p.method = 'efectivo'),
    'cancelled_count', (select count(*) from public.tickets t where t.session_id = s.id and t.status = 'cancelado'),
    'cancelled_amount', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'cancelado'),
    'movements_in', (select coalesce(sum(m.amount), 0) from public.cash_movements m where m.session_id = s.id and m.kind = 'entrada'),
    'movements_out', (select coalesce(sum(m.amount), 0) from public.cash_movements m where m.session_id = s.id and m.kind = 'salida'),
    'movements', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', m.id, 'kind', m.kind, 'amount', m.amount, 'reason', m.reason,
          'created_at', m.created_at,
          'created_by', coalesce(pm.full_name, mm.username, '')
        ) order by m.created_at),
        '[]'::jsonb
      )
      from public.cash_movements m
      left join public.profiles pm on pm.id = m.created_by
      left join public.business_members mm on mm.user_id = m.created_by and mm.business_id = s.business_id
      where m.session_id = s.id
    ),
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
  left join public.business_members mo on mo.user_id = s.opened_by and mo.business_id = s.business_id
  left join public.profiles pc on pc.id = s.closed_by
  left join public.business_members mc on mc.user_id = s.closed_by and mc.business_id = s.business_id
  where s.id = p_session_id
    and s.business_id = (select public.current_business_id())
$$;

-- ── 12) delete_business v4: las dos tablas nuevas entran al borrado ──
-- (La lección de la 26: toda tabla nueva con business_id DEBE entrar aquí,
-- o borrar una cafetería con fiados fallaría por la FK.)
create or replace function public.delete_business(
  p_business_id uuid,
  p_slug text,
  p_actor uuid default null,
  p_actor_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_biz record;
  v_summary jsonb;
  v_orphans uuid[];
begin
  select id, slug, name, is_template into v_biz
  from businesses where id = p_business_id;
  if not found then
    raise exception 'Cafetería no encontrada.';
  end if;
  if v_biz.slug is distinct from p_slug then
    raise exception 'La confirmación no coincide con la cafetería.';
  end if;

  v_summary := jsonb_build_object(
    'tickets', (select count(*) from tickets where business_id = p_business_id),
    'ventas_total', (select coalesce(sum(total), 0) from tickets where business_id = p_business_id and status = 'completado'),
    'cortes', (select count(*) from cash_sessions where business_id = p_business_id),
    'categorias', (select count(*) from menu_categories where business_id = p_business_id),
    'productos', (select count(*) from menu_products where business_id = p_business_id),
    'variantes', (select count(*) from menu_variants where business_id = p_business_id),
    'miembros', (select count(*) from business_members where business_id = p_business_id),
    'eventos_bitacora', (select count(*) from audit_events where business_id = p_business_id),
    'clientes_lealtad', (select count(*) from loyalty_customers where business_id = p_business_id),
    'cuentas_fiado', (select count(*) from credit_customers where business_id = p_business_id),
    'era_plantilla', v_biz.is_template
  );

  select coalesce(array_agg(m.user_id), '{}')
  into v_orphans
  from business_members m
  join profiles p on p.id = m.user_id
  where m.business_id = p_business_id
    and m.user_id is distinct from p_actor
    and not coalesce(p.is_platform_admin, false)
    and not exists (
      select 1 from business_members o
      where o.user_id = m.user_id and o.business_id <> p_business_id
    );

  delete from credit_payments where business_id = p_business_id;
  delete from ticket_item_modifiers where business_id = p_business_id;
  delete from ticket_items where business_id = p_business_id;
  delete from tickets where business_id = p_business_id;
  delete from credit_customers where business_id = p_business_id;
  delete from loyalty_customers where business_id = p_business_id;
  delete from parked_orders where business_id = p_business_id;
  -- Tres tablas con `on delete restrict` que llegaron después de la v3 y
  -- nadie metió aquí: borrar una cafetería con promociones o gastos fallaba.
  delete from promotions where business_id = p_business_id;
  delete from expenses where business_id = p_business_id;
  delete from fixed_expenses where business_id = p_business_id;
  delete from cash_movements where business_id = p_business_id;
  delete from cash_sessions where business_id = p_business_id;
  delete from product_modifier_groups where business_id = p_business_id;
  delete from modifiers where business_id = p_business_id;
  delete from modifier_groups where business_id = p_business_id;
  delete from menu_variants where business_id = p_business_id;
  delete from menu_products where business_id = p_business_id;
  delete from menu_categories where business_id = p_business_id;
  delete from audit_events where business_id = p_business_id;
  delete from member_pins where business_id = p_business_id;
  delete from business_members where business_id = p_business_id;
  delete from business_counters where business_id = p_business_id;

  update profiles set active_business_id = null where active_business_id = p_business_id;

  delete from businesses where id = p_business_id;

  insert into deleted_businesses (business_id, slug, name, deleted_by, deleted_by_name, summary)
  values (p_business_id, v_biz.slug, v_biz.name, p_actor, coalesce(p_actor_name, ''), v_summary);

  return jsonb_build_object(
    'slug', v_biz.slug,
    'name', v_biz.name,
    'summary', v_summary,
    'orphan_user_ids', v_orphans
  );
end;
$$;
