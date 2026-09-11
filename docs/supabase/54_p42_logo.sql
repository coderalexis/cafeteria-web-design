-- 54_p42_logo.sql — P42: el logo de la cafetería (migración: p42_logo).
--
-- Dos logos y no uno, a propósito. El menú público es una pantalla a color y
-- el ticket sale de una térmica de 58 mm: 384 puntos de ancho y UN BIT por
-- punto. Un logo de color pasado a monocromo sale como una mancha; y el de la
-- térmica, hecho a trazo negro sobre blanco, se ve pobre en el menú. Pedir dos
-- archivos es más honesto que prometer una conversión que decepciona.
--
-- Por qué el bucket es PÚBLICO: el menú lo ve cualquiera sin sesión (esa es su
-- gracia, va en el QR de las mesas), y el ticket se imprime desde una ventana
-- emergente con `window.print()`, que no lleva la sesión. Una URL firmada
-- caducaría justo cuando alguien reimprime un ticket viejo.
--
-- Por qué NO hay políticas de escritura para clientes: se sube por una server
-- action con service role que deriva el negocio de `member_ctx()`. Es la misma
-- regla de siempre —el negocio nunca viene del cliente— y evita tener que
-- confiar en que la carpeta del path sea la suya. Por lo mismo, las columnas
-- nuevas NO entran en el `grant update` de `authenticated`: si entraran, un
-- cliente podría apuntar su logo a cualquier URL de internet.

-- ── El bucket ──────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Dónde vive cada logo ───────────────────────────────────────────
alter table public.businesses
  add column if not exists logo_url text,
  add column if not exists logo_ticket_url text;

comment on column public.businesses.logo_url is
  'Logo a color para el menú público y las pantallas. Lo escribe solo la server action (service role).';
comment on column public.businesses.logo_ticket_url is
  'Logo monocromo para la impresora térmica (trazo negro sobre blanco). Lo escribe solo la server action.';

-- ── Al borrar una cafetería se van sus logos ───────────────────────
-- `CLAUDE.md`: todo lo que cuelgue de un negocio entra en `delete_business`.
-- Los archivos no son una tabla con `business_id`, pero quedarían huérfanos
-- ocupando espacio y con el nombre del café en la ruta.
--
-- Se PARCHEA la definición viva con un ancla, en vez de reteclear la función:
-- retipearla entera es la forma fácil de revertir sin darse cuenta un arreglo
-- que se aplicó después de la migración 18.
do $$
declare
  v_def text;
  v_ancla text := '  delete from business_members where business_id = p_business_id;';
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'delete_business';

  if v_def is null then
    raise exception 'No existe public.delete_business: nada que parchear.';
  end if;
  if position(v_ancla in v_def) = 0 then
    raise exception 'El ancla no está en delete_business; revisar antes de seguir.';
  end if;
  if position('bucket_id = ''logos''' in v_def) > 0 then
    raise notice 'delete_business ya borra los logos; no se toca.';
    return;
  end if;

  v_nuevo := replace(
    v_def,
    v_ancla,
    '  -- Los archivos del café: el logo del menú y el de la térmica.' || chr(10) ||
    '  delete from storage.objects' || chr(10) ||
    '  where bucket_id = ''logos'' and (storage.foldername(name))[1] = p_business_id::text;' || chr(10) ||
    v_ancla
  );
  execute v_nuevo;
end $$;
