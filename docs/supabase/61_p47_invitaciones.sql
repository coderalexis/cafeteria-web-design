-- 61 · p47 · Invitaciones al equipo, con aceptación
--
-- Problema (revisión general del 2026-11-04). «Agregar por correo» en Equipo
-- metía a la persona al café SIN preguntarle:
--   · Si el correo ya tenía cuenta, la membresía se creaba al instante: el
--     admin de cualquier café podía meter a cualquier persona del sistema (un
--     dueño de otra cafetería, por ejemplo) a la suya, y si esa persona no
--     tenía negocio activo, el ajeno pasaba a ser el suyo.
--   · La respuesta revelaba si un correo tenía cuenta en el sistema («ya
--     tiene cuenta, solo se le dio acceso» contra «se creó con contraseña
--     temporal»).
--   · Si no tenía cuenta, el admin creaba una A NOMBRE DE ese correo con una
--     contraseña que él conocía, sin que el dueño del correo supiera nada.
-- (La parte grave, cambiarle el correo o la contraseña a una cuenta ajena, ya
-- la cerró #86; esto cierra la puerta por la que se entraba.)
--
-- Decisión. Agregar por correo ya no agrega: INVITA. Se manda un correo con
-- un enlace de un solo uso, válido 7 días; la persona entra a /invitacion,
-- ve qué café la invita y con qué rol, y decide:
--   · con cuenta: entra con su contraseña y acepta;
--   · sin cuenta: pone su nombre y SU contraseña (abrir el enlace del correo
--     prueba que el correo es suyo).
-- La respuesta al admin es la misma tenga o no cuenta el correo. Las cuentas
-- de café (usuario + contraseña) no cambian: esas sí las crea el admin,
-- porque no son de nadie más.
--
-- Tabla. Solo la toca el servidor (service role, como el resto de Equipo):
-- RLS encendido y sin políticas. El enlace lleva un token al azar; aquí solo
-- se guarda su sha256, así que quien lea la tabla no puede aceptar nada.
-- Una sola invitación viva por café y correo (reenviar = rotar el token de la
-- misma fila). Entra en delete_business (regla del repo).

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses (id) on delete restrict,
  email text not null
    check (email = lower(btrim(email)) and length(email) between 3 and 254),
  full_name text not null default '' check (length(full_name) <= 80),
  role public.business_role not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references public.profiles (id) on delete set null,
  invited_by_name text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz
);

-- Una sola invitación viva (ni aceptada ni cancelada) por café y correo.
create unique index team_invitations_viva
  on public.team_invitations (business_id, email)
  where accepted_at is null and revoked_at is null;

-- Para la lista de Equipo y para contar los envíos del día (tope anti-spam).
create index team_invitations_business_sent
  on public.team_invitations (business_id, sent_at desc);

alter table public.team_invitations enable row level security;
revoke all on public.team_invitations from anon, authenticated;

comment on table public.team_invitations is
  'Invitaciones al equipo por correo, con aceptación de la persona invitada. Solo service role; guarda el sha256 del token, nunca el token.';

-- ── Borrar la cafetería se lleva también sus invitaciones ─────────────
do $$
declare
  v_def text;
  v_ancla text := '  delete from supplies where business_id = p_business_id;';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'delete_business';
  if v_def is null then
    raise exception 'No existe public.delete_business: nada que parchear.';
  end if;
  if position('team_invitations' in v_def) > 0 then
    raise notice 'delete_business ya borra las invitaciones; no se toca.';
    return;
  end if;
  if position(v_ancla in v_def) = 0 then
    raise exception 'El ancla no está en delete_business; revisar antes de seguir.';
  end if;
  execute replace(v_def, v_ancla,
    v_ancla || chr(10) ||
    '  delete from team_invitations where business_id = p_business_id;');
end $$;

-- ── Comprobación: el parche quedó puesto ──────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_business'
      and position('delete from team_invitations where business_id = p_business_id;' in p.prosrc) > 0
  ) then
    raise exception 'delete_business no quedó borrando team_invitations.';
  end if;
end $$;
