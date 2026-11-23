import { useId, useMemo, useRef, useState } from "react";

// Lista desplegable en la que se puede escribir para buscar (sin distinguir
// mayúsculas ni acentos). Sustituye a <select> cuando hay muchas opciones.
//   opciones: [{ valor: "12", texto: "PROD-000012 — Tijeras", detalle?: "Sin proveedor activo" }]
//   valor:    el valor elegido ("" si ninguno)
const normalizar = (texto) => String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MAXIMO_VISIBLE = 50;

export default function SelectorBuscable({
  etiqueta, opciones, valor, onCambio, placeholder = "Escribe para buscar…", requerido = false, deshabilitado = false, nombre,
}) {
  const id = useId();
  const entrada = useRef(null);
  const elegida = opciones.find((o) => String(o.valor) === String(valor)) ?? null;
  const [texto, setTexto] = useState(null);   // null = mostrar la opción elegida
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);

  const filtradas = useMemo(() => {
    const busqueda = normalizar(texto ?? "").trim();
    const lista = busqueda ? opciones.filter((o) => normalizar(`${o.texto} ${o.detalle ?? ""}`).includes(busqueda)) : opciones;
    return lista.slice(0, MAXIMO_VISIBLE);
  }, [opciones, texto]);
  const total = texto ? opciones.filter((o) => normalizar(`${o.texto} ${o.detalle ?? ""}`).includes(normalizar(texto).trim())).length : opciones.length;

  function elegir(opcion) {
    onCambio(String(opcion.valor));
    setTexto(null);
    setAbierto(false);
  }

  function alTeclear(evento) {
    if (evento.key === "ArrowDown") { evento.preventDefault(); setAbierto(true); setActiva((a) => Math.min(a + 1, filtradas.length - 1)); }
    else if (evento.key === "ArrowUp") { evento.preventDefault(); setActiva((a) => Math.max(a - 1, 0)); }
    else if (evento.key === "Enter" && abierto && filtradas[activa]) { evento.preventDefault(); elegir(filtradas[activa]); }
    else if (evento.key === "Escape" && abierto) { evento.preventDefault(); evento.stopPropagation(); setAbierto(false); setTexto(null); }
  }

  const lista = `${id}-lista`;
  return (
    <div className="combo">
      <label htmlFor={`${id}-entrada`}>{etiqueta}</label>
      <input
        id={`${id}-entrada`} ref={entrada} type="text" role="combobox" autoComplete="off"
        aria-expanded={abierto} aria-controls={lista} aria-autocomplete="list"
        aria-activedescendant={abierto && filtradas[activa] ? `${id}-op-${activa}` : undefined}
        value={texto ?? elegida?.texto ?? ""} placeholder={placeholder} disabled={deshabilitado}
        required={requerido && !elegida}
        onChange={(e) => { setTexto(e.target.value); setActiva(0); setAbierto(true); if (elegida) onCambio(""); }}
        onFocus={(e) => { e.target.select(); setAbierto(true); }}
        onBlur={() => { setAbierto(false); setTexto(null); }}
        onKeyDown={alTeclear}
      />
      {nombre && <input type="hidden" name={nombre} value={valor ?? ""} />}
      {abierto && (
        <ul className="combo-lista" id={lista} role="listbox" aria-label={etiqueta}>
          {filtradas.length === 0 && <li className="combo-vacio">Sin coincidencias.</li>}
          {filtradas.map((o, i) => (
            <li key={o.valor} id={`${id}-op-${i}`} role="option" aria-selected={String(o.valor) === String(valor)}
              className={i === activa ? "activa" : ""}
              onMouseDown={(e) => { e.preventDefault(); elegir(o); }} onMouseEnter={() => setActiva(i)}>
              <span>{o.texto}</span>{o.detalle && <small>{o.detalle}</small>}
            </li>
          ))}
          {total > filtradas.length && <li className="combo-vacio">Mostrando {filtradas.length} de {total}. Escribe más para afinar.</li>}
        </ul>
      )}
    </div>
  );
}
