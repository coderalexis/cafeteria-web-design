-- t_23_invitaciones.sql — migración 61: las invitaciones al equipo solo las
-- toca el servidor, hay una sola viva por café y correo, y borrar el café se
-- las lleva.
do $t$
declare
  c pruebas.cafe_ids;
  n int;
begin
  c := pruebas.cafe('cafe-invitaciones');

  insert into public.team_invitations (business_id, email, role, token_hash, invited_by)
  values (c.business_id, 'ana@correo.com', 'admin', repeat('a', 64), c.owner_id);

  -- ── Una sola viva por café y correo ────────────────────────────────
  begin
    insert into public.team_invitations (business_id, email, role, token_hash)
    values (c.business_id, 'ana@correo.com', 'cajero', repeat('b', 64));
    raise exception 'FALLA: dos invitaciones vivas para el mismo correo';
  exception when unique_violation then null;
  end;

  -- Cancelada la primera, se puede volver a invitar.
  update public.team_invitations set revoked_at = now() where token_hash = repeat('a', 64);
  insert into public.team_invitations (business_id, email, role, token_hash)
  values (c.business_id, 'ana@correo.com', 'cajero', repeat('b', 64));
  select count(*) into n from public.team_invitations where business_id = c.business_id;
  perform pruebas.espera(n = 2, 'cancelada una, se puede volver a invitar al mismo correo');

  -- ── El correo se guarda normalizado y el token solo como sha256 ─────
  begin
    insert into public.team_invitations (business_id, email, role, token_hash)
    values (c.business_id, 'Beto@Correo.com', 'admin', repeat('c', 64));
    raise exception 'FALLA: entró un correo con mayúsculas';
  exception when check_violation then null;
  end;
  begin
    insert into public.team_invitations (business_id, email, role, token_hash)
    values (c.business_id, 'beto@correo.com', 'admin', 'token-en-claro');
    raise exception 'FALLA: entró un token que no es un sha256';
  exception when check_violation then null;
  end;

  -- ── Ningún cliente la ve ni la escribe, ni el dueño ─────────────────
  perform pruebas.como(c.owner_id);
  begin
    perform count(*) from public.team_invitations;
    raise exception 'FALLA: el dueño leyó team_invitations';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.team_invitations (business_id, email, role, token_hash)
    values (c.business_id, 'eva@correo.com', 'owner', repeat('d', 64));
    raise exception 'FALLA: el dueño escribió en team_invitations';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform count(*) from public.team_invitations;
    raise exception 'FALLA: sin sesión se leyó team_invitations';
  exception when insufficient_privilege then null;
  end;
  perform pruebas.como_postgres();

  -- ── Borrar el café se lleva sus invitaciones ───────────────────────
  perform public.delete_business(c.business_id, 'cafe-invitaciones');
  perform pruebas.espera(
    not exists (select 1 from public.team_invitations where business_id = c.business_id),
    'delete_business también borra las invitaciones');
end $t$;
