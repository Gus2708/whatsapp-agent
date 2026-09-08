# Plan 010: Medir el recall por antigüedad de venta — ¿el ranking esconde el stock frío?

> **Executor instructions**: Follow step by step. Report with the standard format when done.
> Skip the README update — reviewer maintains the index.
>
> **Drift check**: `git diff --stat 3ac8a1d..HEAD -- scratch_live/live_buscar.js scripts/_test_coloquial.js`
> If either file changed, re-read it before starting.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW en los pasos 1–3 (solo medición, no toca producción). MEDIO en el paso 5.
- **Depends on**: none
- **Category**: search-quality
- **Planned at**: commit `3ac8a1d`, 2026-08-29
- **Result (medido 2026-09-07, veredicto gate A/B)**: **REJECTED — diferencia < 5 puntos**.
  Ejecutado vía change `search-accuracy` (openspec). El desglose queda como métrica permanente.
- **Re-medición 2026-09-08 (cambio `rrf-reintento`, vector VIVO vía override local OpenRouter)**:
  **REJECTED de nuevo — gap 4,1 pts < 5**, pero con corrección de atribución: el gap 0 del
  07-09 fue medición **sin vector** (clave vacía + egress geo-bloqueado por OpenAI), no un
  efecto del código. Con el vector vivo el aporte es **+13 aciertos reales** (244 vs 231).

### Resultado por bucket (mismo set cacheado de 320, código actual `0c31b52`)

| Bucket | Casos | Recall exacto | Fallos |
|---|---|---:|---:|---:|
| vendido < 1 año | 171 | 72,5% (124/171) | — |
| venta > 1 año | 26 | 53,8% (14/26) | — |
| sin historial | 123 | 75,6% (93/123) | — |
| **Global** | **320** | **72,2% (231/320)** | 9,7% (31/320) |

> ⚠️ **Re-medición 2026-09-08 (A3 + recalibración, vector vivo vía OpenRouter):**
>
> | Bucket | vec-new (con vector) | sinvec-new (sin vector) |
> |---|---|---|
> | vendido < 1 año | 133/171 (77,8%) | 124/171 (72,5%) |
> | venta > 1 año | 15/26 (57,7%) | 14/26 (53,8%) |
> | sin historial | 96/123 (78,0%) | 93/123 (75,6%) |
> | **Global** | **244/320 (76,3%)** | **231/320 (72,2%)** |
>
> **Corrección de atribución**: la medición 2026-09-07 (231/320 en ambos lados, gap 0) corrió
> el camino **frío** — OPENAI_API_KEY vacía y egress geo-bloqueado por OpenAI; ambos lados
> ejecutaron el mismo código léxico, por eso el gap 0 idéntico. NO es evidencia de que
> «el intento 4 neutralizó el vector». Con el vector vivo el aporte es **+13 aciertos reales**,
> mayormente en el bucket frío (sin historial: +3) y el vivo (+9). El desempate por ventas
> sigue **sin hundir** el stock frío (el bucket vivo rinde mejor que en el 07-09 incluso sin
> vector). Veredicto final: **REJECTED — gap 4,1 pts < 5** (y `vec-new` 244 < 246), sin
> deploy; el RRF queda diferido con prerrequisito de dedupe por familia (plan 006).
>
> **Phase C (aislamiento de la caída)**: la caída histórica 246→231 **no se reproduce
> caliente** — 4 corridas A/B de `b439c4a` y `c33e0b0` (before/after, cuerpos portados) dieron
> todas **243/320 con after==before** → ambos sospechosos **inocentes**. Deuda de
> investigación externa: sospecha principal la reconstrucción nocturna de popularidad y
> vocabulario (workflow cron 3:00) que cambia rankings/equivalencias entre mediciones sin tocar
> código. La regresión de 86 casos tiene 2 FN pre-existentes (baseline `b1e8823` idéntico,
> delta 0): `#11 "sinz de 6 metros"` y `#28 "lamina de zinc"` (ver RAG.md §7). El gate se
> re-midió con el override local `OPENAI_API_BASE`→OpenRouter (ver RAG.md §6 regla 7).

## Por qué importa

`node rag.js` dibujó por primera vez la distribución del catálogo por mes de última venta,
y la forma es fea:

```
 ACTIVIDAD DEL CATÁLOGO                 COMPOSICIÓN DEL STOCK
  ago 26 ██████████████████████    966   vendido en 1 año ███████░░░░░░░  2.510  49%
  jul 26 ███████████░░░░░░░░░░░    478   sin venta        ███████░░░░░░░  2.643  51%
  ...
  antes                         1.799
```

**2.643 productos tienen existencia y no venden desde hace más de un año** — el 51% del
stock. Otros 1.799 vendieron por última vez hace ocho meses o más.

El ranking por ventas ordena a favor de los que sí venden. Eso es correcto casi siempre:
fue justamente lo que arregló el caso del disco de corte. Pero hoy no sabemos qué le cuesta,
y hay tres hechos que juntos preocupan:

1. **La popularidad es desempate, nunca filtro** ([live_buscar.js:855-883](../scratch_live/live_buscar.js#L855)).
   Bien: un producto sin ventas no queda excluido.
2. **Pero solo cuatro productos llegan al cliente** (`unicos.slice(0,4)`, línea 888). Hundir
   lo suficiente equivale a esconder.
3. **En la rama de coincidencia exacta el orden es `fullMatch → stock → VENTAS → scoreMatch`**.
   Entre dos productos que coinciden igual de bien y ambos con existencia, **siempre gana el
   que vendió**, sin importar cuánto. El que no vendió nunca pasa por delante.

Con 2.643 productos en esa situación, la pregunta "¿cuántas ventas estamos perdiendo porque
Perucho no los enseña?" no tiene hoy ninguna respuesta medida.

## Lo que ya sabemos y lo que no

**Sabemos** que el conjunto de harness sirve para medirlo tal cual está. Los 320 casos
cacheados en `scratch_live/_coloquial_set.json` llevan el `codigo` del producto esperado, y
cruzados con `producto_popularidad.ultima_venta` quedan así:

| Bucket | Casos | % |
|---|---:|---:|
| con venta en el último año | 174 | 54% |
| última venta anterior a 1 año | 23 | 7% |
| sin historial de venta | 123 | 38% |

**No hace falta un conjunto nuevo.** El 45% de los casos ya apunta a productos fríos.

**No sabemos** cuál es el recall de cada bucket, porque `_test_coloquial.js` publica una sola
cifra agregada (76.3%) y **no guarda los resultados por caso**: solo cachea las consultas. Hoy
la única forma de partir el número es volver a correr los 320 casos (~15 min).

Ese es el agujero real que este plan cierra. La lección repetida de este repo es *medir con
A/B sobre el mismo conjunto*; aquí ni siquiera tenemos el desglose.

## Pasos

### 1. Persistir los resultados por caso (P1, S)

En `scripts/_test_coloquial.js`, volcar a `scratch_live/_coloquial_resultados.json` una fila
por caso: `{ codigo, consulta, ok, posicion, top1_codigo, top1_descripcion, rescate, parcial }`.

Sin esto, cada pregunta nueva sobre el recall cuesta 15 minutos. Con esto, se responde con
un `node -e` sobre el JSON.

`.gitignore` ya cubre `*.json` en `scratch_live/`; comprobar que sigue siendo así.

### 2. Desglosar el informe por antigüedad de venta (P1, S)

Al terminar la corrida, cruzar los códigos con `producto_popularidad.ultima_venta` e imprimir
el recall de los tres buckets junto al agregado. Ejemplo de la forma buscada:

```
  recall global            76.3%   (244/320)
    vendido < 1 año        __._%   (___/174)
    venta > 1 año          __._%   (___/23)
    sin historial          __._%   (___/123)
```

### 3. Correr y leer el resultado (P1, S)

`node rag.js medir`. **Regla de decisión, fijada ANTES de ver el número** para no
racionalizar después:

- diferencia **< 5 puntos** entre el bucket vivo y el frío → el desempate no hace daño
  medible. Cerrar el plan como REJECTED con la cifra, y quedarse el desglose como métrica
  permanente.
- diferencia **≥ 5 puntos** → seguir al paso 4.

### 4. A/B con el desempate por ventas apagado (solo si el paso 3 lo pide) (P1, M)

Añadir a `_test_coloquial.js` una bandera `--sin-ventas` que neutralice `vMap` (todos a 0),
igual que ya existe `--sin-vector`. Correr **sobre el mismo conjunto cacheado** y comparar
los tres buckets.

Esto separa dos causas que se confunden: que el frío se busque peor *por sí mismo* (descripciones
pobres, sin sinónimos, sin vector útil) frente a que *el ranking lo esté hundiendo*. Solo la
segunda se arregla tocando el orden.

### 5. Acotar el desempate (solo si el paso 4 confirma daño) (P2, M)

Si apagar las ventas mejora el bucket frío **sin empeorar el vivo**, el desempate está
demasiado suelto. Opciones a evaluar, en orden de menor riesgo:

- **Aplanar la señal**: comparar `log(1+ventas)` en vez de las unidades crudas, para que
  10.000 unidades no aplasten a 12.
- **Umbral de indiferencia**: tratar como empate las diferencias pequeñas de ventas y dejar
  que desempate `scoreMatch`. Es lo que ya se hizo con la similitud vectorial (`< 0.03`) y
  funcionó.
- **Diversidad en los 4 huecos**: reservar el último de los cuatro para el mejor candidato
  sin ventas recientes, si coincide igual de bien y tiene existencia.

Medir cada una con el A/B del paso 4. **Adoptar solo la que gane en global y no pierda en
ningún bucket.**

## STOP conditions

- **No tocar el orden de `live_buscar.js` antes de terminar el paso 3.** Este repo ya lleva
  cuatro intentos de mejora del ranking revertidos, dos de ellos porque empeoraron las cosas
  sin que nadie lo midiera hasta después.
- **No regenerar `_coloquial_set.json`.** Comparar dos corridas con consultas distintas no
  mide nada, y el conjunto actual ya tiene la mezcla que hace falta (54/7/38).
- Si el paso 3 da una diferencia < 5 puntos, **parar**. No seguir al 4 "por si acaso".

## Verificación

- `npm test` en verde (20/20) y los dos guards de sincronía.
- `node rag.js regresion` sin falsos negativos nuevos (86 casos).
- Si se toca el ranking: el A/B del paso 4 sobre el conjunto cacheado, con los tres buckets
  antes y después en el informe del ejecutor.

## Notas

- El desglose del paso 2 vale la pena aunque el plan acabe en REJECTED: convierte "76.3%" en
  una cifra que dice *de qué* mitad del catálogo se está fallando.
- La cifra de stock frío se ve en vivo con `node rag.js` (panel COMPOSICIÓN DEL STOCK). Si el
  51% baja mucho, este plan pierde urgencia por sí solo.
