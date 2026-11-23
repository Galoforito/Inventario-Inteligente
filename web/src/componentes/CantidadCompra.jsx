import { useState } from "react";
import Modal from "./Modal.jsx";
import { cantidadPropuesta, errorCantidad, minimoCompra, minimoParaStock } from "../lib/compras.js";
import { dinero } from "../lib/dinero.js";

// Ventana para elegir cuántas unidades comprar de cada producto antes de crear
// el borrador. Propone la cantidad sugerida y no deja bajar del mínimo.
//   productos: [{ id, codigo, nombre, stock_actual, stock_minimo, sugerido, costo, proveedor, proveedor_minimo_unidades }]
export default function CantidadCompra({ productos, ocupado, onConfirmar, onCerrar }) {
  const [cantidades, setCantidades] = useState(() => Object.fromEntries(productos.map((p) => [p.id, String(cantidadPropuesta(p))])));
  const errores = Object.fromEntries(productos.map((p) => [p.id, errorCantidad(p, cantidades[p.id])]));
  const hayErrores = Object.values(errores).some(Boolean);
  const total = productos.reduce((s, p) => s + (errores[p.id] ? 0 : Number(cantidades[p.id]) * (Number(p.costo) || 0)), 0);
  const nombreProveedor = (p) => (typeof p.proveedor === "string" ? p.proveedor : p.proveedor?.nombre) ?? "Sin proveedor";
  const proveedores = new Set(productos.map(nombreProveedor));

  return (
    <Modal titulo={productos.length === 1 ? "Armar orden de compra" : `Armar órdenes de compra (${productos.length} productos)`}
      onCerrar={onCerrar} ocupado={ocupado}
      acciones={<>
        <button type="button" disabled={ocupado} onClick={onCerrar}>Cancelar</button>
        <button type="button" className="primary" disabled={ocupado || hayErrores}
          onClick={() => onConfirmar(productos.map((p) => ({ producto_id: p.id, cantidad: Number(cantidades[p.id]) })))}>
          {ocupado ? "Creando…" : proveedores.size > 1 ? `Crear ${proveedores.size} borradores` : "Crear borrador"}
        </button>
      </>}>
      <p>Elige cuántas unidades comprar. No se puede pedir menos de lo que falta para llegar al <strong>stock mínimo</strong>{" "}
        (ni menos de lo que vende como mínimo el proveedor). Se crea un borrador por proveedor.</p>
      <div className="table-scroll">
        <table className="modal-tabla tabla-cantidades">
          <thead><tr><th>Producto</th><th className="num">Stock / mín.</th><th className="num">Mínimo</th><th>Cantidad</th></tr></thead>
          <tbody>{productos.map((p) => (
            <tr key={p.id}>
              <td><span className="mono">{p.codigo}</span><small className="sub">{p.nombre} · {nombreProveedor(p)}</small></td>
              <td className="num">{p.stock_actual} / {p.stock_minimo}</td>
              <td className="num" title={minimoParaStock(p) < minimoCompra(p) ? "Mínimo de venta del proveedor" : "Lo que falta para el stock mínimo"}>{minimoCompra(p)}</td>
              <td>
                <input type="number" min={minimoCompra(p)} step="1" inputMode="numeric" aria-label={`Cantidad de ${p.codigo}`}
                  aria-invalid={Boolean(errores[p.id])} disabled={ocupado} value={cantidades[p.id]}
                  onChange={(e) => setCantidades((c) => ({ ...c, [p.id]: e.target.value }))} />
                {errores[p.id] && <small className="campo-error" role="alert">{errores[p.id]}</small>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="muted">Costo estimado: <strong>{dinero(total)}</strong> (al costo de catálogo).</p>
    </Modal>
  );
}
