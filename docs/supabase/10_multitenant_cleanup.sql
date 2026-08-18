-- ============================================================
-- 10 — Multi-cafetería (M1, limpieza): se retiran las columnas globales
-- de una sola cafetería. APLICAR SOLO DESPUÉS de desplegar el código de
-- M1 (que ya lee rol/usuario desde business_members). Al revés, el código
-- anterior dejaría de funcionar.
-- ============================================================

alter table public.profiles drop column if exists role;
alter table public.profiles drop column if exists username;
drop type if exists public.app_role;
