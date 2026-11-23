import { useMemo, useState } from "react";

/** Asigna o cambia el proveedor activo de un producto existente. */
export default function AsignacionProveedor({ productos = [], proveedores = [], relaciones = [], ocupado, onGuardar }) {
  const [productoId, setProductoId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [costoUnitario, setCostoUnitario] = useState("0");
  const [minimoUnidades, setMinimoUnidades] = useState("1");
  const porProducto = useMemo(() => {
    const resultado = new Map();
    for (const relacion of relaciones) {
      const actual = resultado.get(relacion.product_id);
      if (!actual || (actual.proveedores?.activo === false && relacion.proveedores?.activo !== false)) {
        resultado.set(relacion.product_id, relacion);
      }
    }
    return resultado;
  }, [relaciones]);
  const producto = productos.find((item) => String(item.id) === productoId);
  const actual = producto ? porProducto.get(producto.id) : null;
  const sinProveedor = productos.filter((item) => !porProducto.get(item.id)?.proveedores?.activo).length;

  function elegirProducto(id) {
    setProductoId(id);
    const seleccionado = productos.find((item) => String(item.id) === id);
    const relacion = seleccionado ? porProducto.get(seleccionado.id) : null;
    setProveedorId(relacion?.proveedores?.activo ? String(relacion.proveedor_id) : "");
    setCostoUnitario(String(relacion?.costo_unitario ?? 0));
    setMinimoUnidades(String(relacion?.minimo_unidades ?? 1));
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (await onGuardar(Number(proveedorId), Number(productoId), Number(costoUnitario), Number(minimoUnidades))) {
      setProductoId("");
      setProveedorId("");
      setCostoUnitario("0");
      setMinimoUnidades("1");
    }
  }

  return <section className="card form-card">
    <h3>Asignar proveedor a producto existente</h3>
    <p>{sinProveedor} de {productos.length} productos no tienen proveedor activo. Puedes seleccionar uno ya asignado para cambiarlo.</p>
    <form className="form-grid" onSubmit={enviar}>
      <label>Producto
        <select value={productoId} onChange={(e) => elegirProducto(e.target.value)} required>
          <option value="">Selecciona un producto</option>
          {productos.map((item) => {
            const relacion = porProducto.get(item.id);
            const estado = relacion?.proveedores?.activo ? ` · ${relacion.proveedores.nombre}` : " · Sin proveedor activo";
            return <option key={item.id} value={item.id}>{item.codigo} — {item.nombre}{estado}</option>;
          })}
        </select>
      </label>
      <label>Proveedor activo
        <select value={proveedorId} onChange={(e) => {
          if (actual && e.target.value !== String(actual.proveedor_id)) {
            setCostoUnitario("");
            setMinimoUnidades("1");
          }
          setProveedorId(e.target.value);
        }} required>
          <option value="">Selecciona un proveedor</option>
          {proveedores.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
        </select>
      </label>
      {actual && proveedorId && proveedorId !== String(actual.proveedor_id) && <p className="field-note">Al cambiar de proveedor, confirma el costo unitario actualizado.</p>}
      <label>Costo unitario ($)<input type="number" min="0" step="0.01" value={costoUnitario} onChange={(e) => setCostoUnitario(e.target.value)} required /></label>
      <label>Mínimo de unidades<input type="number" min="1" step="1" value={minimoUnidades} onChange={(e) => setMinimoUnidades(e.target.value)} required /></label>
      <button className="primary" disabled={ocupado || !productoId || !proveedorId || proveedores.length === 0}>Guardar asignación</button>
    </form>
  </section>;
}
