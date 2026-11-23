// Datos del negocio que aparecen en los documentos (orden de compra en PDF).
// Son datos FICTICIOS para la demo: cámbialos aquí por los del negocio real.
// Nada más en el código depende de estos valores.

// Logo propio (SVG): monograma "M" en dorado sobre azul marino, colores de la app.
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Logo de Monteverde">
  <rect width="64" height="64" rx="14" fill="#0f1b33"/>
  <path d="M15 46V19l17 14 17-14v27" fill="none" stroke="#f5b82e" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M15 52h34" stroke="#f5b82e" stroke-width="3" stroke-linecap="round" opacity=".55"/>
</svg>`;

export const NEGOCIO = {
  nombreComercial: "Monteverde Suministros de Oficina",
  razonSocial: "Distribuidora Monteverde de Oficina, S.A. de C.V.",
  rfc: "DMO180612HT4",
  direccion: ["Av. Constitución 1450, Col. Centro", "C.P. 64000, Monterrey, Nuevo León, México"],
  telefono: "81 4170 2290",
  correo: "compras@monteverde-oficina.mx",
  responsableCompras: { nombre: "Mariana Treviño Garza", puesto: "Jefa de Compras" },
  condicionesPago: "Crédito a 30 días a partir de la recepción de la factura.",
  notaImportes: "Importes en pesos mexicanos (MXN), al costo de catálogo vigente al generar la orden.",
  instruccionesEntrega: "Entregar en el almacén de lunes a viernes de 9:00 a 17:00 h. Presentar esta orden y la factura con el folio.",
};
