import { useCallback, useEffect, useState } from "react";
import Pagina from "../componentes/Pagina.jsx";
import { cargarResumen, importarMovimientos, listarMovimientos } from "../lib/api.js";
import { crearPlantillaMovimientos, descargar, leerExcelMovimientos, revisarArchivo } from "../lib/excel.js";
import { fechaLocal } from "../lib/fechas.js";
import { usePerfil } from "../lib/perfil.jsx";

const mayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
const motivos = {
  sin_clasificar: "Sin clasificar",
  compra: "Compra o recepción",
  devolucion: "Devolución",
  venta: "Venta",
  merma: "Merma",
  ajuste: "Ajuste",
  otro: "Otro",
};

function resumenImportacion({ agregados, omitidos }) {
  const partes = [`${agregados} movimiento(s) nuevo(s) agregado(s) y stock actualizado`];
  if (omitidos > 0) partes.push(`${omitidos} fila(s) omitida(s) porque ya se habían importado`);
  return `Importación completada: ${partes.join("; ")}.`;
}

// Tarjeta para importar movimientos desde Excel (Admin y Almacén).
function ImportarMovimientos({ ocupado, onImportar, onPlantilla }) {
  async function enviar(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    if (await onImportar(formulario.elements.archivo.files[0])) formulario.reset();
  }
  return (
    <section className="card">
      <h3>Importar movimientos desde Excel</h3>
      <p>
        Columnas: <code>codigo, fecha, tipo, motivo, cantidad</code> e <code>id_movimiento</code> opcional al final. Usa un ID estable del sistema de origen para distinguir movimientos iguales; junto con el SKU evita reimportar la misma fila. Los archivos anteriores sin esa columna siguen funcionando. Si una fila ya se importó sin ID, no le agregues uno para reimportarla: no se puede asociar con certeza al registro anterior.
        Tipo: <strong>entrada</strong> (compra, devolucion, ajuste, otro)
        o <strong>salida</strong> (venta, merma, ajuste, otro). Se revisa todo el archivo antes de guardar: si una fila nueva tiene un error
        o dejaría el stock en negativo, no se guarda nada. Si vuelves a subir un archivo, las filas que ya estaban importadas se omiten.
      </p>
      <form className="stack import-form" onSubmit={enviar}>
        <label>Archivo .xlsx<input type="file" name="archivo" accept=".xlsx" required /></label>
        <button disabled={ocupado}>Importar movimientos</button>
      </form>
      <button type="button" className="link-button download" disabled={ocupado} onClick={onPlantilla}>Descargar plantilla de movimientos</button>
    </section>
  );
}

// Historial de entradas y salidas; Admin y Almacén pueden importar desde Excel.
export default function Movimientos() {
  const perfil = usePerfil();
  const puedeImportar = perfil.role === "admin" || perfil.role === "almacen";
  const [movimientos, setMovimientos] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [lista, r] = await Promise.all([listarMovimientos(), cargarResumen()]);
      setMovimientos(lista);
      setResumen(r);
    } catch (motivo) {
      setMovimientos((actual) => actual ?? []);
      setAviso({ tipo: "error", texto: motivo.message });
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function importar(archivo) {
    setOcupado(true);
    try {
      revisarArchivo(archivo);
      const items = await leerExcelMovimientos(await archivo.arrayBuffer());
      const resultado = await importarMovimientos(items);
      setAviso({ tipo: "success", texto: resumenImportacion(resultado) });
      await cargar();
      return true;
    } catch (motivo) {
      setAviso({ tipo: "error", texto: motivo.message });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function plantilla() {
    try {
      descargar(await crearPlantillaMovimientos(), "plantilla_movimientos.xlsx");
    } catch (motivo) {
      setAviso({ tipo: "error", texto: motivo.message });
    }
  }

  return (
    <Pagina resumen={resumen} aviso={aviso}>
      <div className="page-title">
        <div><h2>Movimientos</h2><p>Últimas 200 entradas y salidas registradas.</p></div>
      </div>
      {puedeImportar && <ImportarMovimientos ocupado={ocupado} onImportar={importar} onPlantilla={plantilla} />}
      <section className="card table-card">
        {movimientos === null && <p className="cargando">Cargando movimientos…</p>}
        {movimientos !== null && movimientos.length === 0 && <p>Todavía no hay movimientos.</p>}
        {movimientos !== null && movimientos.length > 0 && (
          <div className="table-scroll tabla-tarjetas">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Código</th><th>Producto</th><th>Tipo</th><th>Motivo</th><th>Unidades</th><th>Antes</th><th>Después</th><th>Origen</th></tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td data-etiqueta="Fecha">{fechaLocal(m.created_at)}</td>
                    <td data-etiqueta="Código">{m.product_code}</td>
                    <td data-etiqueta="Producto">{m.product_name}</td>
                    <td data-etiqueta="Tipo">{mayuscula(m.tipo)}</td>
                    <td data-etiqueta="Motivo">{motivos[m.motivo] ?? motivos.sin_clasificar}</td>
                    <td data-etiqueta="Unidades">{m.cantidad}</td>
                    <td data-etiqueta="Antes">{m.stock_anterior}</td>
                    <td data-etiqueta="Después">{m.stock_nuevo}</td>
                    <td data-etiqueta="Origen">{m.import_key || m.source_id ? "Excel" : "Manual"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Pagina>
  );
}
