-- 0029 · Cantidad elegida al comprar y cierre de órdenes incompletas.

-- 1. Cantidad mínima al armar borradores ---------------------------------------
-- La app deja elegir la cantidad; la base exige al menos lo que falta para llegar
-- al stock mínimo (mínimo 1). Igual que en 0028, salvo esa comprobación.
-- p_items: [{"producto_id": bigint, "cantidad": integer}]. La operación es
-- atómica: agrupa por proveedor y crea/reutiliza un borrador por proveedor.
create or replace function crear_ordenes_agrupadas(p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_total integer;
  v_distintos integer;
  v_pid bigint;
  v_solicitada integer;
  v_producto products;
  v_proveedor_id bigint;
  v_proveedor_nombre text;
  v_costo numeric;
  v_minimo_unidades integer;
  v_cantidad integer;
  v_ventas_diarias numeric;
  v_hoy_utc date := (now() at time zone 'UTC')::date;
  v_orden_id bigint;
  v_folio text;
  v_existente_folio text;
  v_orden_por_proveedor jsonb := '{}'::jsonb;
  v_ordenes bigint[] := '{}'::bigint[];
  v_detalle jsonb;
  v_total_productos integer := 0;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','compras']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Selecciona al menos un producto para armar los borradores.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Puedes agrupar hasta 100 productos por operación.' using errcode = '22023';
  end if;

  select count(*), count(distinct (x.item->>'producto_id')::bigint)
    into v_total, v_distintos
  from jsonb_array_elements(p_items) as x(item);
  if v_distintos <> v_total then
    raise exception 'La selección contiene productos repetidos.' using errcode = '22023';
  end if;

  -- Serializa la búsqueda/creación de borradores por proveedor.
  perform pg_advisory_xact_lock(hashtext('crear_ordenes_agrupadas'));

  for v_item in
    select x.item from jsonb_array_elements(p_items) as x(item)
    order by (x.item->>'producto_id')::bigint
  loop
    v_pid := (v_item->>'producto_id')::bigint;
    v_solicitada := (v_item->>'cantidad')::integer;
    if v_pid is null or v_solicitada is null or v_solicitada <= 0 then
      raise exception 'Cada producto debe tener una cantidad sugerida mayor que cero.' using errcode = '22023';
    end if;

    select * into v_producto from products where id = v_pid for update;
    if not found then raise exception 'El producto % ya no existe.', v_pid using errcode = 'P0002'; end if;

    select coalesce(sum(m.cantidad), 0)::numeric / 30
      into v_ventas_diarias
    from movements m
    where m.product_code = v_producto.codigo
      and m.tipo = 'salida'
      and m.motivo = 'venta'
      and (m.created_at at time zone 'UTC')::date between v_hoy_utc - 29 and v_hoy_utc;

    if v_producto.stock_actual > 0
      and v_producto.stock_actual >= v_producto.stock_minimo
      and (v_ventas_diarias <= 0 or floor(v_producto.stock_actual / v_ventas_diarias) > 14)
    then
      raise exception 'El producto % ya no está en estado crítico ni en atención; actualiza el Dashboard antes de armar la orden.', v_producto.codigo;
    end if;

    select pp.proveedor_id, pr.nombre, pp.costo_unitario, pp.minimo_unidades
      into v_proveedor_id, v_proveedor_nombre, v_costo, v_minimo_unidades
    from proveedor_productos pp
    join proveedores pr on pr.id = pp.proveedor_id and pr.activo
    where pp.product_id = v_pid;
    if v_proveedor_id is null then
      raise exception 'No hay un proveedor activo asignado al producto %.', v_producto.codigo;
    end if;

    select o.id, o.folio into v_orden_id, v_existente_folio
    from orden_lineas l
    join ordenes_compra o on o.id = l.orden_id
    where l.product_id = v_pid and o.estado = 'borrador'
    order by o.created_at desc
    limit 1
    for update of o;
    if v_orden_id is not null then
      raise exception 'El producto % ya está en el borrador %. Envíalo o cancélalo antes de crear otro.', v_producto.codigo, v_existente_folio
        using errcode = 'P0001';
    end if;

    -- Nuevo: no se puede pedir menos de lo que falta para llegar al stock mínimo.
    if v_solicitada < greatest(v_producto.stock_minimo - v_producto.stock_actual, 1) then
      raise exception 'La cantidad de % no puede ser menor que % (lo que falta para llegar a su stock mínimo).',
        v_producto.codigo, greatest(v_producto.stock_minimo - v_producto.stock_actual, 1) using errcode = '22023';
    end if;

    v_cantidad := greatest(v_solicitada, coalesce(v_minimo_unidades, 1));
    v_orden_id := null;
    v_folio := null;
    if (v_orden_por_proveedor ? (v_proveedor_id::text)) then
      v_orden_id := (v_orden_por_proveedor->>v_proveedor_id::text)::bigint;
      select folio into v_folio from ordenes_compra where id = v_orden_id for update;
    else
      select id, folio into v_orden_id, v_folio
      from ordenes_compra
      where proveedor_id = v_proveedor_id and estado = 'borrador' and email_alert_id is null
      order by created_at desc
      limit 1
      for update;
      if v_orden_id is null then
        v_folio := 'OC-' || to_char(now(), 'YYYYMMDD') || '-'
          || lpad(nextval(pg_get_serial_sequence('ordenes_compra','id'))::text, 6, '0');
        insert into ordenes_compra(folio, proveedor_id, creada_por)
        values (v_folio, v_proveedor_id, auth.uid())
        returning id into v_orden_id;
      end if;
      v_orden_por_proveedor := jsonb_set(v_orden_por_proveedor, array[v_proveedor_id::text], to_jsonb(v_orden_id), true);
    end if;

    insert into orden_lineas(orden_id, product_id, cantidad, costo_unitario)
    values (v_orden_id, v_pid, v_cantidad, v_producto.costo)
    on conflict (orden_id, product_id) do nothing;

    if not (v_orden_id = any(v_ordenes)) then
      v_ordenes := array_append(v_ordenes, v_orden_id);
    end if;
    v_total_productos := v_total_productos + 1;
  end loop;

  select coalesce(jsonb_agg(t.detalle order by t.proveedor), '[]'::jsonb)
    into v_detalle
  from (
    select p.nombre as proveedor,
      jsonb_build_object('id', o.id, 'folio', o.folio, 'proveedor', p.nombre,
        'productos', count(l.id), 'cantidad', sum(l.cantidad)) as detalle
    from ordenes_compra o
    join proveedores p on p.id = o.proveedor_id
    join orden_lineas l on l.orden_id = o.id
    where o.id = any(v_ordenes)
    group by o.id, o.folio, p.nombre
  ) t;

  return jsonb_build_object('ordenes', v_detalle, 'total_ordenes', jsonb_array_length(v_detalle),
    'total_productos', v_total_productos);
end $$;

revoke all on function crear_ordenes_agrupadas(jsonb) from public, anon;
grant execute on function crear_ordenes_agrupadas(jsonb) to authenticated, service_role;

-- La acción individual usa el mismo flujo que la selección múltiple, de modo

-- 2. Cambiar la cantidad de una línea mientras la orden es borrador --------------
-- Cubre también los borradores creados desde una alerta. Misma regla mínima, y
-- nunca menos que el mínimo de unidades que vende el proveedor.
create function actualizar_cantidad_linea_borrador(p_linea_id bigint, p_cantidad integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_linea orden_lineas;
  v_estado text;
  v_proveedor_id bigint;
  v_producto products;
  v_minimo integer := 1;
  v_minimo_proveedor integer;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','compras']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;
  select * into v_linea from orden_lineas where id = p_linea_id for update;
  if not found then raise exception 'La línea de la orden no existe.' using errcode = 'P0002'; end if;
  select estado, proveedor_id into v_estado, v_proveedor_id from ordenes_compra where id = v_linea.orden_id for update;
  if v_estado <> 'borrador' then
    raise exception 'Solo se puede cambiar la cantidad mientras la orden es borrador.' using errcode = '22023';
  end if;
  if v_linea.product_id is not null then
    select * into v_producto from products where id = v_linea.product_id;
    if found then v_minimo := greatest(v_producto.stock_minimo - v_producto.stock_actual, 1); end if;
    select minimo_unidades into v_minimo_proveedor from proveedor_productos
    where product_id = v_linea.product_id and proveedor_id = v_proveedor_id;
  end if;
  if p_cantidad < v_minimo then
    raise exception 'La cantidad no puede ser menor que % (lo que falta para llegar al stock mínimo).', v_minimo using errcode = '22023';
  end if;
  if p_cantidad < coalesce(v_minimo_proveedor, 1) then
    raise exception 'El proveedor vende como mínimo % unidad(es) de este producto.', v_minimo_proveedor using errcode = '22023';
  end if;
  update orden_lineas set cantidad = p_cantidad where id = p_linea_id;
  return jsonb_build_object('linea_id', p_linea_id, 'cantidad', p_cantidad);
end $$;

revoke all on function actualizar_cantidad_linea_borrador(bigint, integer) from public, anon;
grant execute on function actualizar_cantidad_linea_borrador(bigint, integer) to authenticated, service_role;

-- 3. Cierre de una orden incompleta ya reclamada ---------------------------------
-- Después de "Reportar entrega incompleta" hay tres salidas: el proveedor manda
-- lo faltante (Registrar recepción, ya existía), el proveedor cancela lo faltante
-- o se le devuelve lo recibido.
do $$
declare v_nombre text;
begin
  -- La restricción de estados se creó en línea en 0008; se busca por su definición.
  for v_nombre in
    select conname from pg_constraint
    where conrelid = 'public.ordenes_compra'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%estado%'
  loop
    execute format('alter table ordenes_compra drop constraint %I', v_nombre);
  end loop;
end $$;
alter table ordenes_compra add constraint ordenes_compra_estado_check
  check (estado in ('borrador','enviada','confirmada','recibida parcial','recibida','cerrada incompleta','cancelada'));

alter table ordenes_compra add column cierre_tipo text check (cierre_tipo in ('faltante_cancelado','devuelta'));
alter table ordenes_compra add column cierre_nota text check (char_length(cierre_nota) <= 500);
alter table ordenes_compra add column cerrada_at timestamptz;

-- p_tipo:
--   'faltante_cancelado' → el proveedor no enviará lo que falta. La orden queda
--                          "cerrada incompleta" con lo recibido; el stock no cambia.
--   'devuelta'           → se devuelve al proveedor lo recibido. Se resta del
--                          stock (salida con motivo "otro") y la orden queda "cancelada".
create function cerrar_orden_incompleta(p_orden_id bigint, p_tipo text, p_nota text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_orden ordenes_compra;
  v_linea record;
  v_producto products;
  v_nuevo integer;
  v_unidades integer := 0;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_estado text;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','compras']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('faltante_cancelado', 'devuelta') then
    raise exception 'Elige si el proveedor canceló el faltante o si se devolvió lo recibido.' using errcode = '22023';
  end if;
  if v_nota is not null and char_length(v_nota) > 500 then
    raise exception 'La nota admite como máximo 500 caracteres.' using errcode = '22023';
  end if;
  select * into v_orden from ordenes_compra where id = p_orden_id for update;
  if not found then raise exception 'La orden no existe.' using errcode = 'P0002'; end if;
  if v_orden.estado <> 'recibida parcial' or v_orden.incompleta_alert_id is null then
    raise exception 'Solo se puede cerrar una orden recibida parcialmente cuyo faltante ya se reportó al proveedor.' using errcode = '22023';
  end if;

  if p_tipo = 'devuelta' then
    for v_linea in
      select l.id, l.product_id, l.product_code, l.recibida
      from orden_lineas l
      where l.orden_id = p_orden_id and l.recibida > 0
      order by l.id
    loop
      select * into v_producto from products where id = v_linea.product_id for update;
      if not found then
        raise exception 'El producto % fue eliminado; no se puede registrar su devolución.', v_linea.product_code using errcode = '22023';
      end if;
      v_nuevo := v_producto.stock_actual - v_linea.recibida;
      if v_nuevo < 0 then
        raise exception 'No hay stock suficiente de % para devolver % u. (hay %).', v_producto.codigo, v_linea.recibida, v_producto.stock_actual
          using errcode = '22023';
      end if;
      update products set stock_actual = v_nuevo where id = v_producto.id;
      insert into movements (product_code, product_name, tipo, cantidad, stock_anterior, stock_nuevo, motivo)
      values (v_producto.codigo, v_producto.nombre, 'salida', v_linea.recibida, v_producto.stock_actual, v_nuevo, 'otro');
      v_unidades := v_unidades + v_linea.recibida;
    end loop;
  end if;

  v_estado := case when p_tipo = 'devuelta' then 'cancelada' else 'cerrada incompleta' end;
  update ordenes_compra
  set estado = v_estado, cierre_tipo = p_tipo, cierre_nota = v_nota, cerrada_at = now()
  where id = p_orden_id;

  return jsonb_build_object('orden_id', p_orden_id, 'estado', v_estado, 'unidades_devueltas', v_unidades);
end $$;

revoke all on function cerrar_orden_incompleta(bigint, text, text) from public, anon;
grant execute on function cerrar_orden_incompleta(bigint, text, text) to authenticated, service_role;
