# Jev: implementación y despliegue hasta el 1 de octubre de 2026

Jev ya participa en el workflow activo de n8n en dos puntos independientes: clasifica mensajes para un enrutador rápido y califica candidatos ambiguos de la búsqueda de productos. El enrutamiento está habilitado para chats privados entrantes elegibles; la calificación de productos está en `enforce`. La búsqueda, el precio, el inventario y los presupuestos siguen bajo las reglas existentes y PostgreSQL. Se eligió Vercel AI Gateway ante el acceso directo a TypeSafe por invitación que reportó el usuario.

**Estado comprobado al cierre de esta sesión:** el workflow `ugHOTQv3Vb6cuTct` estaba activo con 43 nodos y versión publicada `94a81bb7-1142-4bec-b92f-698389716a03`; `/healthz` respondió HTTP 200. El último muestreo de 20 ejecuciones no mostró errores. Esto confirma despliegue y funcionamiento básico, **no** una mejora medida en precisión comercial, conversión o satisfacción de clientes.

## Qué se construyó

| Etapa | Resultado |
| --- | --- |
| Adaptador y evaluación | [`lib/jev-shadow.js`](../lib/jev-shadow.js) admite TypeSafe directo y Vercel AI Gateway. El modo `shadow` clasifica intención, continuidad, departamento, material y problema. El [piloto](jev-shadow-pilot.md) documenta validación, redacción de datos y límites. |
| Workflow y contexto | `Prepare Conversation Context → Jev Shadow Decision → Needs Product Clarification?` integra observación y contexto sin dar al modelo autoridad sobre precios o cotizaciones. Se preservó `onError: "continueRegularOutput"` del AI Agent. |
| Búsqueda y reglas | Se añadieron mejoras deterministas de búsqueda, atributos técnicos, resolución problema→producto, estimación de materiales, kits de instalación y listas multiproducto. «Jev System 1» nombra esta arquitectura; esos cálculos locales no son llamadas al modelo Jev. Las etiquetas de departamento/material/problema del observador todavía no alimentan directamente la búsqueda publicada. |
| Enrutamiento | Guardias para chats privados entrantes válidos, primero `canary` y luego `all`. Solo saludos/despedidas, horario o ubicación explícitos y aislados, y una solicitud aislada de atención humana pueden tomar la ruta rápida cuando Jev y las reglas locales concuerdan con alta confianza. Productos, medidas, listas y presupuestos siguen hacia el Agent y sus herramientas. |
| Calificador de productos | [`lib/jev-product-qualifier.js`](../lib/jev-product-qualifier.js) evalúa hasta cuatro candidatos ambiguos mostrados por `buscar_productos_tool` mediante `/v1/evaluate`. Coincidencias léxicas exactas y discrepancias duras de medidas no lo invocan. Tiene modos `off`, `shadow` y `enforce`, independientes del enrutador conversacional. |

El calificador envía la solicitud reducida y descripciones de candidatos, nunca precios, existencias, ventas o credenciales de base de datos. En `enforce`, descarta candidatos con puntuación menor a `0.50`; los restantes conservan las reglas de confirmación y una aproximación nunca pasa a `exact`. Si todos se descartan, pide revisión humana. Un error, timeout o respuesta inválida conserva el resultado previo. La llamada añade latencia y consumo de tokens; no es un motor remoto de costo cero ni de ejecución submilisegundo. La redacción de datos personales es **de mejor esfuerzo**, no anonimización garantizada. Véase la [guía del calificador](jev-product-qualifier.md) para el contrato completo.

## Secuencia de verificación y puesta en vivo

| Hito | Evidencia y alcance |
| --- | --- |
| Pruebas iniciales | Corpus sintético de 30 casos: 25/30 de intención y 27/30 de continuidad en una corrida por Gateway; también se probó un corpus separado de 12 casos de atributos. Un seguimiento de color obtuvo una clasificación errónea con confianza alta, por lo que estos resultados no justificaban por sí solos abrir rutas a clientes. Detalles en el [piloto](jev-shadow-pilot.md). |
| n8n aislado | Una prueba en n8n 2.23.4 confirmó el adaptador con una solicitud real a Jev y que `shadow` conservaba los campos originales. Otra prueba de Code Tool mostró que `.first()` podía asociar el contexto del primer ítem a un segundo ítem; por eso no se conectaron etiquetas observadas directamente a cada búsqueda. |
| Producción conversacional | Tras habilitar `JEV_MODE=shadow`, se probó el enrutamiento limitado al remitente canary y luego `JEV_ROUTING_SCOPE=all`, con `JEV_ROUTING_ENABLED=true`. El usuario confirmó recepción de mensajes en su teléfono. Esa confirmación verifica entrega puntual; no mide calidad de todas las rutas. |
| Calificador en rama | PR #2, incorporado como `ed6dac8`, añadió helper, integración en la búsqueda, configuraciones y pruebas. Una ejecución sintética aislada de `/v1/evaluate` devolvió HTTP 200 y puntuaciones `0.97` para el tornillo correcto y `0.03` para un buje incorrecto. No era tráfico orgánico ni una tasa de acierto. |
| `shadow` y `enforce` en vivo | Se modificó solo el nodo vivo `buscar_productos_tool`, sin reemplazar las otras conexiones o nodos. Tras observar en `shadow`, se publicó la versión `94a81bb7-1142-4bec-b92f-698389716a03`: ausencia de modo implica `enforce`, pero `off` y `shadow` explícitos se respetan. El commit `7cb1792` hace que Docker Compose también use `enforce` por defecto; CI `36841334030` pasó. |

En la última validación local del cambio de producción pasaron 290 pruebas de Node y 23 de Vitest, más los chequeos de tipos y sincronización. Esas pruebas verifican contratos y regresiones conocidas; no sustituyen una medición con búsquedas reales etiquetadas. Los cambios de código están en `origin/master` hasta `7cb1792`.

## Operación en la otra PC

1. En el checkout del host de producción, sincronizar `master` con `git pull --ff-only origin master`. El workflow ya estaba publicado; el pull sincroniza el código y la configuración para futuras recreaciones.
2. Mantener en el `.env` privado `JEV_PROVIDER=vercel`, `JEV_MODEL=typesafe-ai/jev` y `AI_GATEWAY_API_KEY` configurada, sin imprimir ni subir su valor. Para el enrutador general, mantener `JEV_MODE=shadow`, `JEV_ROUTING_ENABLED=true` y `JEV_ROUTING_SCOPE=all` si se desea conservar el estado desplegado. El calificador usa `JEV_PRODUCT_QUALIFIER_MODE=enforce` por defecto en Compose; un valor explícito `off` o `shadow` prevalece.
3. No hace falta recrear n8n solo para activar el calificador: el nodo vivo ya se publicó. Si se recrea el contenedor, seguir el procedimiento de [`boot_serrucho.ps1`](../boot_serrucho.ps1) para volver a aplicar [`patch_container_runtime.js`](../scripts/patch_container_runtime.js), comprobar `/healthz` y revisar las variables efectivas sin exponer la clave.
4. No importar [`n8n_workflow.json`](../n8n_workflow.json) entero sobre el workflow vivo. La búsqueda viva difiere de la exportación generada en lógica ajena a este cambio; antes de un despliegue completo se deben reconciliar esas diferencias. Los túneles Quick Tunnel cambian: resolverlos con [`resolve_tunnel_url.js`](../scripts/resolve_tunnel_url.js), como indica [descubrimiento de túneles](tunnel-discovery.md).

**Reversión:** poner `JEV_PRODUCT_QUALIFIER_MODE=off` y recrear n8n para apagar solo el calificador; `shadow` conserva puntuaciones sin filtrar. Para retirar el enrutamiento rápido, usar `JEV_ROUTING_ENABLED=false` y recrear; `JEV_MODE=off` detiene también las solicitudes del observador. Son controles distintos y conviene cambiar uno a la vez.

## Qué falta medir

Registrar un conjunto de consultas reales revisadas por personas, con producto correcto, candidatos mostrados, decisión final y si hubo intervención humana. Comparar `off`/`shadow`/`enforce` en falsos descartes, falsos positivos, derivaciones, latencia y costo antes de ajustar los umbrales `0.50` y `0.85` o ampliar la autoridad del modelo. Las puntuaciones de Jev **no son probabilidades calibradas de acierto** hasta demostrarlo con esos datos. También queda pendiente conciliar la exportación del workflow con el nodo de búsqueda vivo.
