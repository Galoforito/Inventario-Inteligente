-- Agrupa pedidos rápidos por proveedor y evita que un producto aparezca en
-- más de un borrador abierto al mismo tiempo.

create or replace function validar_producto_en_un_solo_borrador()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_estado text;
begin
  if new.product_id is null then return new; end if;
  select estado into v_estado from ordenes_compra where id = new.orden_id;
  if v_estado is distinct from 'borrador' then return new; end if;

  perform pg_advisory_xact_lock(hashtext('orden_producto_borrador:' || new.product_id::text));
  if exists (
    select 1
    from orden_lineas l
    join ordenes_compra o on o.id = l.orden_id
    where l.product_id = new.product_id
      and l.orden_id <> new.orden_id
      and l.id is distinct from new.id
      and o.estado = 'borrador'
  ) then
    raise exception 'El producto ya pertenece a otro borrador de compra. Envía o cancela el borrador anterior antes de volver a pedirlo.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function validar_producto_en_un_solo_borrador() from public, anon, authenticated;

create trigger orden_lineas_producto_un_solo_borrador
before insert or update of orden_id, product_id on orden_lineas
for each row execute function validar_producto_en_un_solo_borrador();

-- p_items: [{"producto_id": bigint, "cantidad": integer}]. La operación es
-- atómica: agrupa por proveedor y crea/reutiliza un borrador por proveedor.
create function crear_ordenes_agrupadas(p_items jsonb)
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
-- que los pedidos rápidos por separado reutilicen el borrador por proveedor.
create or replace function crear_orden_rapida(p_producto_id bigint, p_cantidad integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_resultado jsonb;
  v_orden jsonb;
  v_id bigint;
  v_cantidad integer;
begin
  v_resultado := crear_ordenes_agrupadas(jsonb_build_array(
    jsonb_build_object('producto_id', p_producto_id, 'cantidad', p_cantidad)
  ));
  v_orden := v_resultado->'ordenes'->0;
  v_id := (v_orden->>'id')::bigint;
  select cantidad into v_cantidad from orden_lineas where orden_id = v_id and product_id = p_producto_id;
  return jsonb_build_object('id', v_id, 'folio', v_orden->>'folio', 'proveedor', v_orden->>'proveedor', 'cantidad', v_cantidad);
end $$;

revoke all on function crear_orden_rapida(bigint, integer) from public, anon;
grant execute on function crear_orden_rapida(bigint, integer) to authenticated, service_role;
