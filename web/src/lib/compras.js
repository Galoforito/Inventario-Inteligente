// Reglas de cantidad al armar una orden de compra. Las mismas que aplica la base
// (crear_ordenes_agrupadas y actualizar_cantidad_linea_borrador, migración 0029).

/** Lo que falta para llegar al stock mínimo; al menos 1. */
export const minimoParaStock = (p) => Math.max(1, Number(p.stock_minimo ?? 0) - Number(p.stock_actual ?? 0));

/** Mínimo que se puede pedir: lo que falta para el stock mínimo y lo que vende como mínimo el proveedor. */
export const minimoCompra = (p) => Math.max(minimoParaStock(p), Number(p.proveedor_minimo_unidades) || 1);

/** Cantidad que se propone: la sugerida (mínimo o 14 días de ventas), nunca menos que el mínimo. */
export const cantidadPropuesta = (p) => Math.max(minimoCompra(p), Number(p.sugerido) || 0);

/** Devuelve el error de una cantidad escrita, o null si es válida. */
export function errorCantidad(producto, texto) {
  const valor = String(texto ?? "").trim();
  if (!/^\d+$/.test(valor)) return "Escribe un número entero.";
  const cantidad = Number(valor);
  const minimo = minimoCompra(producto);
  if (cantidad < minimo) {
    return minimoParaStock(producto) >= minimo
      ? `Mínimo ${minimo}: lo que falta para llegar al stock mínimo.`
      : `Mínimo ${minimo}: es lo menos que vende el proveedor.`;
  }
  if (cantidad > 1000000) return "La cantidad es demasiado grande.";
  return null;
}
