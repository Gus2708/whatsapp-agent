# Fusión híbrida (RRF) entre búsqueda léxica y vectorial

**Estado:** pendiente. Terreno preparado, sin empezar.
**Por qué importa:** es la mejora de RAG más grande que queda. Se propuso al plantear los
embeddings v2 y no se llegó a implementar.

## El problema hoy

La capa vectorial **reemplaza** los resultados léxicos, no se combina con ellos. En
`scratch_live/live_buscar.js` (líneas ~469 y ~517) el patrón es:

```js
res = _vec;   // el vector aplasta lo léxico
```

Es todo-o-nada: o gana el léxico o gana el vector. Un producto que sale 3º en léxico y 2º
en vector —o sea, el que las dos señales consideran bueno— **no sube por consenso**, que es
justo lo que un buen ranking híbrido debería premiar.

## Qué implementar

**Reciprocal Rank Fusion.** Para cada producto presente en cualquiera de las dos listas:

```
score_rrf(p) = Σ  1 / (k + rango(p, lista))        con k ≈ 60
```

Se suma sobre las listas donde aparece. Si está en las dos, suma dos veces y sube. Es
robusto porque usa **rangos, no puntuaciones**: no hay que normalizar la similitud de coseno
contra el score léxico, que están en escalas incomparables (fue lo que hizo inviable
mezclarlas directamente).

### Dónde tocar

1. `buscarVectorial()` ya devuelve filas con `similitud`. Conservar el **orden** (es el rango).
2. Donde hoy hay `res = _vec`, construir en su lugar la fusión de `res` (léxico) y `_vec`.
3. Desempatar con el score de ventas (`vMap`), que ya está cableado.
4. `_rescate` debe seguir marcándose **solo** si el resultado que gana viene del vector y no
   estaba en lo léxico — si no, se marcaría como hipótesis algo que el léxico ya acertaba.

### Cuándo ejecutar el vector

Hoy solo se llama a OpenAI si al primer resultado le falta una palabra de la consulta. Para
fusionar de verdad habría que llamarlo **siempre**, y eso añade ~300-800 ms a TODAS las
búsquedas (hoy el camino feliz son ~700 ms y coste cero).

**Decidir explícitamente**, no por omisión:
- **(a) Fusión completa**: siempre. Mejor ranking, peor latencia y coste por mensaje.
- **(b) Fusión condicional**: mantener el gatillo actual y fusionar solo cuando dispare.
  Conserva el camino feliz gratis. **Recomendada para empezar.**

## Cómo medirlo

Ya está todo montado:

```bash
node scripts/_test_coloquial.js --etiqueta rrf          # con fusión
node scripts/_test_coloquial.js --sin-vector --etiqueta control
node scripts/_test_busqueda_50.js                       # regresión, 0 falsos negativos
node scripts/_test_vector.js                            # margen señal/ruido
```

Línea base a batir (mismo set de 320, ya medido):

| | recall exacto | fallos |
| :--- | ---: | ---: |
| v3 con vector | 246 (76,9%) | 20 (6,3%) |
| sin vector (control) | 239 (74,7%) | 24 (7,5%) |

## INTENTO 1 (2026-08-08) — implementado, medido, REVERTIDO

Se implementó RRF condicional con k=60 y popularidad multiplicativa, tal como se describe
arriba. **Falló en el caso que la capa vectorial existía para resolver**, dos veces:

| Pesos | `"tapa para el baño"` | Esperado |
| :--- | :--- | :--- |
| léxico 1 / vector 1 | Tapa P/toma 270 ❌ | Tapa de Inodoro |
| léxico 1 / vector 3 | Tapa P/toma 270 ❌ | Tapa de Inodoro |

**Modo de fallo A — el consenso premia equivocarse en grupo.** Aquí solo se fusiona cuando
lo léxico ya es *sospechoso*. Lo léxico trae MUCHAS variantes malas de la misma familia
("Tapa P/toma 270 blanco", "…marfil", "Tapa Plast Marfil P/toma…") que aparecen en las dos
listas y suman RRF dos veces cada una, mientras el acierto del vector aparece UNA vez. El
error tiene mayoría. Subir el peso del vector a 3 no bastó.

**Modo de fallo B — la popularidad pelea contra la semántica.** Y este es más profundo:
las tapas de tomacorriente se venden constantemente; los asientos de inodoro casi no. El
factor multiplicativo de `producto_popularidad` rescata el resultado equivocado justo
cuando la corrección semántica lo estaba arreglando.

**OJO — B ya está pasando en producción, sin RRF.** Al revertir se comprobó que
`"tapa para el baño"` devuelve *Tapa P/toma* también en el estado actual. Cuando ese caso
se verificó como correcto (embeddings v2), el ranking por ventas todavía no existía. Es
decir: **la señal de ventas está pisando la corrección semántica hoy mismo**. No lo
introdujo RRF; RRF solo lo hizo visible.

## INTENTO 2 (2026-08-08) — arreglar el modo B: también revertido, pero AISLÓ LAS CAUSAS

Se intentó que la popularidad no reordenara cuando el resultado viene de una corrección
semántica (`_rescate`), conservando el orden de entrada. **Falló y empeoró un caso.** Pero
al medirlo quedaron aisladas dos causas distintas, y las dos están VIVAS en producción.

### Causa 1 — la condición de adopción del vector descarta aciertos

`"tapa para el baño"` NO es un problema de popularidad. El resultado correcto del vector
(*Tapa de Inodoro*, similitud 0.601) **se descarta** aquí:

```js
if (_vec.length > 0 && _vcat !== _d0.split(" ")[0])   // live_buscar.js, gatillo del vector
```

La condición exige que la categoría del vector DIFIERA de la léxica. Pero *Tapa P/toma* y
*Tapa de Inodoro* empiezan ambas por `tapa`, así que el acierto se tira y `_rescate` ni se
marca. La popularidad nunca llega a intervenir.

**Arreglo:** comparar el PRODUCTO (codigo_interno), no la primera palabra. Si el vector
propone un producto que no está en el top léxico, es una propuesta legítima aunque comparta
categoría.

### Causa 2 — la popularidad sí deshace el rescate de Luna

`"algo para cortar cabilla"` devolvía *Cizalla / Tenaza Cabillera* antes del ranking por
ventas; hoy devuelve **Cabilla Estriada**. Aquí Luna SÍ acierta la categoría (`cizalla`),
pero el desempate por ventas la deshace: las cabillas se venden muchísimo más que las
cizallas. **Este es el modo B genuino.**

**Por qué el arreglo del intento 2 no sirvió:** asumí que bastaba con conservar el orden de
entrada cuando hay `_rescate`. Es FALSO en la ruta de Luna: ahí las filas vienen de
`rpc(_rs.categoria)`, ordenadas por existencia, no por semántica. Conservar ese orden no
conserva nada útil.

**Arreglo:** ordenar semánticamente las filas del rescate ANTES de que la popularidad las
toque (p.ej. por `scoreMatch` contra la categoría deducida, o pidiendo al vector que ordene
ese conjunto), y solo entonces permitir que las ventas desempaten dentro de lo ya relevante.

### INTENTO 3 (2026-08-08) — arreglar la causa 1: revertido, pero acota la solución

Se cambió la condición de adopción de comparar CATEGORÍA a comparar PRODUCTO:

```js
if (_vec.length > 0 && _vec[0].codigo_interno !== res[0].codigo_interno)
```

**Regresión inmediata en el caso insignia:** `"disco de corte"` pasó de devolver
*Disco C/metal Fino 4-1/2X3.2 Covo* —el de 80 facturas, justo lo que el ranking por ventas
existe para lograr— a *Disco Diamantado*. Y `"tapa para el baño"` **seguía sin arreglarse**.

**Lo que esto enseña:** la condición vieja (categoría distinta) es demasiado ESTRICTA y la
nueva (producto distinto) demasiado LAXA. Con "producto distinto", el vector pisa cualquier
resultado léxico que estuviera bien, porque casi siempre propone algo distinto.

**La condición correcta no es una comparación de identidad, sino de CONFIANZA:** adoptar el
vector solo cuando hay evidencia de que lo léxico se equivocó, no solo de que opina distinto.
Ideas a probar (ninguna medida aún):
- exigir similitud alta del vector (p.ej. ≥0.55) **además** de que falte una palabra;
- comparar la fuerza relativa: adoptar solo si el `scoreMatch` del top léxico es bajo;
- exigir que el top léxico NO empiece por el sustantivo principal **y** que el del vector sí.

Ojo con `"tapa para el baño"`: en esta corrida el vector no llegó a proponer nada (sin marca
de hipótesis, 7,8 s → probable timeout de los 9 s). HNSW es aproximado y la latencia de
OpenAI varía; conviene instrumentar por qué no propuso antes de asumir que la condición
es el único problema.

### DISEÑO PARA EL INTENTO 4 — respaldado por el diagnóstico, SIN implementar

Tras arreglar el timeout de `buscar_semantico` (ver commit del índice HNSW) el diagnóstico
`scripts/_diag_vector.js` deja claro qué distingue los dos casos, y NO es la identidad del
producto ni la categoría:

| Consulta | Léxico | ¿Está bien? | Vector |
| :--- | :--- | :--- | :--- |
| `disco de corte` | Disco C/metal Fino Covo | **SÍ** (80 facturas) | DISCO DE CORTE HIL (0.687) |
| `tapa para el baño` | Tapa P/toma 270 | **NO** (es de tomacorriente) | TAPA DE INODORO (0.544) |
| `algo para cortar cabilla` | Aquafina SET Fregadero | **NO** | TENAZA CABILLERA (0.608) |

La señal que los separa es **si el resultado léxico está semánticamente cerca de la
consulta**. Eso el embedding lo sabe: basta comparar la similitud del TOP LÉXICO con la del
TOP VECTORIAL contra el mismo embedding de la consulta.

- Si son parecidas → lo léxico está bien, **no adoptar** (caso `disco de corte`).
- Si la del léxico es mucho menor → lo léxico se equivocó, **adoptar** el vector.

Ya existe la RPC para medirlo: `similitud_de_codigos(embedding, codigos[])`, un lookup por
PK, no un scan.

**BLOQUEO CONOCIDO:** `buscar_productos` NO expone `codigo_interno` en su salida (solo
`nombre`, `disponible`, `precio_divisas_texto`, `precio_bs_texto`), así que hoy no se puede
pedir la similitud del top léxico desde fuera. Hay que resolver eso primero — internamente
el nodo sí tiene los códigos en `unicos`, así que el cálculo puede hacerse DENTRO del nodo
sin cambiar el contrato de salida.

**Para la causa 2**, una vez adoptado el vector: el problema es que `vMap` (ventas) reordena
el conjunto rescatado. El intento 2 falló por hacer DOS cambios a la vez (saltar `vMap` y
además saltar el desempate por `scoreMatch`) y por asumir que el orden de entrada era
semántico —falso en la ruta de Luna, donde viene de `rpc(categoria)` ordenado por existencia—.
Hacer **solo** lo mínimo: cuando hay `_rescate`, ordenar el conjunto por similitud vectorial
(que sí es semántica y ya se puede pedir) y dejar que `vMap` desempate únicamente entre
productos de similitud parecida.

**Medir entre cada paso.** Los cuatro intentos previos cambiaron varias cosas a la vez.

### Los dos van acoplados

Arreglar solo la causa 1 hace que más consultas lleguen a la ruta de rescate, donde la
causa 2 las degrada. Hay que hacer los dos, y medir después de cada uno con el A/B de 320
más los 51 de regresión.

### Qué probar en el intento 2

1. **Resolver primero el modo B**, que es independiente de RRF: la popularidad no debería
   aplicarse —o debería aplicarse muy amortiguada— cuando el resultado viene de una
   corrección semántica (`_rescate`). Es la señal de "el cliente no está pidiendo lo que
   más se vende, está pidiendo otra cosa".
2. **Deduplicar por familia antes de fusionar**: colapsar variantes que comparten las
   primeras 2-3 palabras a un solo representante, para que una familia no vote N veces.
3. Solo entonces reintentar RRF, y medir con el A/B de 320.

**No repetir el intento 1 tal cual.** Está medido que no funciona.

## Advertencias aprendidas a golpes

- **HNSW es aproximado**: dos corridas del mismo probe pueden dar 3/7 y 5/7. No interpretar
  diferencias de 1-2 casos como señal; para eso está el set de 320.
- **El set de 320 muestrea al azar**, inventario muerto incluido, así que **subestima** el
  ranking por ventas. Un cambio puede bajar ese número y aun así ser correcto para el negocio.
- **La métrica que decide es el MARGEN señal/ruido**, no el acierto. v1 parecía "casi bien"
  (2/7) siendo inservible, porque su margen era 0.012. v2/v3 están en 0.123.
- **Las expectativas del probe pueden mentir**: escribirlas mal hizo que 6/7 pareciera 1/7.
  Al añadir casos, verificar a mano qué devuelve antes de fijar el `espera`.

## Otros pendientes menores (mismo terreno)

- `producto_descripcion` no está en el workflow nocturno: los productos nuevos no la tendrán.
  Medido que no aporta, así que no urge, pero deja el sistema desigual.
- `SIN` tiene `tubo electrico -> tubo electricidad`, pero exige subcadena **contigua** y el
  cliente escribe "tubo **pvc** electrico", así que no aplica. Salió de un pedido real.
- El harness debería muestrear **ponderando por ventas recientes** para reflejar lo que de
  verdad pide un cliente.
