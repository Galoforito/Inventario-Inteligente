# Implementaciones 2 · Entrega final

**Periodo:** 22 y 23 de noviembre de 2026
**Base:** `main` del fork `Galoforito/Inventario-Inteligente` (commit `b9776a7`)
**Alcance:** tareas 1 a 5 asignadas (categorías, historial y pronóstico, Dashboard, importación de movimientos, PDF de órdenes), el aviso de entrega incompleta pedido después, ajustes de interfaz y los fallos encontrados en el camino.

Este documento resume qué se cambió, dónde está, qué se aplicó en Supabase y qué queda pendiente. El detalle de requisitos sigue en [`PLAN_ENTREGA_FINAL.md`](PLAN_ENTREGA_FINAL.md).

---

## 1. Ramas y pull requests

Las ramas van encadenadas: cada una parte de la anterior. Se integran **en este orden**.

| Orden | Rama | Contenido | Pull request |
|---:|---|---|---|
| 1 | `chore/fase0-base` | Categorías persistentes (0018), corrección del motivo "compra" (0019), pruebas al día | hacia `main` |
| 2 | `feat/historial-pronostico` | Pronóstico solo con ventas, pestaña Dashboard, tabla compacta | hacia `chore/fase0-base` |
| 3 | `feat/importar-movimientos` | Importador de movimientos desde Excel (0021) | hacia `feat/historial-pronostico` |
| 4 | `feat/pdf-ordenes` | PDF profesional, aviso de entrega incompleta (0023), ventana emergente de la app, ajustes de Usuarios y encabezado | hacia `feat/importar-movimientos` |

> Los pull requests se abren en **`Galoforito/Inventario-Inteligente`**. GitHub propone por defecto el repositorio original (`CarlosGlez/...`); hay que cambiar *base repository* antes de crearlos.

---

## 2. Migraciones de base de datos

Todas están aplicadas y verificadas en el Supabase remoto. El historial `supabase_migrations.schema_migrations` solo registra hasta `0010` porque desde la `0011` se aplican a mano en SQL Editor; la verificación se hizo consultando los objetos de la base.

| Migración | Qué hace | Estado remoto |
|---|---|---|
| `0011` (solo líneas 1–56) | Función `crear_alerta_stock_bajo` con faltante exacto | Aplicada 2026-11-22. **No aplicar el archivo completo:** revertiría `0016` y reescribiría costos de órdenes ya enviadas |
| `0014` | Motivos de entrada y salida por tipo | Aplicada 2026-11-22 (no lo estaba) |
| `0018_categorias.sql` | Catálogo persistente de categorías + trigger | Aplicada y verificada 2026-11-22 |
| `0019_motivo_compra_movimientos.sql` | Quita la restricción de `0007` que rechazaba el motivo `compra` | Aplicada y verificada 2026-11-22 |
| `0020` | **Reservada para el compañero** (proveedor único / ciclo de orden) | — |
| `0021_importar_movimientos.sql` | `movements.import_key`, función `importar_movimientos`, alertas solo con ventas | Aplicada y verificada 2026-11-23 |
| `0022_alerta_ventas_diarias.sql` | **Del compañero:** corrige el promedio ponderado de las alertas cuando hay varias ventas el mismo día | Comprobar si ya está aplicada en remoto |
| `0023_entrega_incompleta.sql` | Tipo de aviso `entrega_incompleta`, `ordenes_compra.incompleta_alert_id`, función `preparar_correo_entrega_incompleta` | Aplicada 2026-11-23 (se creó como `0022` y se renombró porque el compañero también usó `0022`; el nombre del archivo no afecta a la base) |

La Edge Function `revisar-inventario` se volvió a desplegar el 2026-11-23 con `npx supabase functions deploy revisar-inventario --use-api`.

---

## 3. Cambios por tarea

### Tarea 1 · Catálogo persistente de categorías
- Se integró la rama `feat/catalogo-categorias-persistente` del compañero.
- **Protección añadida:** si la tabla `categorias` no existe (migración sin aplicar), Inventario sigue cargando con las categorías de los productos. Antes la pantalla completa fallaba.
- La lista de categorías combina el catálogo con las que ya usan los productos.
- Archivos: `web/src/lib/api.js`, `web/src/paginas/Inventario.jsx`.

### Tarea 2 · Historial y pronóstico
- **La demanda cuenta solo ventas** (salidas con motivo `venta`); mermas y ajustes ya no inflan el consumo.
- **El promedio divide entre todos los días del periodo**, incluidos los días sin ventas. Antes dividía entre los días desde la primera salida.
- Funciones nuevas `ventanaVentas` y `resumenVentas` para historial de **30/60/90 días** y horizonte de pronóstico de **7/30/90 días**.
- `analizarProductos()` es la única función de cálculo; la usan Inventario y Dashboard, así sus números coinciden.
- Se retiró la columna "Pronóstico" (minigráfico) de Inventario. "Sin consumo" pasa a **"Sin rotación"**.
- Archivos: `web/src/lib/pronostico.js`, `web/src/lib/pronostico-avanzado.js`, `web/src/paginas/Inventario.jsx`, `web/src/componentes/TablaProductos.jsx`.

> Efecto visible: los días de "Se agota en" pueden cambiar respecto a la versión anterior, porque ahora usan la regla acordada.

### Tarea 3 · Dashboard
Nueva pestaña para todos los roles (`/dashboard`):
1. **Tarjetas:** agotados, bajo el mínimo, valor del inventario (con valor inmovilizado sin rotación) y costo total del faltante.
2. **Cobertura por categoría:** barras con estado escrito (no solo color). Al pulsar una categoría se filtra todo el Dashboard.
3. **Tabla "Requiere atención":** producto, categoría, stock/mínimo, cobertura, fecha de agotamiento, sugerido, costo del faltante, proveedor, estado y botón de orden.
4. **Pronóstico del producto:** ventas reales, estimación, banda de confianza, fecha de agotamiento, selectores 30/60/90 y 7/30/90, detalle al pasar el cursor y tabla de datos.
5. **Valor del inventario por categoría.**

Reglas implementadas (`web/src/lib/dashboard.js`):
- Cobertura = stock ÷ ventas diarias promedio de 30 días. Por categoría: suma de stock ÷ suma de consumo (no promedio de coberturas).
- Semáforo: **crítico** (stock 0 o < 7 días), **atención** (bajo mínimo o 7–14 días), **exceso** (> 90 días), **saludable** (resto). Sin ventas: **sin rotación** (neutro), salvo agotado o bajo mínimo.
- Categoría requiere atención con un crítico o más de 25 % en rojo/ámbar.
- Botón de orden: Compras/Admin, para todos los productos en atención con proveedor (cambio del compañero, `a00ea7d`). La orden rápida de la base (0017) aún solo acepta agotados.
- Proveedor mostrado: el activo de menor costo, el mismo que elige `crear_orden_rapida`.
- Colores de la gráfica validados para daltonismo y contraste contra el fondo de la app.

Archivos: `web/src/paginas/Dashboard.jsx`, `web/src/componentes/GraficaPronostico.jsx`, `web/src/lib/dashboard.js`.

### Tarea 4 · Importación de movimientos
- Tarjeta en **Movimientos** para Admin y Almacén, con **plantilla descargable** (dos filas de ejemplo y hoja de instrucciones).
- Columnas: `codigo, fecha, tipo, motivo, cantidad`. Acepta fecha de Excel, `AAAA-MM-DD` y `DD/MM/AAAA`; motivos con o sin acentos y con las etiquetas de la app.
- **Valida todo antes de guardar** y lista todos los errores con su fila de Excel.
- **Todo o nada:** si una fila nueva es inválida o deja el stock negativo, no se guarda ninguna.
- **Respeta la fecha del archivo** (se guarda a mediodía UTC para no cambiar de día).
- **Sin duplicados al reimportar:** cada fila guarda la clave `código|fecha|tipo|motivo|cantidad|n`. Dos filas idénticas en un mismo archivo entran ambas; reimportar las omite. Al final se muestra cuántas se agregaron y cuántas se omitieron.
- Columna **"Origen"** (Excel / Manual) en la tabla de movimientos.
- Verificación remota: importar 2 filas idénticas → 2 agregadas; reimportar esas 2 + 1 nueva → 1 agregada, 2 omitidas; stock 0 → 8.
- Archivos: `supabase/migrations/0021_importar_movimientos.sql`, `web/src/lib/importar-movimientos.js`, `web/src/lib/excel.js`, `web/src/paginas/Movimientos.jsx`.

### Tarea 5 · PDF profesional de órdenes
- El botón **"Exportar a PDF"** abre una vista previa con formato y el botón *Imprimir / Guardar como PDF*.
- Contenido: logo SVG propio, nombre comercial, razón social, RFC, dirección y contacto; folio, fechas de emisión y envío, estado; proveedor (correo, teléfono, días de entrega); dirección de entrega y fecha estimada; tabla con SKU, producto, cantidad, recibido, costo unitario y subtotal; partidas, unidades y total; condiciones de pago, instrucciones de entrega y firmas (Elaboró, Autorizó, Recibió en almacén).
- Tamaño carta, **encabezado de tabla repetido en cada página** y "Página X de Y". Las órdenes en borrador llevan marca de agua.
- El total sale de la misma función que la pantalla de Órdenes.
- **Datos del negocio ficticios** por decisión del equipo ("Distribuidora Monteverde de Oficina, S.A. de C.V.", RFC `DMO180612HT4`). Se cambian solo en `web/src/lib/negocio.js`. No se agrega IVA para que el total coincida con la orden.
- Archivos: `web/src/lib/orden-pdf.js`, `web/src/lib/negocio.js`, `web/src/paginas/Ordenes.jsx`.

---

## 4. Aviso de entrega incompleta (requisito añadido)

Cuando una orden llega incompleta se avisa al proveedor por correo y se le pide un curso de acción.

- **Botón "Reportar entrega incompleta"** en Órdenes, para Compras y Admin, cuando la orden está en `recibida parcial`.
- Abre una **ventana de la app** con el correo del proveedor, una tabla de pedidas/recibidas/faltan, el valor pendiente y una nota opcional (máx. 500 caracteres).
- El correo lista lo faltante por producto y pide: enviar lo faltante con nueva fecha, o ajustar orden y factura.
- **Una sola vez por orden**; después se muestra "Faltante reportado al proveedor".
- Queda en **Historial de alertas** como "Entrega incompleta" (con filtro). Si falla, *Reintentar envío* lo manda otra vez **al proveedor**.
- **Es manual a propósito:** la recepción se registra línea por línea y la orden pasa por `recibida parcial` mientras se cuenta; un envío automático mandaría avisos falsos.
- El bot no reenvía por su cuenta los correos a proveedores (`orden_compra`, `entrega_incompleta`).
- La app solo muestra "enviado" si el servidor lo confirma; con una función desactualizada avisa que hay que desplegarla.
- Verificado con correo real el 2026-11-23.
- Archivos: `supabase/migrations/0023_entrega_incompleta.sql`, `supabase/functions/revisar-inventario/{index,entrega,plantillas}.ts`, `web/src/componentes/Modal.jsx`, `web/src/paginas/Ordenes.jsx`, `web/src/paginas/Alertas.jsx`, `web/src/lib/api.js`.

---

## 5. Fallos encontrados y corregidos

| Fallo | Efecto | Corrección |
|---|---|---|
| `0011` y `0014` nunca se aplicaron en remoto | Las **entradas con motivo Compra, Devolución o Ajuste fallaban** en producción | Se aplicaron (la `0011` solo su función de alertas) |
| `0014` dejaba vigente `movements_motivo_check` de `0007` | El motivo `compra` seguía rechazado aunque se aplicara `0014` | Nueva migración `0019` |
| La consulta a `categorias` era obligatoria | Inventario dejaba de cargar si `0018` no estaba aplicada | Carga tolerante (tarea 1) |
| `consumo_30d` mezcla ventas con mermas y ajustes | Pronóstico y alertas sobrestimaban la demanda | App y alertas usan solo ventas (`0021`) |
| `index.ts` usaba `htmlCorreo` **sin importarlo** | **"Enviar al proveedor" fallaba siempre** con correo real | Importación añadida + prueba que la verifica |
| README listaba 4 archivos de la Edge Function | Un despliegue por el panel quedaba sin `plantillas.ts` | Corregido a 5 archivos |
| Pruebas desactualizadas (5) | 164/166 en verde | Actualizadas a la interfaz actual |

---

## 6. Ajustes de interfaz

- **Encabezado compacto:** título y sesión en una fila, pestañas debajo; etiqueta "Rol: …"; en celular se oculta la descripción y las pestañas se deslizan.
- **Usuarios y roles:** columna Usuario con ID abreviado, descripción de cada rol, estado "Activo/Inactivo", "Guardar" solo habilitado con cambios y fila marcada mientras hay cambios sin guardar.
- **Tabla "Requiere atención":** stock y mínimo en una columna, encabezados cortos, sin cortes de línea y desplazamiento dentro de la tarjeta.
- **Ventana emergente propia** (`Modal.jsx`): se cierra con Escape, × o clic fuera; mantiene el foco dentro. Reutilizable para el resto de confirmaciones.

---

## 7. Pruebas

- **225 pruebas automáticas en verde** (empezamos en 164/166) y build correcto.
- Pruebas nuevas: cálculos del Dashboard (consumo cero, categoría vacía, stock cero, redondeo, regla del 25 %), pronóstico (30/60/90, 7/30/90, días sin ventas), importación (fechas, motivos, encabezados, errores por fila, plantilla), PDF (total, escape de texto, paginación), correo de entrega incompleta, permisos por rol en botones, Usuarios.
- **En Windows**, ejecutar las pruebas desde una ruta con la unidad en mayúscula:
  ```powershell
  cd D:\Vscode\Final\web
  npm test
  ```
  Con `d:\` en minúscula Vitest carga sus módulos dos veces y todos los archivos fallan con `Cannot read properties of undefined (reading 'config')`.

---

## 8. Pendiente

**Del compañero (según el plan):**
- Proveedor único por producto, obligatorio en el alta (usar migración `0020`).
- Ciclo de orden borrador → enviada → **confirmada** → recepción, bloqueado también en la base.
- Botón "Crear orden" en el correo de alerta de stock. El compañero ya habilitó "Armar orden" del Dashboard para todos los productos en atención; falta que `crear_orden_rapida` acepte productos con stock > 0 (hoy los rechaza: "El producto ya no está agotado").
- Rol Consulta con acceso de solo lectura a Órdenes.

**Del equipo:**
- Integrar los cuatro pull requests en orden.
- Evidencia de correo real: tres envíos con `scripts/probar_correo.ps1` en `EVIDENCIA_ALERTAS.md`.
- Volver a correr la evaluación del pronóstico (`python scripts/evaluar_pronostico.py`) porque cambió la regla del promedio.
- Cargar datos de demo en el Supabase remoto.
- Documentación académica, presentación y demo en vivo.
- Opcional: llevar a la ventana de la app las confirmaciones que aún usan el cuadro del navegador (Registrar recepción, Eliminar producto, Borrar todos los productos).
- Volver a `DEMO_MODE=true` después de la demo.
