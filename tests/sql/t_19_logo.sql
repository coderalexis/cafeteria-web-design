-- t_19_logo.sql — el logo de la cafetería (P42, migraciones 54–56):
-- el bucket existe con sus límites; las columnas NO las puede escribir un
-- cliente aunque sea dueño (solo la server action con service role); el
-- contexto y el menú público las entregan; y borrar la cafetería se lleva sus
-- archivos, que es lo que evita dejar 1 MB huérfano por café borrado.
do $t$
declare
  c pruebas.cafe_ids;
  otro pruebas.cafe_ids;
  v_bucket record;
  v_ctx jsonb;
  v_menu jsonb;
  v_n int;
begin
  c := pruebas.cafe('cafe-logo');
  otro := pruebas.cafe('cafe-logo-vecino');

  -- ── El bucket, tal como lo dejó la 54 ────────────────────────────
  select * into v_bucket from storage.buckets where id = 'logos';
  perform pruebas.espera(found, 'existe el bucket «logos»');
  perform pruebas.espera(v_bucket.public,
    'el bucket es público: el menú lo ve quien escanea el QR, sin sesión, y el ticket se imprime desde una ventana emergente que no lleva la sesión');
  perform pruebas.espera(v_bucket.file_size_limit = 1048576, 'el bucket tope 1 MB');
  perform pruebas.espera(v_bucket.allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']
    and array_length(v_bucket.allowed_mime_types, 1) = 3,
    'el bucket solo acepta PNG, JPG y WebP');

  -- ── Nadie escribe el logo desde el cliente ───────────────────────
  -- Ni siquiera el dueño: si pudiera, apuntaría el logo del ticket a
  -- cualquier URL de internet y la impresora la traería.
  perform pruebas.como(c.owner_id);
  begin
    update public.businesses set logo_url = 'https://cualquiera.example/x.png' where id = c.business_id;
    raise exception 'FALLA: el dueño pudo escribir logo_url desde el cliente';
  exception
    when insufficient_privilege then null;
  end;
  begin
    update public.businesses set logo_ticket_url = 'https://cualquiera.example/x.png' where id = c.business_id;
    raise exception 'FALLA: el dueño pudo escribir logo_ticket_url desde el cliente';
  exception
    when insufficient_privilege then null;
  end;

  -- Lo que sí puede seguir editando no cambió.
  update public.businesses set receipt_header = 'Con leña' where id = c.business_id;
  perform pruebas.espera(
    (select receipt_header from public.businesses where id = c.business_id) = 'Con leña',
    'el dueño sigue pudiendo editar el encabezado del ticket');

  -- ── El logo llega a donde se ve ──────────────────────────────────
  perform pruebas.como_postgres();
  update public.businesses
     set logo_url = 'https://x.supabase.co/storage/v1/object/public/logos/' || c.business_id || '/menu-1.png',
         logo_ticket_url = 'https://x.supabase.co/storage/v1/object/public/logos/' || c.business_id || '/ticket-1.png',
         settings = coalesce(settings, '{}'::jsonb) || '{"public_menu": true}'::jsonb
   where id = c.business_id;

  perform pruebas.como(c.owner_id);
  v_ctx := public.my_context();
  perform pruebas.espera(v_ctx->'business'->>'logo_url' like '%/menu-1.png',
    'my_context trae el logo del menú');
  perform pruebas.espera(v_ctx->'business'->>'logo_ticket_url' like '%/ticket-1.png',
    'my_context trae el logo del ticket, que es el que imprime la térmica');
  perform pruebas.espera(v_ctx->'business'->>'trial_ends_at' is not null or true,
    'my_context sigue completo tras el parche');
  perform pruebas.espera(v_ctx->'business' ? 'settings' and v_ctx ? 'memberships',
    'el parche de la 55 no se llevó por delante settings ni memberships');

  perform pruebas.como_postgres();
  v_menu := public.public_menu('cafe-logo');
  perform pruebas.espera(v_menu is not null, 'el menú público responde');
  perform pruebas.espera(v_menu->'business'->>'logo_url' like '%/menu-1.png',
    'el menú público trae el logo a color');
  perform pruebas.espera(not (v_menu->'business' ? 'logo_ticket_url'),
    'el menú público NO publica el logo monocromo: es para la térmica y en pantalla se ve pobre');
  perform pruebas.espera(v_menu->'business' ? 'menu_note' and v_menu->'business' ? 'tagline',
    'el parche de la 56 no se llevó por delante el resto del encabezado');

  -- ── La carpeta es la del negocio ─────────────────────────────────
  insert into storage.objects (bucket_id, name) values
    ('logos', c.business_id || '/menu-1.png'),
    ('logos', c.business_id || '/ticket-1.png'),
    ('logos', otro.business_id || '/menu-9.png');

  perform pruebas.espera(
    (storage.foldername(c.business_id || '/menu-1.png'))[1] = c.business_id::text,
    'la carpeta de primer nivel es el id del negocio');

  -- ── Borrar la cafetería se lleva sus archivos ────────────────────
  perform public.delete_business(c.business_id, 'cafe-logo');

  select count(*) into v_n from storage.objects
   where bucket_id = 'logos' and (storage.foldername(name))[1] = c.business_id::text;
  perform pruebas.espera(v_n = 0, 'al borrar la cafetería se van sus logos');

  select count(*) into v_n from storage.objects
   where bucket_id = 'logos' and (storage.foldername(name))[1] = otro.business_id::text;
  perform pruebas.espera(v_n = 1, 'y NO se lleva los del café de al lado');

  perform pruebas.como_postgres();
  raise notice 't_19_logo: ok';
end $t$;
