# Cambios recientes

## Orden rápida para productos en atención

- La migración `0025_orden_rapida_atencion.sql` amplía el borrador rápido a productos con stock disponible si están bajo mínimo o su cobertura calculada con ventas de 30 días es de hasta 14 días.
- El servidor vuelve a calcular la cobertura y valida el estado al ejecutar la RPC; un producto que ya dejó de requerir atención no genera una orden.
- La migración está en `feat/orden-rapida-bajo-minimo` y todavía no se ha ejecutado en Supabase.

## Crear borradores desde correos de alerta

- Las alertas de stock agregan un enlace por producto para crear un borrador desde el Dashboard. Al abrirlo con sesión de Admin o Compras, la app valida el producto mediante `crear_orden_rapida` y lleva a la orden creada.
- El correo HTML y el texto plano incluyen las acciones; `APP_URL` es requerido para generar los enlaces.
- La implementación está en `feat/orden-desde-alerta-stock`, apilada sobre `feat/orden-rapida-bajo-minimo`. Falta revisar, integrar, aplicar la migración `0025`, desplegar la Edge Function y verificar envío SMTP real.

## Integración de funcionalidades de entrega final — 2026-11-23

- Las PR #2, #3, #4, #6 y #5 quedaron fusionadas en `main`, en ese orden de dependencias; la PR #6 se integró antes de #5 por la secuencia de migraciones.
- Se revisó y resolvió el conflicto documental de `PLAN_ENTREGA_FINAL.md`; no hubo conflicto pendiente de código.
- Verificación local sobre el código integrado: **227 pruebas aprobadas** y `npm run build` correcto. GitHub no reportó checks automatizados.
- Las migraciones `0021`–`0024` ya estaban aplicadas y verificadas en Supabase; durante esta integración no se ejecutaron migraciones.
- Las tareas funcionales restantes y sus criterios están listados en `PLAN_ENTREGA_FINAL.md` y `Implementaciones_2.md`. La evidencia de tres correos SMTP de alertas de stock sigue pendiente en `EVIDENCIA_ALERTAS.md`.

## Historial de alertas y codificación

- La reposición hasta el mínimo se calcula como faltante por costo unitario del catálogo. El costo sugerido por pronóstico queda separado.
- Las órdenes usan `products.costo` como costo de compra consistente; las alertas y órdenes guardadas se actualizan en la migración `0011_costos_alertas_utf8.sql`.
- El correo, las respuestas JSON y la exportación CSV declaran o conservan UTF-8; el CSV incorpora BOM.
- El historial incorpora filtros por tipo, estado, fechas y producto, agrupación diaria, resumen de criticidad, barras de nivel y estados más visibles.
- El banner de modo simulado consulta el estado actual del backend.

Verificación registrada: `npm.cmd test` (166 pruebas) y `npm.cmd run build` completaron correctamente antes de estos commits.

## Eliminación de productos con historial de compra

- La migración `0012_productos_borrados_ordenes.sql` guarda código y nombre en cada línea de orden y cambia la referencia al producto a `ON DELETE SET NULL`.
- La página de órdenes muestra esos snapshots cuando el producto ya no está en el catálogo.
- Al recibir una línea sin producto enlazado, el sistema busca un producto re-creado con el mismo código; si no existe, muestra un error claro.

## Borrado masivo del inventario

- La pantalla de inventario ofrece el borrado masivo solo al rol administrador.
- Requiere aceptar una confirmación con el número de productos y escribir `ELIMINAR` en el segundo paso.
- La operación se ejecuta como una sola petición y muestra cuántos productos eliminó; movimientos y snapshots de órdenes permanecen.

## Categorías al registrar productos

- El alta permite elegir una categoría ya usada o seleccionar “Crear una categoría nueva” y escribirla.
- Las categorías siguen derivándose de los productos, sin tabla ni dependencia adicional.
- Se normalizan por espacios, mayúsculas y acentos para reutilizar una categoría existente cuando el texto equivale.

## Eliminación de proveedores

- La lista de proveedores muestra la acción de borrar solo a administradores y pide confirmación antes de proceder.
- Si hay órdenes asociadas, la clave foránea impide el borrado y la interfaz explica que conserva el proveedor para proteger el historial.
- La migración `0013_eliminar_proveedores_admin.sql` mantiene la gestión de alta/edición para compras, pero reserva el permiso DELETE al rol administrador.

### Archivo automático cuando existe historial

- Si la base impide borrar un proveedor por sus órdenes asociadas, la acción lo marca como inactivo en vez de fallar.
- Los proveedores archivados aparecen en una sección separada y ya no se ofrecen al asignar nuevos productos.
- Sin órdenes asociadas, el proveedor se elimina físicamente.
- Un selector permite alternar entre activos y archivados. La tabla muestra contacto, plazo, estado y acciones para crear, editar, archivar/reactivar o eliminar.

## Acciones y movimientos del inventario

- La acción de eliminar producto aparece en una fila separada para no encimarse con los formularios desplegables de movimiento y edición.
- El formulario de movimiento explica que una entrada suma stock y una salida lo resta, y describe los motivos de venta, merma, ajuste y otro.
- Los motivos dependen del sentido: las entradas ofrecen compra/recepción, devolución, ajuste positivo u otro; las salidas ofrecen venta, merma, ajuste negativo u otro.
- La migración `0014_motivos_movimiento_por_tipo.sql` permite guardar y validar esos motivos sin cambiar los movimientos históricos.

## Filtros de órdenes de compra

- Las órdenes se pueden filtrar por fechas, estado, proveedor, producto y rango de monto total.
- Cada tarjeta muestra el monto final calculado con las cantidades y costos unitarios de sus líneas.
- El ordenamiento permite fecha ascendente/descendente y monto ascendente/descendente; por defecto muestra primero la orden más reciente.

## Códigos automáticos de producto

- Los productos nuevos reciben un código incremental `PROD-000001` asignado por Supabase; los códigos existentes se conservan.
- El formulario de alta ya no solicita código y la edición lo muestra como solo lectura. La base rechaza cambios directos al código.
- En Excel, el código identifica productos existentes para actualizarlos; para las filas nuevas la base genera un código automático.
- La migración `0015_codigos_producto_automaticos.sql` crea la secuencia y las protecciones de base de datos.

## Proveedores sin compra mínima

- El registro y directorio de proveedores ya no muestran ni escriben el monto de compra mínima; el valor heredado en la base se ignora.
- Los nuevos borradores de orden ya no aumentan cantidades para alcanzar ese monto; se conservan plazo de entrega y mínimo de unidades por producto.
- La migración `0016_ignorar_compra_minima_proveedor.sql` actualiza la generación de borradores. Las órdenes que ya existían no se modifican.

## Orden rápida para productos agotados

- En “Reabastecer primero”, Compras y admin pueden armar una orden desde cada producto con stock cero.
- Se elige el proveedor activo asignado con menor costo cotizado y se usa la cantidad sugerida, respetando el mínimo de unidades del producto.
- La acción crea o reutiliza un borrador sin alerta asociada; si el producto no tiene proveedor activo, muestra el motivo.
- La migración `0017_orden_rapida_producto_agotado.sql` valida permisos, existencia de stock cero y crea la línea del pedido.

## Identificador estable en importación de movimientos

- La plantilla de Excel incluye `id_movimiento` opcional al final. El ID debe ser estable en el sistema de origen y se interpreta junto con el SKU.
- Con ID, los movimientos idénticos con IDs distintos se importan por separado; repetir el mismo SKU + ID omite la fila. Reutilizar ese par con otros datos produce error para evitar alterar el historial silenciosamente.
- Los archivos antiguos sin la columna siguen funcionando y conservan la deduplicación por contenido y posición de filas idénticas. No agregues IDs retroactivos a filas ya importadas sin ID: no pueden asociarse con certeza a su registro previo.
- La migración `0023_id_movimiento_importado.sql` agrega el campo e instala la lógica transaccional en la RPC.
- Aplicación remota confirmada el 2026-11-23: migraciones `0021`, `0022` y `0023` ejecutadas y registradas en el historial de Supabase.
## Auditoría SQL de migraciones antiguas

Consulta remota de solo lectura realizada el 2026-11-23. No se ejecutó ninguna migración antigua.

- `0011`: solo se ejecutó manualmente la definición de `crear_alerta_stock_bajo` (líneas 1–56); el archivo completo no se aplicó. No ejecutar el resto porque reemplazaría `crear_ordenes_desde_alerta` y reescribiría datos históricos. Su versión completa no está registrada.
- `0012`: columnas snapshot obligatorias, FK con `ON DELETE SET NULL`, trigger de snapshots y funciones para enviar/recibir órdenes presentes.
- `0013`: las cuatro políticas de proveedores presentes; el borrado está limitado a admin.
- `0014`: restricciones entrada/salida y RPC de movimiento con motivo presentes.
- `0015`: secuencia SKU, triggers de asignación/inmutabilidad y RPC de importación de productos presentes.
- `0016`: RPC de órdenes usa mínimo por producto/proveedor y no aplica compra mínima del proveedor.
- `0017`: RPC de orden rápida presente.
- `0018`: catálogo persistente, valor predeterminado, trigger y política de lectura presentes.
- `0019`: restricción de motivo global incluye `compra`.
- Se registraron `0012`–`0019` como aplicadas con `supabase migration repair` después de verificar sus efectos; el comando no ejecutó SQL. `0011` permanece sin registrar por estar aplicada solo parcialmente. No ejecutar `supabase db push` mientras esa brecha exista.

## Orden rápida para productos en atención

- La migración `0025_orden_rapida_atencion.sql` amplía el borrador rápido a productos con stock disponible si están bajo mínimo o su cobertura calculada con ventas de 30 días es de hasta 14 días.
- El servidor vuelve a calcular la cobertura y valida el estado al ejecutar la RPC; un producto que ya dejó de requerir atención no genera una orden.
- La migración está en `feat/orden-rapida-bajo-minimo` y todavía no se ha ejecutado en Supabase.
