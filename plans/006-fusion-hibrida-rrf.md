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
