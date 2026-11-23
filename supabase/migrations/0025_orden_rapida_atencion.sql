-- Permite ordenar reabasto rápido a los productos que el Dashboard clasifica
-- como críticos o en atención, aunque todavía tengan unidades disponibles.
-- Mantiene la misma regla de 30 días calendario de ventas que usa el Dashboard.
create or replace function crear_orden_rapida(p_producto_id bigint, p_cantidad integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_producto products;
  v_proveedor_id bigint;
  v_proveedor_nombre text;
  v_minimo_unidades integer;
  v_cantidad integer;
  v_orden_id bigint;
  v_folio text;
  v_ventas_diarias numeric;
  v_hoy_utc date := (now() at time zone 'UTC')::date;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','compras']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad sugerida debe ser mayor que cero.';
  end if;

  select * into v_producto from products where id = p_producto_id for update;
  if not found then raise exception 'El producto ya no existe.'; end if;

  select coalesce(sum(m.cantidad), 0)::numeric / 30
    into v_ventas_diarias
  from movements m
  where m.product_code = v_producto.codigo
    and m.tipo = 'salida'
    and m.motivo = 'venta'
    and (m.created_at at time zone 'UTC')::date between v_hoy_utc - 29 and v_hoy_utc;

  -- Coincide con clasificarProducto: agotado, bajo mínimo o cobertura de hasta
  -- 14 días. Se usa floor porque días_restantes se redondea hacia abajo.
  if v_producto.stock_actual > 0
    and v_producto.stock_actual >= v_producto.stock_minimo
    and (v_ventas_diarias <= 0 or floor(v_producto.stock_actual / v_ventas_diarias) > 14)
  then
    raise exception 'El producto ya no está en estado crítico ni en atención; actualiza el Dashboard antes de armar la orden.';
  end if;

  select pp.proveedor_id, pr.nombre, pp.minimo_unidades
    into v_proveedor_id, v_proveedor_nombre, v_minimo_unidades
  from proveedor_productos pp
  join proveedores pr on pr.id = pp.proveedor_id and pr.activo
  where pp.product_id = p_producto_id
  order by pp.costo_unitario, pp.proveedor_id
  limit 1;
  if v_proveedor_id is null then
    raise exception 'No hay un proveedor activo asignado a este producto.';
  end if;

  v_cantidad := greatest(p_cantidad, coalesce(v_minimo_unidades, 1));
  select id, folio into v_orden_id, v_folio
  from ordenes_compra
  where proveedor_id = v_proveedor_id and estado = 'borrador'
    and alerta_id is null and email_alert_id is null
  order by created_at desc
  limit 1
  for update;

  if v_orden_id is null then
    v_folio := 'OC-' || to_char(now(), 'YYYYMMDD') || '-'
      || lpad(nextval(pg_get_serial_sequence('ordenes_compra', 'id'))::text, 6, '0');
    insert into ordenes_compra(folio, proveedor_id, creada_por)
    values (v_folio, v_proveedor_id, auth.uid())
    returning id into v_orden_id;
  end if;

  insert into orden_lineas(orden_id, product_id, cantidad, costo_unitario)
  values (v_orden_id, p_producto_id, v_cantidad, v_producto.costo)
  on conflict (orden_id, product_id) do update
    set cantidad = greatest(orden_lineas.cantidad, excluded.cantidad),
        costo_unitario = excluded.costo_unitario;

  return jsonb_build_object('id', v_orden_id, 'folio', v_folio, 'proveedor', v_proveedor_nombre, 'cantidad', v_cantidad);
end $$;

grant execute on function crear_orden_rapida(bigint, integer) to authenticated, service_role;
