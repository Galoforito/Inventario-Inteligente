-- 0022 · Aviso al proveedor cuando una orden llega incompleta.
-- Compras/Admin lo envía a mano desde Órdenes cuando terminan de recibir y
-- confirman que falta mercancía (la recepción se registra línea por línea, así
-- que "recibida parcial" también aparece mientras se cuenta).

-- Nuevo tipo de aviso en el historial.
alter table alerts drop constraint if exists alerts_tipo_check;
alter table alerts add constraint alerts_tipo_check
  check (tipo in ('stock_bajo','reporte_semanal','orden_compra','prueba_correo','entrega_incompleta'));

-- Antes: un solo aviso por orden (evitaba mandar dos veces la orden).
-- Ahora: un aviso de cada tipo por orden; la orden y el faltante siguen sin poder duplicarse.
drop index if exists alerts_orden_email_unico;
create unique index alerts_orden_tipo_unico on alerts (orden_id, tipo) where orden_id is not null;

alter table ordenes_compra add column incompleta_alert_id bigint references alerts(id) on delete set null;

-- Prepara (una sola vez por orden) el correo para el proveedor con lo pedido,
-- lo recibido y lo que falta. Devuelve { alert_id, reutilizada, recipient }.
create function preparar_correo_entrega_incompleta(p_orden_id bigint, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_orden ordenes_compra;
  v_proveedor proveedores;
  v_items jsonb;
  v_lineas text;
  v_total numeric;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_id bigint;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','compras']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  select * into v_orden from ordenes_compra where id = p_orden_id for update;
  if not found then raise exception 'La orden no existe.'; end if;
  if v_orden.incompleta_alert_id is not null then
    return jsonb_build_object('alert_id', v_orden.incompleta_alert_id, 'reutilizada', true);
  end if;
  if v_orden.estado <> 'recibida parcial' then
    raise exception 'Solo se puede reportar una orden en estado recibida parcial.';
  end if;
  if v_nota is not null and char_length(v_nota) > 500 then
    raise exception 'La nota admite como máximo 500 caracteres.';
  end if;
  select * into v_proveedor from proveedores where id = v_orden.proveedor_id;
  if not found then raise exception 'El proveedor de la orden no existe.'; end if;

  with lineas as (
    select coalesce(l.product_code, p.codigo) as codigo, coalesce(l.product_name, p.nombre) as nombre,
      l.cantidad as pedida, l.recibida, l.cantidad - l.recibida as faltante, l.costo_unitario
    from orden_lineas l left join products p on p.id = l.product_id
    where l.orden_id = p_orden_id
  )
  select
    jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre, 'pedida', pedida, 'recibida', recibida,
      'faltante', faltante, 'costo_unitario', costo_unitario, 'costo_faltante', faltante * costo_unitario)
      order by nombre) filter (where faltante > 0),
    string_agg(format('• %s — %s: pedidas %s, recibidas %s, faltan %s u. (%s)', codigo, nombre, pedida, recibida,
      faltante, dinero(faltante * costo_unitario)), E'\n' order by nombre) filter (where faltante > 0),
    sum(faltante * costo_unitario) filter (where faltante > 0)
  into v_items, v_lineas, v_total
  from lineas;
  if v_items is null then raise exception 'La orden no tiene unidades pendientes de recibir.'; end if;

  insert into alerts (tipo, orden_id, proveedor_id, recipient, items, subject, body, status, delivery_status)
  values ('entrega_incompleta', p_orden_id, v_proveedor.id, v_proveedor.correo, v_items,
    format('Entrega incompleta de la orden %s', v_orden.folio),
    format(E'Hola %s,\n\nRecibimos la orden %s de forma incompleta. Faltan estas unidades:\n%s\n\nValor pendiente: %s\n\n'
      || E'Le pedimos indicarnos cómo procederá:\n'
      || E'• Enviar las unidades faltantes e informarnos la nueva fecha de entrega, o\n'
      || E'• Ajustar la orden y la factura a lo efectivamente entregado.\n\n'
      || E'%sPuede responder directamente a este correo.\n\nGracias.',
      v_proveedor.nombre, v_orden.folio, v_lineas, dinero(v_total),
      case when v_nota is null then '' else format(E'Nota de Compras: %s\n\n', v_nota) end),
    'pendiente', 'pendiente')
  returning id into v_id;
  update ordenes_compra set incompleta_alert_id = v_id where id = p_orden_id;
  return jsonb_build_object('alert_id', v_id, 'reutilizada', false, 'recipient', v_proveedor.correo);
end $$;

revoke all on function preparar_correo_entrega_incompleta(bigint, text) from public, anon;
grant execute on function preparar_correo_entrega_incompleta(bigint, text) to authenticated, service_role;
