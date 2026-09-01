-- 34_p12_nota_publica.sql — P12: nota de compra en la web (aplicada en
-- producción como `p12_nota_de_compra_publica`).
--
-- Al cobrar sale un QR; el cliente lo escanea y abre /t/<id>. Este es el
-- SEGUNDO RPC con permiso para `anon` después de `public_menu`, y por eso
-- cada guarda está escrita para devolver NULL sin distinguir «no existe» de
-- «no disponible»:
--   · el ticket existe;
--   · tiene menos de 7 días (una nota vieja no debe andar dando vueltas);
--   · el negocio está activo y no es plantilla;
--   · el módulo está encendido (`settings.public_receipt`, ENCENDIDO por
--     omisión, al revés que el menú público: aquí no se publica el negocio,
--     solo una nota suelta cuyo enlace solo tiene quien estuvo en el
--     mostrador).
-- Columnas explícitas: nunca sale `unit_cost` ni la lealtad — los sellos son
-- del cliente y el enlace lo abre cualquiera. El id del ticket (uuid v4)
-- sirve de llave sin inventar un token aparte, porque no se expone en ningún
-- otro lado público.
--
-- ── Por qué este archivo antes no traía SQL ─────────────────────────
-- Se aplicó por el conector y en el repo quedó solo la nota. El verificador
-- de tipos del CI (que genera los tipos contra la base que nace de las
-- migraciones) lo detectó: `public_receipt` era la única función de
-- producción que las migraciones no creaban. La definición de abajo es la
-- viva, tal cual.

create or replace function public.public_receipt(p_ticket uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_t record;
  v_b record;
  v_res jsonb;
begin
  if p_ticket is null then return null; end if;

  select id, business_id, folio, created_at, payment_method, notes, subtotal,
         discount_total, discount_reason, takeout_fee, total, tip_amount,
         cash_received, change_due, status, cancel_reason
    into v_t from tickets where id = p_ticket;
  if not found then return null; end if;

  if v_t.created_at < now() - interval '7 days' then return null; end if;

  select id, name, address, phone, receipt_header, receipt_footer, timezone,
         settings, status, is_template
    into v_b from businesses where id = v_t.business_id;
  if not found or v_b.status <> 'active' or v_b.is_template then return null; end if;

  if coalesce(v_b.settings->>'public_receipt', 'true') <> 'true' then return null; end if;

  select jsonb_build_object(
    'business', jsonb_build_object(
      'name', v_b.name, 'address', v_b.address, 'phone', v_b.phone,
      'receiptHeader', v_b.receipt_header, 'receiptFooter', v_b.receipt_footer,
      'timezone', v_b.timezone),
    'folio', v_t.folio,
    'date', v_t.created_at,
    'paymentMethod', v_t.payment_method,
    'notes', v_t.notes,
    'subtotal', v_t.subtotal,
    'discountTotal', v_t.discount_total,
    'discountReason', v_t.discount_reason,
    'takeoutFee', v_t.takeout_fee,
    'total', v_t.total,
    'tip', v_t.tip_amount,
    'cashReceived', v_t.cash_received,
    'changeDue', v_t.change_due,
    'status', v_t.status,
    'cancelReason', v_t.cancel_reason,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'label', case when i.variant_name is not null and i.variant_name <> 'Unico'
                             then i.product_name || ' (' || i.variant_name || ')'
                             else i.product_name end,
               'quantity', i.quantity,
               'unitPrice', i.unit_price,
               'lineTotal', i.line_total,
               'notes', i.notes,
               'modifiers', coalesce((
                 select jsonb_agg(jsonb_build_object('name', m.modifier_name, 'price', m.modifier_price))
                 from ticket_item_modifiers m where m.ticket_item_id = i.id), '[]'::jsonb))
             order by i.id)
      from ticket_items i where i.ticket_id = v_t.id), '[]'::jsonb)
  ) into v_res;

  return v_res;
end
$function$;

-- El segundo RPC con permiso para anónimos, a propósito y documentado arriba.
revoke all on function public.public_receipt(uuid) from public;
grant execute on function public.public_receipt(uuid) to anon, authenticated;
