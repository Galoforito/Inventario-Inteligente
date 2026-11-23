# Resultados de ampliación

## Métricas disponibles

| Métrica | Resultado actual | Evidencia |
|---|---|---|
| Evaluación sintética de pronóstico | 18 productos, 90 ventanas walk-forward; MAE baseline 1.457 u./día | `docs/EVALUACION_PRONOSTICO.md`; no representa ventas reales |
| Correos de alerta aceptados por SMTP | 9 alertas reales con IDs distintos; 3 ejemplos redactados | `docs/EVIDENCIA_ALERTAS.md`; aceptación SMTP no confirma llegada a bandeja |
| Entrega confirmada | No disponible | No hay webhook del proveedor de correo |
| Tiempo detección→aceptación | Medido en tres ejemplos: 1.50, 1.90 y 2.03 s | `docs/EVIDENCIA_ALERTAS.md` |
| Cobertura | No calculada | No hay proveedor de cobertura configurado en `package.json` |
| Pruebas web | 242/242 aprobadas tras integrar los cambios de usuarios, asignación de proveedores y órdenes agrupadas | `npm test -- --reporter=dot` |
| Build web | Aprobado con los cambios actuales | `npm run build` |
| Volumen de demo definido por seed | 18 productos, hasta 365 días sintéticos por producto, 1 proveedor, 1 alerta y 1 orden | `web/scripts/seed-demo.js`; aún no ejecutado contra Supabase |

Los resultados de pronóstico usan datos sintéticos (semilla 4172026) y no prueban mejora con ventas reales. La evaluación selecciona el modelo por producto; la tabla agregada está en `EVALUACION_PRONOSTICO.md`. No se ejecutaron las pruebas SQL locales porque Docker/Supabase local no están activos. La verificación de producción solo encontró perfiles `admin` y `almacen`; faltan cuentas `compras` y `consulta` para cerrar la aceptación de esos roles. El build genera `web/dist/`, artefacto local ignorado por Git.
