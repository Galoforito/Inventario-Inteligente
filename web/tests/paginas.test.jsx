// @vitest-environment jsdom
// Pruebas de las pantallas. Las llamadas a Supabase se sustituyen por funciones
// falsas (api.js simulado), así se prueba lo que la persona ve y hace.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase.js", () => ({ configurado: true, supabase: {} }));
vi.mock("../src/lib/api.js", () => ({
  cargarInventario: vi.fn(),
  cargarDashboard: vi.fn(),
  crearOrdenRapida: vi.fn(),
  crearOrdenesAgrupadas: vi.fn(),
  cargarResumen: vi.fn(),
  guardarProducto: vi.fn(),
  eliminarProducto: vi.fn(),
  registrarMovimiento: vi.fn(),
  importarProductos: vi.fn(),
  listarMovimientos: vi.fn(),
  importarMovimientos: vi.fn(),
  listarAlertas: vi.fn(),
  listarProductosBajos: vi.fn(),
  consultarModoCorreo: vi.fn(),
  revisarAhora: vi.fn(),
  reintentarAlerta: vi.fn(),
  enviarReporte: vi.fn(),
  iniciarSesion: vi.fn(),
  cerrarSesion: vi.fn(),
  obtenerSesion: vi.fn(),
  obtenerPerfil: vi.fn(),
  guardarProveedor: vi.fn(),
  listarProveedores: vi.fn(),
  listarAsignacionesProductos: vi.fn(),
  vincularProductoProveedor: vi.fn(),
  listarOrdenes: vi.fn(),
  crearBorradores: vi.fn(),
  recibirLineaOrden: vi.fn(),
  enviarOrdenProveedor: vi.fn(),
  confirmarOrdenCompra: vi.fn(),
  reportarEntregaIncompleta: vi.fn(),
  listarPerfiles: vi.fn(),
  actualizarPerfil: vi.fn(),
  crearUsuario: vi.fn(),
  alCambiarSesion: vi.fn(() => () => {}),
}));

import App from "../src/App.jsx";
import * as api from "../src/lib/api.js";

const RESUMEN = { total: 2, bajos: 1, valor: 1335, reponer: 225, ultima_revision: "2026-10-05T19:39:59Z" };
const BAJO = { id: 1, codigo: "P003", nombre: "Bolígrafo azul", categoria: "Papelería", stock_actual: 7, stock_minimo: 12, costo: 45, low_active: true };
const SUFICIENTE = { id: 2, codigo: "P008", nombre: "Grapadora", categoria: "Oficina", stock_actual: 5, stock_minimo: 3, costo: 120, low_active: false };

function abrir(ruta = "/") {
  return render(<MemoryRouter initialEntries={[ruta]}><App /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.obtenerSesion.mockResolvedValue({ user: { email: "equipo@escuela.mx" } });
  api.obtenerPerfil.mockResolvedValue({ role: "admin", active: true });
  api.alCambiarSesion.mockReturnValue(() => {});
  api.cargarInventario.mockResolvedValue({ productos: [BAJO, SUFICIENTE], consumo: [], resumen: RESUMEN, proveedoresActivos: [{ id: 1, nombre: "Proveedor demo" }] });
  api.cargarResumen.mockResolvedValue(RESUMEN);
  api.listarMovimientos.mockResolvedValue([]);
  api.listarAlertas.mockResolvedValue([]);
  api.listarProductosBajos.mockResolvedValue([]);
  api.consultarModoCorreo.mockResolvedValue(false);
  api.listarProveedores.mockResolvedValue([]);
  api.listarAsignacionesProductos.mockResolvedValue({ productos: [], relaciones: [] });
});
afterEach(cleanup);

describe("sesión", () => {
  it("sin sesión muestra el formulario para entrar", async () => {
    api.obtenerSesion.mockResolvedValue(null);
    abrir();
    expect(await screen.findByRole("button", { name: "Iniciar sesión" })).toBeTruthy();
    expect(api.cargarInventario).not.toHaveBeenCalled();
  });

  it("con credenciales incorrectas muestra el motivo", async () => {
    api.obtenerSesion.mockResolvedValue(null);
    api.iniciarSesion.mockRejectedValue(new Error("Correo o contraseña incorrectos."));
    abrir();
    fireEvent.change(await screen.findByLabelText("Correo"), { target: { value: "a@b.mx" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "mala" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeTruthy();
    expect(api.iniciarSesion).toHaveBeenCalledWith("a@b.mx", "mala");
  });
});

describe("Inventario", () => {
  it("muestra el resumen, el panel de reabasto y la tabla", async () => {
    abrir();
    expect(await screen.findByText("Reabastecer primero")).toBeTruthy();
    expect(screen.getByText("$1,335.00")).toBeTruthy();                 // valor del inventario
    expect(screen.getByText("Reponer al mínimo: $225.00")).toBeTruthy();
    expect(screen.getByText("Stock bajo", { selector: ".badge" })).toBeTruthy();
    expect(screen.getByText("Suficiente", { selector: ".badge" })).toBeTruthy();
    const fila = screen.getByText("P003").closest("tr");
    expect(within(fila).getByText("$45.00")).toBeTruthy();              // costo unitario
    expect(within(fila).getByText("$315.00")).toBeTruthy();             // 7 × 45
    expect(within(fila).getByText("Sin rotación")).toBeTruthy();
    expect(fila.className).toContain("low-row");
  });

  it("Admin puede armar una orden desde Reabastecer primero con stock positivo", async () => {
    api.crearOrdenRapida.mockResolvedValue({ folio: "OC-PANEL", proveedor: "Proveedor", cantidad: 5 });
    api.listarOrdenes.mockResolvedValue([]);
    abrir("/");
    const panel = (await screen.findByText("Reabastecer primero")).closest("section");
    fireEvent.click(within(panel).getByRole("button", { name: "Armar orden" }));
    await waitFor(() => expect(api.crearOrdenRapida).toHaveBeenCalledWith(1, 5));
  });

  it("Compras puede asignar a un producto un proveedor desde Inventario", async () => {
    api.vincularProductoProveedor.mockResolvedValue(undefined);
    api.cargarInventario.mockResolvedValue({
      productos: [BAJO, SUFICIENTE], consumo: [], resumen: RESUMEN,
      proveedoresActivos: [{ id: 2, nombre: "Proveedor B" }],
      relaciones: [],
    });
    api.obtenerPerfil.mockResolvedValue({ role: "compras", active: true });
    abrir("/");
    const formulario = (await screen.findByRole("heading", { name: "Asignar proveedor a producto existente" })).closest("section");
    fireEvent.change(within(formulario).getByLabelText("Producto"), { target: { value: "1" } });
    fireEvent.change(within(formulario).getByLabelText("Proveedor activo"), { target: { value: "2" } });
    fireEvent.click(within(formulario).getByRole("button", { name: "Guardar asignación" }));
    await waitFor(() => expect(api.vincularProductoProveedor).toHaveBeenCalledWith(2, 1, 0, 1));
  });

  it("Consulta no ve acciones para armar órdenes desde Reabastecer primero", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "consulta", active: true });
    abrir("/");
    const panel = (await screen.findByText("Reabastecer primero")).closest("section");
    expect(within(panel).queryByRole("button", { name: "Armar orden" })).toBeNull();
  });
  it("el panel de reabasto sugiere llegar al mínimo y suma la compra", async () => {
    abrir();
    const panel = (await screen.findByText("Reabastecer primero")).closest("section");
    expect(within(panel).getByText("Bolígrafo azul")).toBeTruthy();
    expect(within(panel).getByText("+5 u.")).toBeTruthy();
    expect(within(panel).getAllByText("$225.00")).toHaveLength(2);      // el producto y el total
    expect(within(panel).queryByText("Grapadora")).toBeNull();
  });

  it("'Solo urgentes' y el buscador filtran la tabla", async () => {
    abrir();
    await screen.findByText("P003");
    const filas = () => screen.getAllByRole("row").filter((fila) => fila.dataset.codigo);
    expect(filas()).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Solo urgentes"));
    expect(filas().map((fila) => fila.dataset.codigo)).toEqual(["P003"]);
    fireEvent.click(screen.getByLabelText("Solo urgentes"));
    fireEvent.change(screen.getByLabelText("Filtrar por categoría"), { target: { value: "Oficina" } });
    expect(filas().map((fila) => fila.dataset.codigo)).toEqual(["P008"]);
    fireEvent.change(screen.getByLabelText("Buscar producto"), { target: { value: "no existe" } });
    expect(filas()).toHaveLength(0);
    expect(screen.getByText("Ningún producto coincide con los filtros.")).toBeTruthy();
  });

  it("con el inventario vacío invita a registrar o importar", async () => {
    api.cargarInventario.mockResolvedValue({ productos: [], consumo: [], resumen: { ...RESUMEN, total: 0, bajos: 0, valor: 0, reponer: 0, ultima_revision: null } });
    abrir();
    expect(await screen.findByText("El inventario está vacío. Registra un producto o importa el Excel de ejemplo.")).toBeTruthy();
    expect(screen.getByText("Aún no se ha revisado")).toBeTruthy();
    expect(screen.getByText(/Todo en orden/)).toBeTruthy();
  });

  it("si la carga falla muestra el motivo y permite reintentar", async () => {
    api.cargarInventario.mockRejectedValueOnce(new Error("No hay conexión con Supabase. Revisa tu internet e inténtalo de nuevo."));
    abrir();
    expect(await screen.findByText("No hay conexión con Supabase. Revisa tu internet e inténtalo de nuevo.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("P003")).toBeTruthy();
  });

  it("registrar un producto llama a la base, avisa y recarga la lista", async () => {
    api.guardarProducto.mockResolvedValue(undefined);
    abrir();
    const formulario = (await screen.findByText("Registrar producto")).closest("section");
    const escribir = (etiqueta, valor) => fireEvent.change(within(formulario).getByLabelText(etiqueta), { target: { value: valor } });
    escribir("Proveedor activo", "1");
    // El código lo asigna la base; la categoría nueva se crea desde el selector.
    expect(within(formulario).queryByLabelText("Código")).toBeNull();
    escribir("Nombre", "Tijeras"); escribir("Categoría", "__crear_categoria__"); escribir("Nueva categoría", "Oficina");
    escribir("Costo unitario ($)", "35.50"); escribir("Stock actual", "4"); escribir("Stock mínimo", "2");
    fireEvent.click(within(formulario).getByRole("button", { name: "Guardar producto" }));
    expect(await screen.findByText("Producto registrado.")).toBeTruthy();
    expect(api.guardarProducto).toHaveBeenCalledWith(
      { nombre: "Tijeras", categoria: "Oficina", proveedor_id: "1", costo: "35.50", stock_actual: "4", stock_minimo: "2" }, null);
    expect(api.cargarInventario).toHaveBeenCalledTimes(2);
  });

  it("un movimiento rechazado muestra el error y no pierde la tabla", async () => {
    api.registrarMovimiento.mockRejectedValue(new Error("La salida supera el stock disponible; el inventario no puede quedar negativo."));
    abrir();
    const fila = (await screen.findByText("P003")).closest("tr");
    fireEvent.click(within(fila).getByText("Movimiento"));
    fireEvent.change(within(fila).getByLabelText("Tipo de movimiento"), { target: { value: "salida" } });
    fireEvent.change(within(fila).getByLabelText("Unidades"), { target: { value: "99" } });
    fireEvent.click(within(fila).getByRole("button", { name: "Registrar" }));
    expect(await screen.findByText("La salida supera el stock disponible; el inventario no puede quedar negativo.")).toBeTruthy();
    expect(api.registrarMovimiento).toHaveBeenCalledWith(1, "salida", "99", "venta");
    expect(screen.getByText("P003")).toBeTruthy();
  });

  it("lleva la vista al aviso, porque la acción pudo ocurrir muy abajo en la tabla", async () => {
    const desplazar = vi.fn();
    Element.prototype.scrollIntoView = desplazar;
    api.registrarMovimiento.mockRejectedValue(new Error("La salida supera el stock disponible; el inventario no puede quedar negativo."));
    abrir();
    const fila = (await screen.findByText("P003")).closest("tr");
    expect(desplazar).not.toHaveBeenCalled();
    fireEvent.click(within(fila).getByText("Movimiento"));
    fireEvent.change(within(fila).getByLabelText("Unidades"), { target: { value: "99" } });
    fireEvent.click(within(fila).getByRole("button", { name: "Registrar" }));
    const aviso = await screen.findByRole("alert");
    await waitFor(() => expect(desplazar).toHaveBeenCalledTimes(1));
    expect(desplazar.mock.instances[0]).toBe(aviso);
    delete Element.prototype.scrollIntoView;
  });

  it("eliminar pide confirmación", async () => {
    api.eliminarProducto.mockResolvedValue(undefined);
    const confirmar = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    abrir();
    const fila = (await screen.findByText("P008")).closest("tr");
    fireEvent.click(within(fila).getByRole("button", { name: "Eliminar" }));
    expect(api.eliminarProducto).not.toHaveBeenCalled();
    fireEvent.click(within(fila).getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText("Producto eliminado. Su historial anterior se conserva.")).toBeTruthy();
    expect(api.eliminarProducto).toHaveBeenCalledWith(2);
    confirmar.mockRestore();
  });

  it("'Revisar inventario ahora' lleva al historial con el resultado", async () => {
    api.revisarAhora.mockResolvedValue({ alert_id: 9, status: "simulado", otras: [] });
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Revisar inventario ahora" }));
    expect(await screen.findByText("Alerta simulada y guardada. No se envió ningún correo real.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Historial de alertas" })).toBeTruthy();
  });
});

describe("Movimientos", () => {
  it("sin movimientos lo dice", async () => {
    abrir("/movimientos");
    expect(await screen.findByText("Todavía no hay movimientos.")).toBeTruthy();
  });

  it("lista los movimientos con su stock anterior y nuevo", async () => {
    api.listarMovimientos.mockResolvedValue([
      { id: 5, created_at: "2026-10-05T19:00:00Z", product_code: "P003", product_name: "Bolígrafo azul", tipo: "salida", cantidad: 3, stock_anterior: 10, stock_nuevo: 7 },
    ]);
    abrir("/movimientos");
    const fila = (await screen.findByText("Bolígrafo azul")).closest("tr");
    expect(within(fila).getByText("Salida")).toBeTruthy();
    expect([...fila.querySelectorAll("td")].slice(4).map((celda) => celda.textContent)).toEqual(["Sin clasificar", "3", "10", "7", "Manual"]);
  });
});

describe("Historial de alertas", () => {
  const alerta = (cambios) => ({
    id: 1, created_at: "2026-10-05T19:20:15Z", status: "simulado", attempts: 1, last_attempt_at: "2026-10-05T19:20:15Z", error: null,
    subject: "Alerta de inventario: 1 producto(s) con stock bajo", body: "Productos por debajo del stock mínimo:",
    items: [{ id: 1, codigo: "P003", nombre: "Bolígrafo azul", stock_actual: 7, stock_minimo: 12, costo: 45, faltante: 5, costo_reponer: 225 }],
    ...cambios,
  });

  it("sin alertas invita a probar el flujo", async () => {
    abrir("/alertas");
    expect(await screen.findByText("No hay alertas. Pulsa “Revisar inventario ahora” para probar el flujo.")).toBeTruthy();
  });

  it("una alerta simulada lo dice claramente y no ofrece reintentar", async () => {
    api.listarAlertas.mockResolvedValue([alerta({ id: 1 })]);
    api.consultarModoCorreo.mockResolvedValue(true);
    abrir("/alertas");
    const tarjeta = (await screen.findByText("Alerta #1")).closest("article");
    expect(within(tarjeta).getByText("Simulado: no enviado")).toBeTruthy();
    expect(within(tarjeta).getByText("$225.00")).toBeTruthy();
    expect(within(tarjeta).getByText("Alerta de inventario: 1 producto(s) con stock bajo")).toBeTruthy();
    expect(within(tarjeta).queryByRole("button", { name: "Reintentar envío" })).toBeNull();
    expect(screen.getByText(/Modo simulado activo/)).toBeTruthy();
  });

  it("oculta el aviso de modo demo aunque el historial conserve envíos simulados antiguos", async () => {
    api.listarAlertas.mockResolvedValue([alerta({ id: 1 })]);
    api.consultarModoCorreo.mockResolvedValue(false);
    abrir("/alertas");
    await screen.findByText("Alerta #1");
    expect(screen.queryByText(/Modo simulado activo/)).toBeNull();
  });

  it("una alerta con error muestra el motivo y se puede reintentar", async () => {
    api.listarAlertas.mockResolvedValue([alerta({ id: 2, status: "error", error: "Connection timeout" })]);
    api.reintentarAlerta.mockResolvedValue({ alert_id: 2, status: "enviado" });
    abrir("/alertas");
    const tarjeta = (await screen.findByText("Alerta #2")).closest("article");
    expect(within(tarjeta).getByText("Error de envío")).toBeTruthy();
    expect(within(tarjeta).getByText("Connection timeout")).toBeTruthy();
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Reintentar envío" }));
    expect(await screen.findByText("Reintento: correo enviado.")).toBeTruthy();
    expect(api.reintentarAlerta).toHaveBeenCalledWith(2);
    expect(api.listarAlertas).toHaveBeenCalledTimes(2);
  });

  it("si la revisión falla muestra el motivo", async () => {
    api.revisarAhora.mockRejectedValue(new Error("Tu sesión expiró. Vuelve a iniciar sesión."));
    abrir("/alertas");
    fireEvent.click(await screen.findByRole("button", { name: "Revisar inventario ahora" }));
    expect(await screen.findByText("Tu sesión expiró. Vuelve a iniciar sesión.")).toBeTruthy();
  });
});

describe("Reporte semanal", () => {
  const reporte = (cambios) => ({
    id: 4, tipo: "reporte_semanal", created_at: "2026-10-05T14:00:00Z", status: "enviado", attempts: 1,
    last_attempt_at: "2026-10-05T14:00:02Z", error: null,
    subject: "Reporte semanal de inventario: 28/09/2026 al 05/10/2026", body: "Reporte semanal de inventario\nPeriodo: 28/09/2026 al 05/10/2026",
    items: {
      desde: "2026-09-28T14:00:00Z", hasta: "2026-10-05T14:00:00Z",
      resumen: { total: 16, bajos: 6, valor: 7138.5, reponer: 742.5 },
      productos: [{ codigo: "P003" }, { codigo: "P008" }],
      movimientos: [{ codigo: "P003", tipo: "salida", cantidad: 3 }],
      entradas: 20, salidas: 23,
    },
    ...cambios,
  });

  it("el reporte aparece en el historial con su resumen, junto a las alertas", async () => {
    api.listarAlertas.mockResolvedValue([
      reporte({}),
      { id: 1, created_at: "2026-10-05T19:20:15Z", status: "simulado", attempts: 1, last_attempt_at: null, error: null, subject: "Asunto", body: "Cuerpo",
        items: [{ id: 1, codigo: "P003", nombre: "Bolígrafo azul", stock_actual: 7, stock_minimo: 12, costo: 45, faltante: 5, costo_reponer: 225 }] },
    ]);
    abrir("/alertas");
    const tarjeta = (await screen.findByText("Reporte semanal #4")).closest("article");
    expect(within(tarjeta).getByText("Enviado")).toBeTruthy();
    expect(within(tarjeta).getByText(/16 producto\(s\) · 1 movimiento\(s\)/)).toBeTruthy();
    expect(within(tarjeta).getByText("$7,138.50")).toBeTruthy();
    expect(within(tarjeta).getByText(/Entradas: 20 u\. · Salidas: 23 u\./)).toBeTruthy();
    expect(within(tarjeta).getByText("Reporte semanal de inventario: 28/09/2026 al 05/10/2026")).toBeTruthy();
    expect(screen.getByText("Alerta #1")).toBeTruthy();     // las alertas se siguen viendo igual
  });

  it("'Enviar reporte ahora' pide el reporte al bot, avisa y recarga el historial", async () => {
    api.enviarReporte.mockResolvedValue({ alert_id: 4, status: "enviado" });
    abrir("/alertas");
    fireEvent.click(await screen.findByRole("button", { name: "Enviar reporte ahora" }));
    expect(await screen.findByText("Reporte semanal enviado por correo.")).toBeTruthy();
    expect(api.enviarReporte).toHaveBeenCalledTimes(1);
    expect(api.listarAlertas).toHaveBeenCalledTimes(2);
  });

  it("si el envío del reporte falla lo dice y el reporte se puede reintentar", async () => {
    api.listarAlertas.mockResolvedValue([reporte({ status: "error", error: "Connection timeout" })]);
    api.reintentarAlerta.mockResolvedValue({ alert_id: 4, status: "enviado" });
    abrir("/alertas");
    const tarjeta = (await screen.findByText("Reporte semanal #4")).closest("article");
    expect(within(tarjeta).getByText("Connection timeout")).toBeTruthy();
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Reintentar envío" }));
    expect(await screen.findByText("Reintento: correo enviado.")).toBeTruthy();
    expect(api.reintentarAlerta).toHaveBeenCalledWith(4);
  });

  it("un reporte con datos incompletos no rompe la pantalla", async () => {
    api.listarAlertas.mockResolvedValue([reporte({ items: {} }), reporte({ id: 5, items: null })]);
    abrir("/alertas");
    expect(await screen.findByText("Reporte semanal #4")).toBeTruthy();
    expect(screen.getByText("Reporte semanal #5")).toBeTruthy();
  });

  it("si el bot rechaza el reporte muestra el motivo", async () => {
    api.enviarReporte.mockRejectedValue(new Error("Tu sesión expiró. Vuelve a iniciar sesión."));
    abrir("/alertas");
    fireEvent.click(await screen.findByRole("button", { name: "Enviar reporte ahora" }));
    expect(await screen.findByText("Tu sesión expiró. Vuelve a iniciar sesión.")).toBeTruthy();
  });
});

describe("navegación", () => {
  it("las pestañas cambian de pantalla y 'Cerrar sesión' cierra la sesión", async () => {
    abrir();
    await screen.findByText("P003");
    fireEvent.click(screen.getByRole("link", { name: "Movimientos" }));
    expect(await screen.findByText("Todavía no hay movimientos.")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Historial de alertas" }));
    expect(await screen.findByRole("heading", { name: "Historial de alertas" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(api.cerrarSesion).toHaveBeenCalled());
  });
});

describe("Asignación de proveedores", () => {
  it("muestra los productos pendientes y permite asignar un proveedor activo", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "compras", active: true });
    api.listarProveedores.mockResolvedValue([{ id: 2, nombre: "Proveedor B", correo: "b@example.test", activo: true }]);
    api.listarAsignacionesProductos.mockResolvedValue({ productos: [{ id: 1, codigo: "P003", nombre: "Bolígrafo azul" }], relaciones: [] });
    api.vincularProductoProveedor.mockResolvedValue(undefined);
    abrir("/proveedores");
    expect(await screen.findByText(/1 de 1 productos no tienen proveedor activo/)).toBeTruthy();
    const fila = screen.getByRole("row", { name: /P003/ });
    fireEvent.click(within(fila).getByRole("button", { name: "Asignar" }));
    const formulario = screen.getByRole("heading", { name: "Asignar producto" }).closest("form");
    fireEvent.change(within(formulario).getByLabelText("Proveedor"), { target: { value: "2" } });
    fireEvent.click(within(formulario).getByRole("button", { name: "Guardar asignación" }));
    await waitFor(() => expect(api.vincularProductoProveedor).toHaveBeenCalledWith(2, 1, 0, 1));
  });
});
describe("Dashboard", () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const AGOTADO = { id: 3, codigo: "P010", nombre: "Engrapadora", categoria: "Oficina", stock_actual: 0, stock_minimo: 4, costo: 80 };
  const datosDashboard = (cambios = {}) => ({
    productos: [BAJO, SUFICIENTE, AGOTADO],
    ventas: [{ product_code: "P003", fecha: hoy, cantidad: 30 }],
    resumen: RESUMEN,
    categorias: [],
    relaciones: [
      { product_id: 1, proveedor_id: 2, costo_unitario: 42, proveedores: { nombre: "Papelería Centro", activo: true } },
      { product_id: 3, proveedor_id: 1, costo_unitario: 70, proveedores: { nombre: "Papelera del Centro", activo: true } },
    ],
    ...cambios,
  });

  it("Compras crea un borrador al abrir el enlace de una alerta", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "compras", active: true });
    api.cargarDashboard.mockResolvedValue(datosDashboard());
    api.crearOrdenRapida.mockResolvedValue({ folio: "OC-ALERTA", proveedor: "Papelera del Centro", cantidad: 4 });
    api.listarOrdenes.mockResolvedValue([]);
    abrir("/dashboard?crearOrden=3");
    expect(await screen.findByRole("heading", { name: "Órdenes de compra" })).toBeTruthy();
    expect(await screen.findByText(/Borrador OC-ALERTA listo para Papelera del Centro/)).toBeTruthy();
    expect(api.crearOrdenRapida).toHaveBeenCalledWith(3, 4);
  });

  it("Consulta no puede crear un borrador desde un enlace de alerta", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "consulta", active: true });
    api.cargarDashboard.mockResolvedValue(datosDashboard());
    abrir("/dashboard?crearOrden=3");
    expect(await screen.findByText("Solo Compras o Admin pueden crear borradores de compra desde una alerta.")).toBeTruthy();
    expect(api.crearOrdenRapida).not.toHaveBeenCalled();
  });
  it("muestra tarjetas, categorías y la tabla de atención", async () => {
    api.cargarDashboard.mockResolvedValue(datosDashboard());
    abrir("/dashboard");
    const tarjetas = await screen.findByRole("region", { name: "Indicadores" });
    expect(within(tarjetas).getByText("Productos agotados").nextSibling.textContent).toBe("1");
    expect(within(tarjetas).getByText("Bajo el mínimo").nextSibling.textContent).toBe("2");
    const tabla = screen.getByRole("heading", { name: "Requiere atención" }).closest("section");
    expect(within(tabla).getAllByRole("row").slice(1).map((f) => within(f).getAllByRole("cell")[1].textContent))
      .toEqual(["EngrapadoraP010", "Bolígrafo azulP003"]);
    expect(within(tabla).getByText("Papelera del Centro")).toBeTruthy();
    expect(within(tabla).getByText("Papelería Centro")).toBeTruthy();
  });

  it("Compras puede armar una orden para un producto agotado", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "compras", active: true });
    api.cargarDashboard.mockResolvedValue(datosDashboard());
    api.crearOrdenRapida.mockResolvedValue({ folio: "OC-1", proveedor: "Papelera del Centro", cantidad: 4 });
    api.listarOrdenes.mockResolvedValue([]);
    abrir("/dashboard");
    const fila = (await screen.findByText("Engrapadora")).closest("tr");
    fireEvent.click(await within(fila).findByRole("button", { name: "Armar orden" }));
    await waitFor(() => expect(api.crearOrdenRapida).toHaveBeenCalledWith(3, 4));
  });

  it("Compras puede armar una orden para un producto en atención que aún tiene stock", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "compras", active: true });
    api.cargarDashboard.mockResolvedValue(datosDashboard());
    api.crearOrdenRapida.mockResolvedValue({ folio: "OC-2", proveedor: "Papelería Centro", cantidad: 7 });
    api.listarOrdenes.mockResolvedValue([]);
    abrir("/dashboard");
    const tabla = (await screen.findByRole("heading", { name: /Requiere/ })).closest("section");
    const fila = within(tabla).getByText("Bolígrafo azul").closest("tr");
    fireEvent.click(await within(fila).findByRole("button", { name: "Armar orden" }));
    await waitFor(() => expect(api.crearOrdenRapida).toHaveBeenCalledWith(1, 7));
  });

  it("agrupa productos seleccionados del mismo proveedor en un borrador por proveedor", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "compras", active: true });
    api.cargarDashboard.mockResolvedValue(datosDashboard({ relaciones: [
      { product_id: 1, proveedor_id: 8, costo_unitario: 42, proveedores: { nombre: "Proveedor común", activo: true } },
      { product_id: 3, proveedor_id: 8, costo_unitario: 70, proveedores: { nombre: "Proveedor común", activo: true } },
    ] }));
    api.crearOrdenesAgrupadas.mockResolvedValue({
      total_productos: 2,
      ordenes: [{ folio: "OC-AGRUPADA", proveedor: "Proveedor común", productos: 2, cantidad: 9 }],
    });
    api.listarOrdenes.mockResolvedValue([]);
    abrir("/dashboard");
    const tabla = (await screen.findByRole("heading", { name: "Requiere atención" })).closest("section");
    fireEvent.click(within(tabla).getByRole("checkbox", { name: "Seleccionar P003 para orden" }));
    fireEvent.click(within(tabla).getByRole("checkbox", { name: "Seleccionar P010 para orden" }));
    fireEvent.click(within(tabla).getByRole("button", { name: "Crear borradores agrupados (2)" }));

    await waitFor(() => expect(api.crearOrdenesAgrupadas).toHaveBeenCalledWith([
      { producto_id: 3, cantidad: 4 }, { producto_id: 1, cantidad: 7 },
    ]));
    expect(await screen.findByRole("heading", { name: "Órdenes de compra" })).toBeTruthy();
    expect(await screen.findByText(/2 producto\(s\) agrupados en 1 borrador\(es\), uno por proveedor: OC-AGRUPADA para Proveedor común/)).toBeTruthy();
  });

  it("Consulta solo ve: no hay botón de orden", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "consulta", active: true });
    api.cargarDashboard.mockResolvedValue(datosDashboard());
    abrir("/dashboard");
    await screen.findByRole("heading", { name: "Requiere atención" });
    expect(screen.queryByRole("button", { name: "Armar orden" })).toBeNull();
    expect(screen.getAllByText("Solo lectura").length).toBeGreaterThan(0);
  });

  it("seleccionar una categoría filtra el Dashboard y se puede quitar", async () => {
    api.cargarDashboard.mockResolvedValue(datosDashboard());
    abrir("/dashboard");
    const cobertura = (await screen.findByRole("heading", { name: "Cobertura por categoría" })).closest("section");
    fireEvent.click(within(cobertura).getByText("Papelería").closest("button"));
    const tarjetas = screen.getByRole("region", { name: "Indicadores" });
    expect(within(tarjetas).getByText("Productos agotados").nextSibling.textContent).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtro" }));
    expect(within(tarjetas).getByText("Productos agotados").nextSibling.textContent).toBe("1");
  });

  it("los selectores cambian el periodo y el horizonte", async () => {
    api.cargarDashboard.mockResolvedValue(datosDashboard());
    abrir("/dashboard");
    fireEvent.click(within(await screen.findByRole("group", { name: "Historial" })).getByRole("button", { name: "90 días" }));
    expect(screen.getByText("Vendidas en 90 días")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Horizonte" })).getByRole("button", { name: "7 días" }));
    expect(within(screen.getByRole("group", { name: "Horizonte" })).getByRole("button", { name: "7 días" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("sin productos muestra un estado vacío", async () => {
    api.cargarDashboard.mockResolvedValue(datosDashboard({ productos: [], ventas: [] }));
    abrir("/dashboard");
    expect(await screen.findByText("No hay productos registrados. Da de alta productos en Inventario para ver el análisis.")).toBeTruthy();
  });
});

describe("Importar movimientos", () => {
  async function archivoPlantilla() {
    const { crearPlantillaMovimientos } = await import("../src/lib/excel.js");
    const buffer = await crearPlantillaMovimientos("P003");
    const archivo = new File([buffer], "movimientos.xlsx");
    archivo.arrayBuffer = async () => buffer; // jsdom no siempre implementa File.arrayBuffer
    return archivo;
  }

  it("Almacén importa, ve el resumen de nuevas y omitidas y recarga la lista", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "almacen", active: true });
    api.importarMovimientos.mockResolvedValue({ agregados: 1, omitidos: 1 });
    abrir("/movimientos");
    const tarjeta = (await screen.findByRole("heading", { name: "Importar movimientos desde Excel" })).closest("section");
    fireEvent.change(within(tarjeta).getByLabelText("Archivo .xlsx"), { target: { files: [await archivoPlantilla()] } });
    fireEvent.submit(within(tarjeta).getByRole("button", { name: "Importar movimientos" }).closest("form"));
    expect(await screen.findByText("Importación completada: 1 movimiento(s) nuevo(s) agregado(s) y stock actualizado; 1 fila(s) omitida(s) porque ya se habían importado."))
      .toBeTruthy();
    expect(api.importarMovimientos).toHaveBeenCalledWith([
      expect.objectContaining({ fila: 2, codigo: "P003", tipo: "entrada", motivo: "compra", cantidad: 20 }),
      expect.objectContaining({ fila: 3, codigo: "P003", tipo: "salida", motivo: "venta", cantidad: 3 }),
    ]);
    expect(api.listarMovimientos).toHaveBeenCalledTimes(2);
  });

  it("un error de la base se muestra y no se pierde la tabla", async () => {
    api.importarMovimientos.mockRejectedValue(new Error("Fila 3: la salida de 3 u. dejaría el stock de P003 en negativo (hay 0)."));
    abrir("/movimientos");
    const tarjeta = (await screen.findByRole("heading", { name: "Importar movimientos desde Excel" })).closest("section");
    fireEvent.change(within(tarjeta).getByLabelText("Archivo .xlsx"), { target: { files: [await archivoPlantilla()] } });
    fireEvent.submit(within(tarjeta).getByRole("button", { name: "Importar movimientos" }).closest("form"));
    expect(await screen.findByText("Fila 3: la salida de 3 u. dejaría el stock de P003 en negativo (hay 0).")).toBeTruthy();
  });

  it("Consulta y Compras no ven el importador", async () => {
    for (const role of ["consulta", "compras"]) {
      api.obtenerPerfil.mockResolvedValue({ role, active: true });
      abrir("/movimientos");
      await screen.findByText("Todavía no hay movimientos.");
      expect(screen.queryByRole("heading", { name: "Importar movimientos desde Excel" })).toBeNull();
      cleanup();
    }
  });
});

describe("Usuarios", () => {
  it("limpia el formulario después de crear la cuenta sin leer currentTarget tras el await", async () => {
    api.listarPerfiles.mockResolvedValue([]);
    api.crearUsuario.mockResolvedValue({ user_id: "nuevo-usuario-1234" });
    abrir("/usuarios");
    const formulario = (await screen.findByRole("heading", { name: "Crear usuario" })).closest("form");
    fireEvent.change(within(formulario).getByLabelText("Correo"), { target: { value: "compras@ejemplo.test" } });
    fireEvent.change(within(formulario).getByLabelText(/Contraseña inicial/), { target: { value: "ClaveSegura123!" } });
    fireEvent.click(within(formulario).getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText("Usuario creado (nuevo-usuario-1234). Comparte la contraseña inicial que ingresaste por un canal seguro.")).toBeTruthy();
    expect(within(formulario).getByLabelText("Correo").value).toBe("");
    expect(within(formulario).getByLabelText(/Contraseña inicial/).value).toBe("");
  });

  it("Guardar se habilita solo con cambios y envía rol y estado", async () => {
    api.listarPerfiles.mockResolvedValue([{ user_id: "48db03dc-b0ee-4ea9-a9cc-27b6688e4212", email: "becario@becario.com", role: "almacen", active: true }]);
    api.actualizarPerfil.mockResolvedValue({});
    abrir("/usuarios");
    const fila = (await screen.findByText("becario@becario.com")).closest("tr");
    expect(within(fila).getByText("ID 48db03dc…")).toBeTruthy();
    expect(within(fila).getByRole("button", { name: "Sin cambios" }).disabled).toBe(true);
    fireEvent.change(within(fila).getByLabelText("Rol de becario@becario.com"), { target: { value: "consulta" } });
    expect(within(fila).getByText("Solo lectura")).toBeTruthy();
    fireEvent.click(within(fila).getByRole("checkbox"));
    expect(within(fila).getByText("Inactivo")).toBeTruthy();
    fireEvent.click(within(fila).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.actualizarPerfil).toHaveBeenCalledWith("48db03dc-b0ee-4ea9-a9cc-27b6688e4212", "consulta", false));
  });
});

describe("Asignaciones de proveedores", () => {
  it("muestra mínimo de unidades y permite buscar, filtrar y ordenar la tabla", async () => {
    api.listarProveedores.mockResolvedValue([
      { id: 1, nombre: "Proveedor Uno", correo: "uno@ejemplo.test", activo: true, lead_time_dias: 5 },
      { id: 2, nombre: "Proveedor Dos", correo: "dos@ejemplo.test", activo: true, lead_time_dias: 7 },
    ]);
    api.listarAsignacionesProductos.mockResolvedValue({
      productos: [
        { id: 1, codigo: "P001", nombre: "Lápiz" },
        { id: 2, codigo: "P002", nombre: "Cuaderno" },
        { id: 3, codigo: "P003", nombre: "Grapadora" },
      ],
      relaciones: [
        { product_id: 1, proveedor_id: 1, minimo_unidades: 3, proveedores: { nombre: "Proveedor Uno", activo: true } },
        { product_id: 2, proveedor_id: 2, minimo_unidades: 1, proveedores: { nombre: "Proveedor Dos", activo: true } },
      ],
    });
    abrir("/proveedores");
    const seccion = (await screen.findByRole("heading", { name: "Proveedor asignado por producto" })).closest("section");
    expect(await within(seccion).findByText(/2 asignados - 1 pendientes/)).toBeTruthy();
    const filas = () => within(seccion).getAllByRole("row").slice(1);
    expect(within(seccion).getByText("Mínimo de unidades")).toBeTruthy();
    expect(within(seccion).getByText("3", { selector: "td" })).toBeTruthy();
    expect(within(seccion).getByText("1", { selector: "td" })).toBeTruthy();
    expect(filas()).toHaveLength(3);

    fireEvent.change(within(seccion).getByLabelText("Buscar producto o proveedor"), { target: { value: "P002" } });
    expect(filas().map((fila) => fila.textContent)).toEqual([expect.stringContaining("Cuaderno")]);
    fireEvent.change(within(seccion).getByLabelText("Buscar producto o proveedor"), { target: { value: "" } });
    fireEvent.change(within(seccion).getByLabelText("Filtrar por asignación"), { target: { value: "pendiente" } });
    expect(filas().map((fila) => fila.textContent)).toEqual([expect.stringContaining("Grapadora")]);
    fireEvent.change(within(seccion).getByLabelText("Filtrar por asignación"), { target: { value: "" } });
    fireEvent.change(within(seccion).getByLabelText("Ordenar asignaciones"), { target: { value: "minimo_desc" } });
    expect(filas().map((fila) => fila.textContent)).toEqual([
      expect.stringContaining("Lápiz"), expect.stringContaining("Cuaderno"), expect.stringContaining("Grapadora"),
    ]);
  });
});

describe("Entrega incompleta", () => {
  const ORDEN_PARCIAL = {
    id: 5, folio: "OC-5", estado: "recibida parcial", proveedor_id: 1, created_at: "2026-11-20T18:00:00Z", incompleta_alert_id: null,
    proveedores: { nombre: "Papelera", correo: "ventas@papelera.test" },
    orden_lineas: [{ id: 9, product_code: "P003", product_name: "Bolígrafo", cantidad: 10, recibida: 6, costo_unitario: 5 }],
  };

  it("Consulta puede leer órdenes sin ver controles de modificación", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "consulta", active: true });
    api.listarOrdenes.mockResolvedValue([{ ...ORDEN_PARCIAL, estado: "borrador" }]);
    abrir("/ordenes");
    expect(await screen.findByRole("heading", { name: /OC-5 · Papelera/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exportar a PDF" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar al proveedor" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reportar entrega incompleta" })).toBeNull();
  });
  it("Compras reporta el faltante desde la ventana de la app, con nota opcional", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "compras", active: true });
    api.listarOrdenes.mockResolvedValue([ORDEN_PARCIAL]);
    api.reportarEntregaIncompleta.mockResolvedValue({ status: "enviado", recipient: "ventas@papelera.test", message_id: "abc" });
    const confirmar = vi.spyOn(window, "confirm");
    abrir("/ordenes");
    fireEvent.click(await screen.findByRole("button", { name: "Reportar entrega incompleta" }));
    const ventana = screen.getByRole("dialog", { name: "Reportar entrega incompleta" });
    expect(within(ventana).getByText("ventas@papelera.test")).toBeTruthy();
    const fila = within(ventana).getByText("P003").closest("tr");
    expect([...fila.querySelectorAll("td")].slice(1).map((c) => c.textContent)).toEqual(["10", "6", "4"]);
    expect(within(ventana).getByText("$20.00")).toBeTruthy();
    fireEvent.change(within(ventana).getByRole("textbox"), { target: { value: "Necesitamos el resto el viernes" } });
    fireEvent.click(within(ventana).getByRole("button", { name: "Enviar aviso al proveedor" }));
    expect(await screen.findByText("Aviso de entrega incompleta enviado a ventas@papelera.test; ID abc.")).toBeTruthy();
    expect(api.reportarEntregaIncompleta).toHaveBeenCalledWith(5, "Necesitamos el resto el viernes");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirmar).not.toHaveBeenCalled(); // ya no usa el cuadro del navegador
    confirmar.mockRestore();
  });

  it("Cancelar o Escape cierran la ventana sin enviar nada", async () => {
    api.listarOrdenes.mockResolvedValue([ORDEN_PARCIAL]);
    abrir("/ordenes");
    fireEvent.click(await screen.findByRole("button", { name: "Reportar entrega incompleta" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reportar entrega incompleta" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.reportarEntregaIncompleta).not.toHaveBeenCalled();
  });

  it("ya reportada muestra la marca y no el botón; Almacén no ve el botón", async () => {
    api.listarOrdenes.mockResolvedValue([{ ...ORDEN_PARCIAL, incompleta_alert_id: 33 }]);
    abrir("/ordenes");
    expect(await screen.findByText("Faltante reportado al proveedor")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reportar entrega incompleta" })).toBeNull();
    cleanup();
    api.obtenerPerfil.mockResolvedValue({ role: "almacen", active: true });
    api.listarOrdenes.mockResolvedValue([ORDEN_PARCIAL]);
    abrir("/ordenes");
    await screen.findByText(/OC-5/);
    expect(screen.queryByRole("button", { name: "Reportar entrega incompleta" })).toBeNull();
  });

  it("el historial muestra el aviso con lo que faltó", async () => {
    api.listarAlertas.mockResolvedValue([{
      id: 40, tipo: "entrega_incompleta", orden_id: 5, status: "enviado", delivery_status: "enviado", attempts: 1,
      created_at: "2026-11-23T18:00:00Z", recipient: "ventas@papelera.test", subject: "Entrega incompleta de la orden OC-5", body: "Texto",
      items: [{ codigo: "P003", nombre: "Bolígrafo", pedida: 10, recibida: 6, faltante: 4, costo_faltante: 20 }],
    }]);
    abrir("/alertas");
    expect(await screen.findByRole("heading", { name: "Entrega incompleta de la orden OC-5" })).toBeTruthy();
    expect(screen.getByText(/pedidas 10, recibidas 6, faltan/)).toBeTruthy();
  });
});

describe("Confirmación antes de recibir órdenes", () => {
  const ORDEN_ENVIADA = {
    id: 5, folio: "OC-5", estado: "enviada", sent_at: "2026-11-23T18:00:00Z", proveedor_id: 1, created_at: "2026-11-20T18:00:00Z",
    proveedores: { nombre: "Papelera", correo: "ventas@papelera.test" },
    orden_lineas: [{ id: 9, product_code: "P003", product_name: "Bolígrafo", cantidad: 10, recibida: 0, costo_unitario: 5 }],
  };
  const ORDEN_CONFIRMADA = { ...ORDEN_ENVIADA, estado: "confirmada", confirmada_at: "2026-11-23T19:00:00Z" };

  it("Compras confirma una orden enviada y entonces aparece la recepción", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "compras", active: true });
    api.listarOrdenes.mockResolvedValueOnce([ORDEN_ENVIADA]).mockResolvedValue([ORDEN_CONFIRMADA]);
    api.confirmarOrdenCompra.mockResolvedValue(undefined);
    const confirmarNativo = vi.spyOn(window, "confirm").mockReturnValue(true);
    abrir("/ordenes");
    const confirmar = await screen.findByRole("button", { name: "Confirmar pedido del proveedor" });
    expect(screen.queryByRole("button", { name: "Registrar recepción" })).toBeNull();
    fireEvent.click(confirmar);
    expect(await screen.findByText(/quedó confirmada/)).toBeTruthy();
    expect(api.confirmarOrdenCompra).toHaveBeenCalledWith(5);
    expect(within(screen.getByRole("article")).getByText("confirmada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registrar recepción" })).toBeNull();
    confirmarNativo.mockRestore();
  });

  it("Almacén puede recibir una orden confirmada", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "almacen", active: true });
    api.listarOrdenes.mockResolvedValue([ORDEN_CONFIRMADA]);
    api.recibirLineaOrden.mockResolvedValue(14);
    const promptNativo = vi.spyOn(window, "prompt").mockReturnValue("10");
    abrir("/ordenes");
    fireEvent.click(await screen.findByRole("button", { name: "Registrar recepción" }));
    await waitFor(() => expect(api.recibirLineaOrden).toHaveBeenCalledWith(9, 10));
    promptNativo.mockRestore();
  });

  it("Almacén no puede recibir una orden solo enviada", async () => {
    api.obtenerPerfil.mockResolvedValue({ role: "almacen", active: true });
    api.listarOrdenes.mockResolvedValue([ORDEN_ENVIADA]);
    abrir("/ordenes");
    await screen.findByRole("heading", { name: /OC-5/ });
    expect(screen.queryByRole("button", { name: "Registrar recepción" })).toBeNull();
    expect(screen.getByText(/La recepción se habilita cuando Compras confirma/)).toBeTruthy();
  });
});

describe("Entrega incompleta con la función desactualizada", () => {
  it("una respuesta sin estado de envío no se muestra como éxito", async () => {
    api.listarOrdenes.mockResolvedValue([{
      id: 5, folio: "OC-5", estado: "recibida parcial", proveedor_id: 1, created_at: "2026-11-20T18:00:00Z", incompleta_alert_id: null,
      proveedores: { nombre: "Papelera", correo: "ventas@papelera.test" },
      orden_lineas: [{ id: 9, product_code: "P003", product_name: "Bolígrafo", cantidad: 10, recibida: 6, costo_unitario: 5 }],
    }]);
    // Así responde la versión vieja: trata la petición como "Revisar inventario ahora".
    api.reportarEntregaIncompleta.mockResolvedValue({ alert_id: null, status: null, otras: [] });
    abrir("/ordenes");
    fireEvent.click(await screen.findByRole("button", { name: "Reportar entrega incompleta" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Enviar aviso al proveedor" }));
    expect(await screen.findByText(/parece desactualizada: vuelve a desplegarla/)).toBeTruthy();
    expect(screen.queryByText(/Aviso de entrega incompleta enviado/)).toBeNull();
  });
});
