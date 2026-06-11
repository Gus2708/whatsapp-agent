# Precios de referencia (cotizaciones manuales del empleado)

Lista de productos+precios que el empleado cotizó a mano a clientes el **8/6/2026**, cruzados
contra el catálogo (`productos` en Supabase) para decidir qué hacer con cada uno.

> Solo es una **referencia**. NO se modificó el catálogo ni el agente con estos precios.
> Nota: el catálogo `productos` se sincroniza desde el sistema (actualizar_inventario.py),
> así que cualquier precio que se quiera fijar a mano conviene hacerlo en un mecanismo aparte
> (tabla de precios de referencia) para que no se sobrescriba.

Leyenda: ✅ coincide con catálogo · ≈ casi · ❗ difiere · ❌ no está en el catálogo · ❓ verificar nombre

---

## Lista 1

| Pedido del cliente | Precio empleado | En catálogo | Estado |
|---|---|---|---|
| 16 lámina arquitectónica | 27$ c/u | — (0 resultados con "arquitec") | ❌ falta — agregar si se quiere que el agente la cotice |
| 17 riel de 2x1 | 10$ | solo "riel" de lámparas, no de construcción | ❌ falta — agregar |
| 3 cajas de gancho de 2x1 | 14$ | GANCHO TECHO 2X1 (02188) **14$** ✅ · CAJA GANCHO 2X1 50UND (856445) 9$ | ✅/❓ "gancho" unitario=14$; "caja"(50u)=9$ — aclarar cuál vendes |
| 3 cabilla de 7 mm → **8 mm** | 4$ | no se ubicó cabilla de 7/8 mm por nombre | ❓ verificar (¿alambrón?, ¿otro nombre?) |
| 1 kilo varilla de herrería | 6$ | no se ubicó "varilla de herrería" | ❓ verificar nombre exacto |
| 3 disco de corte del pequeño (4½") | 1$ | varios DISCO CORTE 4-1/2 a **1$** ✅ | ✅ coincide |
| Varilla de soldar (electrodo) | (sin precio) | ELECTRODO ~4–6$/kg (muchos) | empleado no dio precio |

## Lista 2

| Pedido del cliente | Precio empleado | En catálogo | Estado |
|---|---|---|---|
| Cemento | (sin precio) | hay cemento gris | empleado no dio precio |
| Bloques | (sin precio) | — | empleado no dio precio |
| Cercha de 10 | 10$ | CERCHA DE 10X6MTS (01174) **11$** | ≈ difiere 1$ |
| Alambre | 2.5$ | ALAMBRE DULCE 17.5 800GR (DT130074) **2.5$** ✅ | ✅ coincide |
| Cal preparada | 2.5$ | CAL PREPARADA BOLSA (CALPRE) **2.5$** ✅ | ✅ coincide |
| Kilo de clavos de 2 1/2 | 5$ | (no se ubicó por formato del nombre) | ❓ verificar |
| Tubos de 2x1 | 10$ | TUBO HERRERÍA 2X1X0.80X6MTS (05156) **10$** ✅ | ✅ coincide (calibre 0.80mm) |
| Tubos de 3x1 | 14.50$ | TUBO HERRERÍA 3X1 desde **21$** | ❗ difiere mucho (¿calibre fino no catalogado?) |
| Zinc de 6 metros | 27$ | láminas de zinc van 6.5–18.75$ (ninguna a 27$) | ❌ ¿es lámina arquitectónica/teja premium? |
| Ganchos 2x1 | 14$ | GANCHO TECHO 2X1 (02188) **14$** ✅ | ✅ coincide |

---

## Resumen para decidir

- **Ya cotiza bien (coinciden con catálogo):** alambre 2.5$, cal preparada 2.5$, tubo herrería 2x1 (0.80mm) 10$, ganchos 2x1 14$, disco de corte 4½" 1$, cercha ~10–11$. El agente solo necesitaba **encontrarlos** (eso mejora con búsqueda; ver lavaplato/fregadero ya corregido).
- **Faltan en el catálogo (si se quieren cotizar, hay que agregarlos):** lámina arquitectónica (27$), riel de construcción 2x1 (10$), y el "zinc de 6 metros" de 27$ (probable teja/lámina premium).
- **Difiere y hay que confirmar cuál es el correcto:** tubo de 3x1 → empleado 14.50$ vs catálogo desde 21$.
- **Verificar nombre/precio en catálogo:** clavos de 2½ (5$), cabilla 7/8 mm (4$), varilla de herrería x kilo (6$).
- **Sin precio (el empleado los dejó en blanco):** cemento, bloques, varilla de soldar.

Cuando decidas, se puede: (a) crear una tabla de *precios de referencia* que el agente consulte antes del catálogo (sobrevive a las sincronizaciones), o (b) agregarlos/ajustarlos en el catálogo.
