# Plan: que el bot resuelva solo (reducir [PEDIR_AYUDA])

> **✅ IMPLEMENTADO Y DESPLEGADO (2026-07-23).** Motor v11 (`live_buscar.js`) + presupuesto v5,
> migraciones SQL (fuzzy pg_trgm, aprendizaje +/- con triggers, backfill), y reglas de prompt.
> Verificado: golden set 33/33 (0 fallos), regresión 50 (0 falsos-negativos), `npm test` verde,
> triggers probados end-to-end, RPC/tablas legibles con anon. Deploy vía
> `scripts/patch_busqueda_sin_ayuda.js` al workflow `ugHOTQv3Vb6cuTct`. Detalle abajo.

Fecha: 2026-07-20. Basado en las 38 filas de `solicitudes_ayuda` cruzadas contra el
inventario real (`productos`) y el motor actual (`scratch_live/live_buscar.js` v10).

## Diagnóstico

De las 16 escalaciones de julio (algoritmo actual), la autopsia da estas causas:

| # | Causa | Casos (ids) | ¿El producto existe en DB? |
| :- | :--- | :--- | :--- |
| 1 | Follow-up conversacional: el agente busca la frase literal ("De la de 3.60", "Y el saco de cemento", "No me importa la marca") en vez de producto+atributo | 47, 49, 52 | SÍ (lámina 3.66, cemento gris 607 uds) |
| 2 | Consulta vaga o ininteligible ("pásame los precios", "Thiban estore", consulta null) | 51, 53, 55 | n/a |
| 3 | Cliente pide FOTOS (el bot no puede enviarlas y escala) | 40, 42, 46 | n/a |
| 4 | Vocabulario/sinónimo faltante ("tela pollera"=malla gallinero, "popotes/pipotes de agua"=tanque, "4x4"=100x100mm, "pigmento"=óxido, "cielo raso"=drywall) | 50, 54 (+32, 39, 16 de junio) | SÍ |
| 5 | Medida pedida no existe pero la categoría sí → medMismatch fuerza PEDIR_AYUDA ("cal 35" cuando solo hay CAL.30; "#8 12" dos números juntos) | 45, 48 (+17 junio) | Parcial (variante cercana) |
| 6 | Ruido conversacional rompe el AND del ilike ("me dijeron que habían llegado los alambres de púa" → busca 'dijeron') | 44 | SÍ (7 productos púa) |
| 7 | El producto realmente NO se vende (hoyadora, pistón guadaña, tabelón) | 43 (+18, 21 junio) | NO |

Estimación: 13 de 16 escalaciones de julio eran evitables.

Datos de apoyo:
- `pg_trgm` YA está instalado en Supabase (fuzzy factible sin migración de extensión).
- `busqueda_aprendizaje` tiene solo 9 filas pero hay 15 `solicitudes_ayuda_items`
  resueltos por empleados → el loop de aprendizaje NO se está cerrando solo.
- 3 solicitudes marcadas `no_disponible=true` por empleados: conocimiento negativo
  que hoy se pierde.

## Fase 1 — Motor de búsqueda (`live_buscar.js` → sync a `scripts/new_buscar.js`, deploy vía patch al workflow `ugHOTQv3Vb6cuTct`)

1.1 **Relajación progresiva de tokens.** Hoy: si el AND de todas las palabras falla,
    salta directo a "la palabra más larga" (y 'dijeron' le gana a 'pua'). Cambiar a:
    reintentar quitando UN token de texto a la vez (empezando por los que menos
    parecen producto: verbos/adjetivos raros), antes del fallback de palabra única.
    Arregla causa 6.

1.2 **Stopwords conversacionales ampliadas** en `IGNORED`: saludos, bendiciones,
    dijeron, dijo, habian, llegado, llegaron, pregunte, pregunta, regalas, regala,
    pasame, pasa, mandame, manda, hermano, varon, ok, listo, dia, señor, amiga,
    disponible, disponibles, fa, xfavr, porfavor.

1.3 **Sinónimos nuevos** en `SIN` (todos verificados contra el catálogo):
    - `tela pollera`, `tela gallinero`, `malla pollo`, `malla para pollos` → `malla gallinero` (2 productos, hay stock)
    - `pipote`, `popote`, `pipa de agua`, `pipas` → `tanque` (28 productos)
    - `pigmento` → `oxido` ("OXIDO P/PISO AMARILLO 1.5KG OXINET" existe)
    - `cielo raso` → `drywall` (9 productos de accesorios)
    - `prepintada`/`prepintado` → tratar como modificador descartable (el catálogo usa colores: ROJO, AZUL)
    - `hoyadora`, `ahoyadora` → sin destino (candidato directo a respuesta negativa, ver 2.2)

1.4 **Equivalencias de medidas nuevas** (extender `SIZEQ`/`medPresent`):
    - Voltaje: `110v` ↔ `120v` (y `110` ↔ `120` cuando acompaña a protector/regulador). Arregla el caso protector de aire.
    - Estructurales en pulgadas → mm: `4x4` → `100x100` (verificado: 5 productos 100X100). Auditar también 2x2/3x3 contra el catálogo antes de mapear.
    - Largos de lámina: `3.60`/`3.6` → `3.66`; `12 pies` ↔ `3.66`; `10 pies` ↔ `3.05`.

1.5 **Respuesta PARCIAL en vez de PEDIR_AYUDA cuando la categoría existe** (cambio
    de mayor impacto). Hoy `medMismatch` → instruccion de emitir [PEDIR_AYUDA].
    Nuevo: si la medida no existe pero hay productos de la MISMA categoría, devolver
    hasta 3 variantes con `parcial:true` e `instruccion`: "Dile al cliente con
    honestidad que la medida/calibre X no lo tenemos, y ofrécele estas variantes
    aclarando la diferencia. NO lo presentes como si fuera lo que pidió." Ejemplo:
    "cal 35 no manejamos; tenemos la arquitectónica 1.10x6m CAL.30 (agotada hoy,
    ¿quieres que te avise?)". Mantiene el principio anti-sustitución (el bot ACLARA,
    no engaña) pero deja de escalar. PEDIR_AYUDA queda solo para categoría inexistente.
    Arregla causa 5 y el histórico de láminas de junio.

1.6 **Números múltiples en conflicto.** Si hay ≥2 tokens numéricos y el filtro de
    medida deja 0, reintentar con cada número por separado y devolver ambas opciones
    ("¿cable #8 o #12? tengo los dos"). Arregla id 45.

1.7 **Fallback fuzzy con pg_trgm** (último recurso antes de rendirse): RPC nueva
    `buscar_fuzzy(p_term)` → `similarity(descripcion, p_term) > 0.25 order by
    similarity desc limit 10`, y el score JS normal encima. Atrapa typos extremos
    ("sinz" ya está mapeado, pero esto generaliza).

1.8 **Tokens vacíos o solo ruido** → nueva instruccion "PREGUNTA al cliente qué
    producto necesita (no busques, no escales)". Distinta de PEDIR_AYUDA. Arregla
    causa 2 (id 55 "pásame los precios", id 47 si llega solo "saco").

## Fase 2 — Cerrar el loop de aprendizaje (SQL en Supabase)

2.1 **Aprendizaje positivo automático**: trigger AFTER INSERT en
    `solicitudes_ayuda_items` que tokenice la `consulta` de la solicitud (misma
    normalización que el motor) y haga upsert en `busqueda_aprendizaje`
    (termino_tokens → codigo_producto, usos+1). Cada corrección de empleado enseña
    al bot; la próxima vez el `aprBoost` existente lo resuelve solo.

2.2 **Aprendizaje negativo**: tabla nueva `busqueda_negativa` (termino_tokens,
    fuente_solicitud_id, creado_en). Se alimenta con trigger cuando el empleado marca
    `no_disponible=true`. El motor la consulta ANTES de emitir PEDIR_AYUDA: si el
    término ya fue marcado como no-vendido (<90 días), devolver instruccion "responde
    que ese producto no lo trabajamos y ofrece ayudar con otra cosa" — sin escalar.
    Caducidad de 90 días por si el producto llega después.

2.3 **Backfill único**: correr sobre los 15 items resueltos y 3 no_disponible
    históricos para arrancar con conocimiento.

## Fase 3 — systemMessage (`scratch_live/live_systemMessage.txt`)

3.1 **Regla FOLLOW-UP** (mayor causa actual): "Cuando el cliente responde corto
    ('¿y de 3.60?', 'la roja', 'el saco') NUNCA busques esa frase literal: reconstruye
    el término completo con el producto del que venían hablando ('lamina zinc 3.60',
    'lamina arquitectonica roja'). Si no sabes de qué producto hablan, pregunta."

3.2 **Consultas vagas**: "Si el cliente pide 'precios' o 'lista' sin decir de qué,
    pregunta qué producto busca. No busques ni pidas ayuda."

3.3 **Fotos**: "Si piden fotos: explica que por este canal no manejas fotos, y ofrece
    descripción exacta + precio + disponibilidad. Solo si el cliente insiste en ver
    fotos, emite [PEDIR_AYUDA]."

## Fase 4 — Validación y medición

4.1 Añadir al harness `scripts/_test_busqueda_50.js` un golden set con las ~27
    consultas reales de `solicitudes_ayuda` (texto literal del cliente + resultado
    esperado: producto correcto / parcial / negativa / aclaración).
4.2 Criterio de aceptación: 0 regresiones en la suite actual + ≥12 de los 16 casos
    de julio resueltos sin escalar.
4.3 Métrica continua: conteo semanal de `solicitudes_ayuda` (hoy ~8/semana). Meta:
    <3/semana, y que las que queden sean solo causa 7 nueva (producto de verdad
    inexistente aún no aprendido) o cliente insistiendo en fotos.

## Orden de ejecución sugerido

1. Fase 3 (solo prompt, riesgo bajo, ataca la causa #1 de julio) — 30 min.
2. Fase 1.2 + 1.3 + 1.4 (stopwords/sinónimos/equivalencias, cambios acotados) + tests.
3. Fase 1.5 + 1.8 (respuesta parcial y aclaración — cambia el contrato con el prompt:
   actualizar systemMessage en el mismo deploy).
4. Fase 1.1 + 1.6 + 1.7 (relajación, números múltiples, fuzzy RPC).
5. Fase 2 (triggers de aprendizaje + backfill).
6. Fase 4 continuo en cada paso.

## Notas de implementación

- Fuente de verdad = `scratch_live/live_*.js` (dump del workflow vivo); mantener
  `scripts/new_buscar.js` sincronizado y desplegar con patch script + verificación
  (`scripts/check_sources_sync.js`), según el runbook de memoria.
- `live_presupuesto.js` comparte la lógica de medidas: replicar 1.3/1.4 allí.
- La regla anti-sustitución sigue vigente: PARCIAL siempre declara la diferencia;
  nunca presentar una variante como si fuera lo pedido.
