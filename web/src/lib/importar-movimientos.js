// Validación del Excel de movimientos. Las reglas son las mismas que aplica la
// base (importar_movimientos); aquí se revisan antes para mostrar todos los
// errores juntos, con su número de fila, sin enviar nada.
import { enteroNoNegativo } from "./validar.js";

export const ENCABEZADOS_MOVIMIENTOS = ["codigo", "fecha", "tipo", "motivo", "cantidad"];
export const MAXIMO_MOVIMIENTOS = 5000;

export const MOTIVOS_POR_TIPO = {
  entrada: ["compra", "devolucion", "ajuste", "otro"],
  salida: ["venta", "merma", "ajuste", "otro"],
};

// Se aceptan las claves y las etiquetas que muestra la app, sin importar acentos ni mayúsculas.
const SINONIMOS_MOTIVO = {
  compra: "compra", "compra o recepcion": "compra", recepcion: "compra",
  devolucion: "devolucion",
  ajuste: "ajuste", "ajuste positivo": "ajuste", "ajuste negativo": "ajuste",
  venta: "venta", merma: "merma", otro: "otro",
};

const normalizar = (valor) => String(valor ?? "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const estaVacio = (valor) => valor === null || valor === undefined || String(valor).trim() === "";
const dos = (n) => String(n).padStart(2, "0");

/** Fecha local de hoy como "YYYY-MM-DD". */
export function hoyLocal(ahora = new Date()) {
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
}

/**
 * Convierte la celda de fecha a "YYYY-MM-DD". Acepta una fecha de Excel,
 * "2026-10-05" y "05/10/2026" (día/mes/año).
 */
export function leerFecha(valor) {
  const mensaje = "fecha: usa una fecha de Excel o el formato AAAA-MM-DD (también DD/MM/AAAA).";
  let anio; let mes; let dia;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new Error(mensaje);
    // Excel guarda solo el día; ExcelJS lo entrega como medianoche UTC.
    [anio, mes, dia] = [valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate()];
  } else if (typeof valor === "string" && /^\d{4}-\d{1,2}-\d{1,2}$/.test(valor.trim())) {
    [anio, mes, dia] = valor.trim().split("-").map(Number);
  } else if (typeof valor === "string" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(valor.trim())) {
    [dia, mes, anio] = valor.trim().split("/").map(Number);
  } else {
    throw new Error(mensaje);
  }
  const prueba = new Date(Date.UTC(anio, mes - 1, dia));
  if (prueba.getUTCFullYear() !== anio || prueba.getUTCMonth() !== mes - 1 || prueba.getUTCDate() !== dia) {
    throw new Error(`fecha: ${dia}/${mes}/${anio} no es una fecha válida.`);
  }
  return `${anio}-${dos(mes)}-${dos(dia)}`;
}

/** Revisa y limpia una fila de movimiento. Lanza un error con el campo si algo está mal. */
export function limpiarMovimiento(datos, hoy = hoyLocal()) {
  if (estaVacio(datos.codigo)) throw new Error("codigo: este campo es obligatorio.");
  const codigo = String(datos.codigo).trim();
  if (estaVacio(datos.fecha)) throw new Error("fecha: este campo es obligatorio.");
  const fecha = leerFecha(datos.fecha);
  if (fecha > hoy) throw new Error(`fecha: ${fecha} es una fecha futura.`);
  const tipo = normalizar(datos.tipo);
  if (!MOTIVOS_POR_TIPO[tipo]) throw new Error("tipo: escribe entrada o salida.");
  const motivo = SINONIMOS_MOTIVO[normalizar(datos.motivo)];
  if (!motivo || !MOTIVOS_POR_TIPO[tipo].includes(motivo)) {
    throw new Error(`motivo: para una ${tipo} usa ${MOTIVOS_POR_TIPO[tipo].join(", ")}.`);
  }
  const cantidad = enteroNoNegativo(datos.cantidad, "cantidad");
  if (cantidad === 0) throw new Error("cantidad: debe ser mayor que cero.");
  return { codigo, fecha, tipo, motivo, cantidad };
}

/**
 * Valida todas las filas ANTES de enviar nada. filas[0] es el encabezado.
 * Devuelve [{ fila, codigo, fecha, tipo, motivo, cantidad }] o lanza un error
 * con todos los problemas, cada uno con su número de fila de Excel.
 */
export function validarMovimientos(filas, hoy = hoyLocal()) {
  const nombres = (filas[0] ?? []).map((celda) => normalizar(celda));
  while (nombres.length > 0 && nombres[nombres.length - 1] === "") nombres.pop();
  const coincide = nombres.length === ENCABEZADOS_MOVIMIENTOS.length
    && ENCABEZADOS_MOVIMIENTOS.every((nombre, i) => nombres[i] === nombre);
  if (!coincide) throw new Error(`La primera fila debe contener: ${ENCABEZADOS_MOVIMIENTOS.join(", ")}.`);

  const movimientos = [];
  const errores = [];
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] ?? [];
    if (fila.every(estaVacio)) continue;
    try {
      const datos = Object.fromEntries(ENCABEZADOS_MOVIMIENTOS.map((nombre, columna) => [nombre, fila[columna]]));
      movimientos.push({ fila: i + 1, ...limpiarMovimiento(datos, hoy) });
    } catch (error) {
      errores.push(`Fila ${i + 1}: ${error.message}`);
    }
  }
  if (errores.length > 0) {
    throw new Error("No se importó ningún movimiento. Corrige estos errores:\n" + errores.join("\n"));
  }
  if (movimientos.length === 0) throw new Error("El archivo no contiene movimientos.");
  if (movimientos.length > MAXIMO_MOVIMIENTOS) throw new Error(`Máximo ${MAXIMO_MOVIMIENTOS} movimientos por archivo.`);
  return movimientos;
}
