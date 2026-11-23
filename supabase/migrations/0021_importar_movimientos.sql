-- 0021 · Importación de movimientos desde Excel y alertas basadas solo en ventas.

-- 1. Marca de importación ------------------------------------------------------
-- Cada fila importada guarda una clave: código|fecha|tipo|motivo|cantidad|n, donde
-- n es la aparición de esa misma combinación dentro del archivo (1, 2, ...).
-- Reimportar el mismo archivo produce las mismas claves y esas filas se omiten;
-- dos ventas idénticas legítimas en un archivo tienen n distinto y entran ambas.
-- Los movimientos registrados a mano quedan con import_key nulo.
alter table movements add column import_key text;
create unique index movements_import_key on movements (import_key) where import_key is not null;

-- 2. Importación (todo o nada) -------------------------------------------------
-- p_items: [{ fila, codigo, fecha: 'YYYY-MM-DD', tipo, motivo, cantidad }]
-- Devuelve { agregados, omitidos }. Si una fila nueva es inválida o dejaría el
-- stock negativo, no se guarda nada y el error indica la fila del Excel.
create function importar_movimientos(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_fila record;
  v_producto products;
  v_nuevo integer;
  v_agregados integer := 0;
  v_omitidos integer := 0;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','almacen']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El archivo no tiene movimientos.';
  end if;
  if jsonb_array_length(p_items) > 5000 then
    raise exception 'Máximo 5000 movimientos por archivo.';
  end if;
  -- Dos importaciones a la vez se ejecutan una tras otra.
  perform pg_advisory_xact_lock(hashtext('importar_movimientos'));

  for v_fila in
    with filas as (
      select e.ord,
        coalesce((e.x->>'fila')::integer, e.ord::integer + 1) as fila,
        btrim(e.x->>'codigo') as codigo,
        (e.x->>'fecha')::date as fecha,
        e.x->>'tipo' as tipo,
        e.x->>'motivo' as motivo,
        (e.x->>'cantidad')::integer as cantidad
      from jsonb_array_elements(p_items) with ordinality as e(x, ord)
    )
    select f.*,
      concat_ws('|', f.codigo, to_char(f.fecha, 'YYYY-MM-DD'), f.tipo, f.motivo, f.cantidad,
        row_number() over (partition by f.codigo, f.fecha, f.tipo, f.motivo, f.cantidad order by f.ord)) as clave
    from filas f
    order by f.fecha, f.ord   -- se aplican en orden cronológico
  loop
    if v_fila.codigo is null or v_fila.codigo = '' then
      raise exception 'Fila %: falta el código del producto.', v_fila.fila;
    end if;
    if v_fila.fecha is null or v_fila.fecha > current_date then
      raise exception 'Fila %: la fecha no puede estar vacía ni ser futura.', v_fila.fila;
    end if;
    if v_fila.tipo is null or v_fila.tipo not in ('entrada', 'salida') then
      raise exception 'Fila %: el tipo debe ser entrada o salida.', v_fila.fila;
    end if;
    if v_fila.tipo = 'entrada' and coalesce(v_fila.motivo, '') not in ('compra', 'devolucion', 'ajuste', 'otro') then
      raise exception 'Fila %: el motivo no corresponde a una entrada.', v_fila.fila;
    end if;
    if v_fila.tipo = 'salida' and coalesce(v_fila.motivo, '') not in ('venta', 'merma', 'ajuste', 'otro') then
      raise exception 'Fila %: el motivo no corresponde a una salida.', v_fila.fila;
    end if;
    if v_fila.cantidad is null or v_fila.cantidad <= 0 then
      raise exception 'Fila %: la cantidad debe ser mayor que cero.', v_fila.fila;
    end if;

    if exists (select 1 from movements where import_key = v_fila.clave) then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    select * into v_producto from products where codigo = v_fila.codigo for update;
    if not found then
      raise exception 'Fila %: no existe un producto con el código %.', v_fila.fila, v_fila.codigo;
    end if;
    v_nuevo := v_producto.stock_actual + case when v_fila.tipo = 'entrada' then v_fila.cantidad else -v_fila.cantidad end;
    if v_nuevo < 0 then
      raise exception 'Fila %: la salida de % u. dejaría el stock de % en negativo (hay %).',
        v_fila.fila, v_fila.cantidad, v_fila.codigo, v_producto.stock_actual;
    end if;

    update products set stock_actual = v_nuevo where id = v_producto.id;
    -- Mediodía UTC: el día de la venta no cambia al convertir zonas horarias.
    insert into movements (product_code, product_name, tipo, cantidad, stock_anterior, stock_nuevo, motivo, created_at, import_key)
    values (v_producto.codigo, v_producto.nombre, v_fila.tipo, v_fila.cantidad, v_producto.stock_actual, v_nuevo,
      v_fila.motivo, (v_fila.fecha + time '12:00') at time zone 'UTC', v_fila.clave);
    v_agregados := v_agregados + 1;
  end loop;

  return jsonb_build_object('agregados', v_agregados, 'omitidos', v_omitidos);
end $$;

revoke all on function importar_movimientos(jsonb) from public, anon;
grant execute on function importar_movimientos(jsonb) to authenticated, service_role;

-- 3. Alertas: demanda solo con ventas --------------------------------------------
-- Igual que la versión de 0011, salvo el respaldo cuando no hay ventas en 28 días:
-- antes usaba consumo_30d (todas las salidas, incluidas mermas y ajustes) dividido
-- entre los días desde la primera salida; ahora usa ventas de 30 días ÷ 30, como la app.
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

  with ponderado as (
    select p.id, sum(m.cantidad * (29 - d.day_offset))::numeric / sum(29 - d.day_offset) as diario
    from products p
    cross join generate_series(0, 27) as d(day_offset)
    left join movements m on m.product_code = p.codigo and m.tipo = 'salida' and m.motivo = 'venta'
      and (m.created_at at time zone 'UTC')::date = current_date - d.day_offset
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
