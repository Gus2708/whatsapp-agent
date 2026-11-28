# Migración del Bot de WhatsApp (n8n Live + RAG + Dashboard) a Service Role Key

> **Importante:** n8n en producción ejecuta los workflows desde su propia base de datos PostgreSQL (en Docker sobre PC PRINCIPAL), **no** desde los archivos JSON del repositorio. Antes de cerrar las políticas de lectura `anon` en Supabase (Fase P3: `productos` y `tazas`), hay que actualizar el contenedor de n8n y los workflows en vivo.

## 0. Smoke Test PREVIO (baseline antes de cambiar nada)

Ejecuta estas dos verificaciones rápidas antes de tocar `.env` o n8n para confirmar el estado inicial:

1. **Bot de WhatsApp:** envía desde un número de prueba una pregunta de producto real (por ejemplo: `"precio del cemento gris"`). Verifica que responde con precio en USD y Bs (tasa BCV).
2. **RAG CLI local (PC PRINCIPAL):**
   ```powershell
   node rag.js buscar "cemento gris"
   ```
   Verifica que devuelve resultados de catálogo sin errores.

---

## 1. Configurar la clave de servicio en PC PRINCIPAL y Vercel

### PC PRINCIPAL (`.env` en la raíz de `whatsapp-agent`)
1. Abre `.env` en PC PRINCIPAL (nunca pegues ni imprimas el valor en chats o logs).
2. Asegúrate de tener configurada la clave `service_role` del proyecto Supabase `rgniqjfooifchyctnbzu`:
   ```dotenv
   SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>
   ```
   *(Nota: todos los scripts, `rag.js`, `docker-compose.yml` y los workflows aceptan indistintamente `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SERVICE_KEY`, y si ninguna está definida hacen fallback a `SUPABASE_ANON_KEY` con una advertencia única.)*

### Vercel Dashboard (`dashboard/`)
1. En **Vercel → Project Settings → Environment Variables**, agrega (solo **Server-side**, **NUNCA** con prefijo `NEXT_PUBLIC_`):
   - `SUPABASE_SERVICE_ROLE_KEY` = `<tu-service-role-key>` (para Production y Preview)
   - *(Opcional, solo si llamas `/api/rag` desde un servicio backend externo)* `RAG_API_SECRET` = `<secreto-aleatorio>`
2. Verifica que `SUPABASE_URL` y `SUPABASE_ANON_KEY` (y sus variantes `NEXT_PUBLIC_*`) siguen configuradas para que `/api/rag` pueda validar el JWT del usuario con `supabase.auth.getUser(token)` y confirmar que es empleado activo mediante `rpc('is_active_employee')` (devuelve HTTP `403` si no es empleado activo).
3. Redespliega el dashboard en Vercel después de guardar las variables.

---

## 2. Recrear el contenedor de n8n en PC PRINCIPAL

Desde la carpeta del repositorio en PC PRINCIPAL:

```powershell
docker compose up -d --force-recreate n8n
```

Verifica que la variable quedó inyectada dentro del contenedor **sin imprimir su valor**:

```powershell
docker exec n8n_agent sh -c 'test -n "$SUPABASE_SERVICE_ROLE_KEY" -o -n "$SUPABASE_SERVICE_KEY" && echo "OK: service key presente" || echo "ERROR: falta service key"'
```

---

## 3. Actualizar los 4 workflows EN VIVO en n8n

Abre n8n en `http://localhost:5678` (o usa la API local de n8n). Debes actualizar **los 4 workflows activos** para que lean `$env.SUPABASE_SERVICE_ROLE_KEY || $env.SUPABASE_SERVICE_KEY` y no queden JWTs `anon` hardcodeados:

| Workflow en n8n | ID | Archivo de referencia en repo | Nodos con llamadas a Supabase |
|---|---|---|---|
| **WhatsApp Agent (Principal)** | `ugHOTQv3Vb6cuTct` | `n8n_workflow.json` | Los 16 nodos Code/Tool (`Check Chat Session`, `Set Chat Manual`, `buscar_productos_tool`, `obtener_tasa_bcv_tool`, `buscar_memoria_engram_tool`, `guardar_memoria_engram_tool`, `hacer_presupuesto_tool`, `Cliente Memoria`, `Filtro Anti-Duplicado`, `Registrar Atencion Pendiente`, `Registrar Solicitud Ayuda`, `Transcribir Nota de Voz`, `Sanitize Agent Output`, `Detectar Handoff Empleado`, `Debounce Ráfaga`, `Procesar Comando Admin`) |
| **Reenviar Ayuda** | `I29v5i9CxGgN6VKR` | `workflows/workflow_reenviar_ayuda.json` | `Componer y Marcar` |
| **Sync Vocabulario Catálogo** | `mJkBIhVMmLzkmYkP` | `workflows/workflow_vocabulario.json` | `Sincronizar Vocabulario`, `Monitor Embeddings`, `Refrescar Popularidad` |
| **Auto-Mejora y Self-Healing de Búsqueda** | `KCG5nhBlq7nL5dV2` | `workflows/workflow_automejora.json` | `Context & Candidates Gatherer`, `Sandbox & Auto-Apply` |

### Opción A — Re-importar desde los JSON del repo (recomendado para los 3 auxiliares)
Para cada uno de los 3 workflows auxiliares (`workflow_reenviar_ayuda.json`, `workflow_vocabulario.json`, `workflow_automejora.json`):
1. Abre el workflow en la UI de n8n (`http://localhost:5678`).
2. Menú `⋮` → **Import from File** → selecciona el JSON actualizado en `workflows/`.
3. Verifica que las credenciales existentes (p. ej. OpenRouter/WAHA) siguen enlazadas.
4. Haz clic en **Save** y confirma que el workflow queda **Active**.

Para el workflow principal (`ugHOTQv3Vb6cuTct`):
- Si tienes cambios en vivo no reflejados en `n8n_workflow.json`, **no** sobrescribas el workflow entero sin exportar un backup primero (`Export` → guardar respaldo local).
- En los nodos que leen Supabase (como mínimo los que leen `productos` y `tazas`: `buscar_productos_tool`, `hacer_presupuesto_tool`, `obtener_tasa_bcv_tool`, y preferiblemente los 16 nodos), reemplaza la línea `const ANON = ...;` por:
  ```js
  const _SB_SVC = (typeof $env !== 'undefined' && ($env.SUPABASE_SERVICE_ROLE_KEY || $env.SUPABASE_SERVICE_KEY)) || (typeof process !== 'undefined' && process.env && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)) || '';
  const _SB_ANON = (typeof $env !== 'undefined' && $env.SUPABASE_ANON_KEY) || (typeof process !== 'undefined' && process.env && process.env.SUPABASE_ANON_KEY) || '';
  if (!_SB_SVC && _SB_ANON && typeof globalThis !== 'undefined' && !globalThis.__sbAnonFallbackWarned) { globalThis.__sbAnonFallbackWarned = true; if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[supabase-key] SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY not set; falling back to SUPABASE_ANON_KEY'); }
  const ANON = _SB_SVC || _SB_ANON;
  ```
  *(En `Transcribir Nota de Voz` la variable final es `const _ANON = _SB_SVC || _SB_ANON;`.)*
- Guarda y publica la nueva versión en n8n.

### Verificación de que no quedan JWTs hardcodeados en vivo
Después de guardar, confirma en el historial de ejecuciones de n8n que no aparece el aviso `[supabase-key] ... falling back to SUPABASE_ANON_KEY` en los logs del contenedor:
```powershell
docker logs --since 5m n8n_agent 2>&1 | Select-String "supabase-key"
```
Si no devuelve líneas después de ejecutar una consulta, el contenedor está usando la clave `service_role`.

---

## 4. Smoke Test POSTERIOR (antes y después de aplicar Fase P3 en Supabase)

Ejecuta estas pruebas **después de actualizar n8n/Vercel** y repítelas **inmediatamente después de cerrar lecturas `anon` en Supabase**:

1. **Bot de WhatsApp:** envía `"precio del cemento gris"` (u otro producto con stock). Debe responder con precio USD + Bs sin error ni escalamiento falso.
2. **RAG CLI local (PC PRINCIPAL):**
   ```powershell
   node rag.js buscar "cemento gris"
   ```
   Debe devolver productos y **no** imprimir el warning de fallback a `SUPABASE_ANON_KEY`.
3. **Embeddings nocturnos (dry-run):**
   ```powershell
   node scripts/generar_embeddings.js --dry
   ```
   Debe leer catálogo y embeddings sin warning de fallback.
4. **Vercel Dashboard `/api/rag` (seguridad + funcionalidad):**
   - **Sin autenticación (debe devolver HTTP 401):**
     ```powershell
     curl.exe -i -X POST https://<tu-dashboard>.vercel.app/api/rag -H "Content-Type: application/json" -d "{\"query\":\"cemento\"}"
     ```
     Resultado esperado: `HTTP/1.1 401 Unauthorized`.
   - **Con sesión real en el navegador:** inicia sesión en el Dashboard con un empleado válido → pestaña **RAG Studio** → ejecuta `"cemento gris"` → debe devolver resultados reales (HTTP 200).
   - **En Modo Demo:** entra en Modo Demo → pestaña **RAG Studio** → ejecuta `"Tornillo drywall 1/2 x 100u"` → debe mostrar vista previa `[DEMO]` local sin llamar a Supabase con clave de servicio.

---

## 5. Rollback rápido (si algo falla antes de cerrar P3)

- **n8n:** restaura la versión anterior desde el historial de versiones de n8n (o el backup exportado).
- **Supabase:** si ya aplicaste Fase P3 y alguna consulta falló por un nodo sin migrar, ejecuta el script de rollback de la migración P3 en el SQL Editor de Supabase hasta completar la actualización del nodo faltante.
