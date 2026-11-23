-- 0022 · Corregir pronóstico ponderado cuando hay varias ventas el mismo día.
-- 0021 ya está aplicada: se reemplaza la función en una migración nueva.

create or replace function crear_alerta_stock_bajo()
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb;
  v_lineas text;
  v_total numeric;
  v_cantidad integer;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('crear_alerta_stock_bajo'));
  insert into settings(key, value)
  values ('last_check', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  on conflict(key) do update set value = excluded.value;

  with ventas_por_dia as (
    -- Agregar todas las filas de venta de un producto por fecha antes de ponderar.
    select product_code, (created_at at time zone 'UTC')::date as fecha, sum(cantidad)::numeric as cantidad
    from movements
    where tipo = 'salida' and motivo = 'venta'
      and (created_at at time zone 'UTC')::date between current_date - 27 and current_date
    group by product_code, (created_at at time zone 'UTC')::date
  ), ponderado as (
    select p.id, sum(coalesce(v.cantidad, 0) * (29 - d.day_offset))::numeric / sum(29 - d.day_offset) as diario
    from products p
    cross join generate_series(0, 27) as d(day_offset)
    left join ventas_por_dia v on v.product_code = p.codigo and v.fecha = current_date - d.day_offset
    group by p.id
  ), ventas_30d as (
    select product_code, sum(cantidad)::numeric as total
    from movements
    where tipo = 'salida' and motivo = 'venta' and created_at >= now() - interval '30 days'
    group by product_code
  ), forecast as (
    select p.*, coalesce(nullif(w.diario, 0), v.total / 30, 0) as diario,
      case when w.diario > 0 then 'ponderado_28d_ventas' when v.total > 0 then 'promedio_30d_ventas' else 'sin_historial' end as modelo
    from products p left join ponderado w on w.id = p.id
    left join ventas_30d v on v.product_code = p.codigo
  ), items as (
    select f.*, greatest(f.stock_minimo - f.stock_actual, ceil(f.diario * 14)::integer - f.stock_actual, 0) as sugerido,
      f.stock_minimo - f.stock_actual as faltante
    from forecast f where f.stock_actual < f.stock_minimo and not f.low_active
  )
  select jsonb_agg(jsonb_build_object(
      'id', i.id, 'codigo', i.codigo, 'nombre', i.nombre, 'stock_actual', i.stock_actual,
      'stock_minimo', i.stock_minimo, 'costo', i.costo, 'faltante', i.faltante,
      'modelo_pronostico', i.modelo, 'demanda_diaria_esperada', round(i.diario, 2),
      'fecha_agotamiento_estimada', case when i.diario > 0 then current_date + floor(i.stock_actual / i.diario)::integer else null end,
      'cantidad_sugerida', i.sugerido, 'costo_reponer', i.faltante * i.costo,
      'costo_sugerido', i.sugerido * i.costo
    ) order by lower(i.nombre), i.id),
    string_agg(format('• %s — %s: actual %s, mínimo %s · reponer %s u. × %s = %s',
      i.codigo, i.nombre, i.stock_actual, i.stock_minimo, i.faltante,
      dinero(i.costo), dinero(i.faltante * i.costo)), E'\n' order by lower(i.nombre), i.id),
    sum(i.faltante * i.costo), count(*)
  into v_items, v_lineas, v_total, v_cantidad from items i;
  if v_cantidad = 0 then return null; end if;

  insert into alerts(items, subject, body, status)
  values(v_items, format('Alerta de inventario: %s producto(s) con stock bajo', v_cantidad),
    E'Productos por debajo del stock mínimo:\n\n' || v_lineas || E'\n\nCosto estimado para llegar al mínimo: ' || dinero(v_total)
    || E'\n\nGenerado por Control inteligente de inventario y alertas de stock.', 'pendiente')
  returning id into v_id;
  update products set low_active = true where id in (select (x->>'id')::bigint from jsonb_array_elements(v_items) x);
  return v_id;
end $$;
