-- Un producto nuevo debe quedar enlazado a un proveedor activo dentro de la
-- misma transacciÃ³n. Los productos anteriores se pueden completar desde la UI.

-- Conserva primero la asociaciÃ³n activa; quita enlaces obsoletos cuando un
-- producto acumulÃ³ mÃ¡s de una relaciÃ³n. El historial de Ã³rdenes es independiente.
with relaciones_ordenadas as (
  select pp.ctid as fila, row_number() over (
    partition by pp.product_id
    order by pr.activo desc, pp.costo_unitario, pp.proveedor_id
  ) as posicion
  from proveedor_productos pp
  join proveedores pr on pr.id = pp.proveedor_id
)
delete from proveedor_productos pp
using relaciones_ordenadas ro
where pp.ctid = ro.fila and ro.posicion > 1;

create unique index proveedor_productos_producto_unico_idx
  on proveedor_productos(product_id);

create function validar_proveedor_producto_activo()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_activo boolean;
begin
  select activo into v_activo
  from proveedores where id = new.proveedor_id
  for update;
  if v_activo is distinct from true then
    raise exception 'Asigna un proveedor activo al producto.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger proveedor_productos_solo_activos
before insert or update of proveedor_id on proveedor_productos
for each row execute function validar_proveedor_producto_activo();

create function impedir_archivar_proveedor_asignado()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.activo and not new.activo and exists (
    select 1 from proveedor_productos where proveedor_id = old.id
  ) then
    raise exception 'No se puede archivar este proveedor: primero reasigna sus productos a otro proveedor activo.'
      using errcode = '23503';
  end if;
  return new;
end $$;

create trigger proveedores_no_archivar_asignados
before update of activo on proveedores
for each row execute function impedir_archivar_proveedor_asignado();

create function impedir_eliminar_proveedor_asignado()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from proveedor_productos where proveedor_id = old.id) then
    raise exception 'No se puede eliminar este proveedor: primero reasigna sus productos a otro proveedor activo.'
      using errcode = '23503';
  end if;
  return old;
end $$;

create trigger proveedores_no_eliminar_asignados
before delete on proveedores
for each row execute function impedir_eliminar_proveedor_asignado();

-- Impide dejar sin proveedor a un producto nuevo, incluso ante escrituras que
-- no pasan por la interfaz. Es diferido para permitir el alta atÃ³mica del par.
create function comprobar_proveedor_producto()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_producto_id bigint;
begin
  if tg_table_name = 'products' then
    v_producto_id := new.id;
  elsif tg_op = 'DELETE' then
    v_producto_id := old.product_id;
  else
    v_producto_id := new.product_id;
  end if;

  if exists (select 1 from products where id = v_producto_id)
    and not exists (
      select 1 from proveedor_productos pp
      join proveedores p on p.id = pp.proveedor_id and p.activo
      where pp.product_id = v_producto_id
    ) then
    raise exception 'Cada producto debe tener un proveedor activo asignado.' using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger products_requiere_proveedor_insert
after insert on products
deferrable initially deferred
for each row execute function comprobar_proveedor_producto();

create constraint trigger proveedor_productos_no_desasignar
after insert or update or delete on proveedor_productos
deferrable initially deferred
for each row execute function comprobar_proveedor_producto();

create function asignar_proveedor_producto(
  p_proveedor_id bigint,
  p_producto_id bigint,
  p_costo_unitario numeric,
  p_minimo_unidades integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_activo boolean;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','compras']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  if p_costo_unitario is null or p_costo_unitario < 0 then
    raise exception 'El costo unitario debe ser mayor o igual a cero.' using errcode = '23514';
  end if;
  if p_minimo_unidades is null or p_minimo_unidades < 1 then
    raise exception 'El mÃ­nimo de unidades debe ser al menos 1.' using errcode = '23514';
  end if;

  select activo into v_activo from proveedores where id = p_proveedor_id for update;
  if v_activo is distinct from true then
    raise exception 'Selecciona un proveedor activo.' using errcode = '23514';
  end if;
  if not exists (select 1 from products where id = p_producto_id) then
    raise exception 'El producto ya no existe.' using errcode = '23503';
  end if;

  insert into proveedor_productos(proveedor_id, product_id, costo_unitario, minimo_unidades)
  values (p_proveedor_id, p_producto_id, p_costo_unitario, p_minimo_unidades)
  on conflict (product_id) do update set
    proveedor_id = excluded.proveedor_id,
    costo_unitario = excluded.costo_unitario,
    minimo_unidades = excluded.minimo_unidades;
end $$;

create function crear_producto_con_proveedor(p_datos jsonb, p_proveedor_id bigint)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_activo boolean;
  v_producto_id bigint;
  v_nombre text;
  v_categoria text;
  v_stock integer;
  v_minimo integer;
  v_costo numeric;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','almacen']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos del producto no son vÃ¡lidos.' using errcode = '22023';
  end if;

  select activo into v_activo from proveedores where id = p_proveedor_id for update;
  if v_activo is distinct from true then
    raise exception 'Selecciona un proveedor activo para el producto.' using errcode = '23514';
  end if;

  v_nombre := nullif(btrim(p_datos->>'nombre'), '');
  v_categoria := nullif(btrim(p_datos->>'categoria'), '');
  v_stock := (p_datos->>'stock_actual')::integer;
  v_minimo := (p_datos->>'stock_minimo')::integer;
  v_costo := (p_datos->>'costo')::numeric;
  if v_nombre is null or v_categoria is null or v_stock is null or v_minimo is null or v_costo is null then
    raise exception 'Nombre, categorÃ­a, existencias, mÃ­nimo, costo y proveedor son obligatorios.' using errcode = '23502';
  end if;

  insert into products(nombre, categoria, stock_actual, stock_minimo, costo)
  values (v_nombre, v_categoria, v_stock, v_minimo, v_costo)
  returning id into v_producto_id;

  insert into proveedor_productos(proveedor_id, product_id, costo_unitario, minimo_unidades)
  values (p_proveedor_id, v_producto_id, v_costo, 1);
  return v_producto_id;
end $$;

-- Excel antiguo sigue actualizando productos existentes. Para una fila nueva,
-- el archivo debe indicar el nombre exacto de un proveedor activo.
create or replace function importar_productos(p_items jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_codigo text;
  v_nombre text;
  v_categoria text;
  v_stock integer;
  v_minimo integer;
  v_costo numeric;
  v_nombre_proveedor text;
  v_proveedor_id bigint;
  v_proveedor_actual bigint;
  v_coincidencias integer;
  v_producto_id bigint;
  v_costo_relacion numeric;
  v_minimo_relacion integer;
  v_total integer := 0;
  v_repetido text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El archivo no contiene productos.';
  end if;

  select nullif(btrim(x.codigo), '') into v_repetido
  from jsonb_to_recordset(p_items) as x(codigo text)
  where nullif(btrim(x.codigo), '') is not null
  group by nullif(btrim(x.codigo), '')
  having count(*) > 1
  limit 1;
  if v_repetido is not null then
    raise exception 'codigo: ''%'' aparece mÃ¡s de una vez en el archivo.', v_repetido;
  end if;

  for v_item in select items.value from jsonb_array_elements(p_items) as items(value) loop
    v_producto_id := null;
    v_codigo := nullif(btrim(v_item->>'codigo'), '');
    v_nombre := nullif(btrim(v_item->>'nombre'), '');
    v_categoria := coalesce(nullif(btrim(v_item->>'categoria'), ''), 'Sin categorÃ­a');
    v_stock := (v_item->>'stock_actual')::integer;
    v_minimo := (v_item->>'stock_minimo')::integer;
    v_costo := nullif(btrim(v_item->>'costo'), '')::numeric;
    v_nombre_proveedor := nullif(btrim(v_item->>'proveedor'), '');

    select id into v_producto_id from products where codigo = v_codigo;
    if found then
      update products set nombre = v_nombre, categoria = v_categoria,
        stock_actual = v_stock, stock_minimo = v_minimo,
        costo = coalesce(v_costo, costo)
      where id = v_producto_id;
      if v_nombre_proveedor is not null then
        select count(*) into v_coincidencias from proveedores
        where activo and lower(btrim(nombre)) = lower(v_nombre_proveedor);
        if v_coincidencias = 0 then raise exception 'Fila de %: no existe un proveedor activo con ese nombre.', coalesce(v_codigo, 'producto'); end if;
        if v_coincidencias > 1 then raise exception 'Fila de %: el nombre del proveedor no es Ãºnico; corrige el catÃ¡logo.', coalesce(v_codigo, 'producto'); end if;
        select id into v_proveedor_id from proveedores where activo and lower(btrim(nombre)) = lower(v_nombre_proveedor);
        select proveedor_id, costo_unitario, minimo_unidades
          into v_proveedor_actual, v_costo_relacion, v_minimo_relacion
        from proveedor_productos where product_id = v_producto_id;
        insert into proveedor_productos(proveedor_id, product_id, costo_unitario, minimo_unidades)
        values (v_proveedor_id, v_producto_id,
          case when v_proveedor_id = v_proveedor_actual then coalesce(v_costo_relacion, v_costo, 0) else coalesce(v_costo, 0) end,
          case when v_proveedor_id = v_proveedor_actual then coalesce(v_minimo_relacion, 1) else 1 end)
        on conflict (product_id) do update set
          proveedor_id = excluded.proveedor_id,
          costo_unitario = excluded.costo_unitario,
          minimo_unidades = excluded.minimo_unidades;
      end if;
    else
      if v_nombre_proveedor is null then
        raise exception 'La fila nueva % requiere un proveedor activo en la columna proveedor.', coalesce(v_codigo, v_nombre, 'sin cÃ³digo');
      end if;
      select count(*) into v_coincidencias from proveedores
      where activo and lower(btrim(nombre)) = lower(v_nombre_proveedor);
      if v_coincidencias = 0 then raise exception 'Fila de %: no existe un proveedor activo con ese nombre.', coalesce(v_codigo, v_nombre, 'producto'); end if;
      if v_coincidencias > 1 then raise exception 'Fila de %: el nombre del proveedor no es Ãºnico; corrige el catÃ¡logo.', coalesce(v_codigo, v_nombre, 'producto'); end if;
      select id into v_proveedor_id from proveedores where activo and lower(btrim(nombre)) = lower(v_nombre_proveedor);
      insert into products(codigo, nombre, categoria, stock_actual, stock_minimo, costo)
      values (v_codigo, v_nombre, v_categoria, v_stock, v_minimo, coalesce(v_costo, 0))
      returning id into v_producto_id;
      insert into proveedor_productos(proveedor_id, product_id, costo_unitario, minimo_unidades)
      values (v_proveedor_id, v_producto_id, coalesce(v_costo, 0), 1);
    end if;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

revoke all on function asignar_proveedor_producto(bigint,bigint,numeric,integer) from public, anon;
grant execute on function asignar_proveedor_producto(bigint,bigint,numeric,integer) to authenticated, service_role;
revoke all on function crear_producto_con_proveedor(jsonb,bigint) from public, anon;
grant execute on function crear_producto_con_proveedor(jsonb,bigint) to authenticated, service_role;
