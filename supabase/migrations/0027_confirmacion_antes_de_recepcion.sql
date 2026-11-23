-- La recepción solo puede iniciar después de que Compras registre la
-- confirmación del proveedor. La simulación de envío también deja la orden
-- en estado "enviada"; esa simulación no sustituye la confirmación.

alter table ordenes_compra
  add column confirmada_at timestamptz,
  add column confirmada_por uuid references auth.users(id) on delete set null;

-- Los cambios de estado se hacen por RPC o desde la Edge Function. La UI no
-- actualiza directamente ordenes_compra.
revoke update on ordenes_compra from authenticated;

create function confirmar_orden_compra(p_orden_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_orden ordenes_compra;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','compras']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;

  select * into v_orden from ordenes_compra where id = p_orden_id for update;
  if not found then raise exception 'La orden no existe.' using errcode = 'P0002'; end if;
  if v_orden.estado <> 'enviada' or v_orden.sent_at is null then
    raise exception 'Solo se puede confirmar una orden que ya fue enviada al proveedor.' using errcode = '23514';
  end if;

  update ordenes_compra
  set estado = 'confirmada', confirmada_at = now(), confirmada_por = auth.uid()
  where id = p_orden_id;
end $$;

revoke all on function confirmar_orden_compra(bigint) from public, anon;
grant execute on function confirmar_orden_compra(bigint) to authenticated, service_role;

-- Sustituye la función previa para validar el estado antes de alterar stock.
create or replace function recibir_linea_orden(p_linea_id bigint, p_cantidad integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_orden ordenes_compra;
  v_linea orden_lineas;
  v_producto_id bigint;
  v_stock integer;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','almacen']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad recibida debe ser mayor que cero.' using errcode = '23514';
  end if;

  select o.* into v_orden
  from ordenes_compra o
  join orden_lineas l on l.orden_id = o.id
  where l.id = p_linea_id
  for update of o;
  if not found then raise exception 'La línea de la orden no existe.' using errcode = 'P0002'; end if;
  if v_orden.estado not in ('confirmada','recibida parcial') then
    raise exception 'La orden debe estar confirmada por el proveedor antes de registrar la recepción.' using errcode = '23514';
  end if;

  select * into v_linea from orden_lineas where id = p_linea_id for update;
  if v_linea.recibida + p_cantidad > v_linea.cantidad then
    raise exception 'La recepción supera las unidades pendientes.' using errcode = '23514';
  end if;

  v_producto_id := v_linea.product_id;
  if v_producto_id is null then
    select id into v_producto_id from products where codigo = v_linea.product_code;
    if v_producto_id is null then
      raise exception 'El producto % fue eliminado. Regístralo de nuevo con el mismo código antes de recibir la orden.', v_linea.product_code;
    end if;
    update orden_lineas set product_id = v_producto_id where id = p_linea_id;
  end if;

  v_stock := registrar_movimiento(v_producto_id, 'entrada', p_cantidad, 'otro');
  update orden_lineas set recibida = recibida + p_cantidad where id = p_linea_id;
  update ordenes_compra o set
    estado = case when not exists (
      select 1 from orden_lineas l where l.orden_id = o.id and l.recibida < l.cantidad
    ) then 'recibida' else 'recibida parcial' end,
    received_at = case when not exists (
      select 1 from orden_lineas l where l.orden_id = o.id and l.recibida < l.cantidad
    ) then now() else null end
  where o.id = v_orden.id;
  return v_stock;
end $$;

revoke all on function recibir_linea_orden(bigint,integer) from public, anon;
grant execute on function recibir_linea_orden(bigint,integer) to authenticated, service_role;
