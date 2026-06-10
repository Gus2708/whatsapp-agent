# Guía: mostrar y atender la cola de clientes en espera (app de empleados)

Cuando un cliente le pide al bot hablar con una persona, el bot lo **encola** en la tabla
`public.atenciones_pendientes` de Supabase. La app de empleados solo tiene que **leer esa cola,
avisar (Realtime) y marcar atendido**. Todo el lado servidor (tabla, Realtime, RLS y el bot que
inserta al escalar) **ya está hecho**.

---

## 0. Lo que ya está listo en el servidor (no hay que tocar nada)

- Tabla `atenciones_pendientes` con: `id, telefono, nombre, motivo, status, creado_en, atendido_en, atendido_por`.
- El bot inserta una fila `status='pendiente'` automáticamente cuando un cliente escala.
- **Realtime activado** sobre la tabla (publicación `supabase_realtime`).
- **Anti-duplicados**: un cliente no genera dos filas pendientes aunque insista.
- **RLS**: un **empleado activo y logueado** puede leer la cola y marcar atendido.

Proyecto Supabase: `https://rgniqjfooifchyctnbzu.supabase.co` · usar la **anon/publishable key** + el
**token del empleado logueado** (Supabase Auth).

---

## 1. Requisito de seguridad (importante)

Las políticas RLS exigen que la app actúe como **empleado activo**:
- El empleado debe **iniciar sesión** con Supabase Auth (rol `authenticated`).
- Su `profiles.is_active` debe ser `true` (`is_active_employee()`), y para **marcar atendido** además
  se valida la sesión (`validate_session()`), igual que en `comandos_remotos`.
- El SDK adjunta solo el token del usuario a cada consulta/Realtime; no uses la `service_role` en la app.

---

## 2. Paso a paso

### Paso 1 — Cargar la cola al abrir la pantalla
Trae las pendientes ordenadas por llegada (la más vieja primero):

```sql
select id, telefono, nombre, motivo, creado_en
from atenciones_pendientes
where status = 'pendiente'
order by creado_en asc;
```

### Paso 2 — Suscribirse a Realtime (aviso instantáneo)
Escucha los `INSERT` de la tabla. Cada inserción nueva = un cliente que acaba de pedir atención →
**agrega a la lista + dispara una notificación** (sonido / heads-up).

### Paso 3 — Sincronizar entre empleados (recomendado)
Escucha también los `UPDATE`: cuando un empleado marca a un cliente como `atendido`, **quítalo de la
lista de los demás** para que dos personas no atiendan al mismo. (Alternativa simple: al recibir
cualquier cambio, recargar la query del Paso 1.)

### Paso 4 — Atender / cerrar
Cuando un empleado toma el caso, marca la fila:

```sql
update atenciones_pendientes
set status = 'atendido', atendido_en = now(), atendido_por = '<uuid-del-empleado>'
where id = <id> and status = 'pendiente';
```
> Tip: el `and status='pendiente'` evita que dos empleados lo "ganen" a la vez (el segundo update
> afecta 0 filas → muéstrale "ya lo tomó otro").

### Paso 5 — Notificación al empleado
En el handler del `INSERT` (Paso 2): muestra una notificación local de Android (`NotificationCompat`)
con `nombre`/`telefono` y el `motivo`, y un sonido. Opcional: badge con la cantidad de pendientes.

---

## 3. Código de ejemplo

### Kotlin — Supabase Android SDK (`supabase-kt`)

```kotlin
// Modelo
@Serializable
data class Atencion(
    val id: Long,
    val telefono: String,
    val nombre: String? = null,
    val motivo: String? = null,
    val status: String = "pendiente",
    @SerialName("creado_en") val creadoEn: String
)

// Cliente (instala los módulos Postgrest, Realtime y Auth)
val supabase = createSupabaseClient(
    supabaseUrl = "https://rgniqjfooifchyctnbzu.supabase.co",
    supabaseKey = ANON_KEY
) { install(Auth); install(Postgrest); install(Realtime) }

// (tras login del empleado, el SDK ya usa su token automáticamente)

// Paso 1 — cargar pendientes
suspend fun cargarPendientes(): List<Atencion> =
    supabase.from("atenciones_pendientes").select {
        filter { eq("status", "pendiente") }
        order("creado_en", Order.ASCENDING)
    }.decodeList()

// Paso 2/3 — Realtime
val canal = supabase.channel("cola-atenciones")
scope.launch {
    canal.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
        table = "atenciones_pendientes"
    }.collect { acc ->
        val a = acc.decodeRecord<Atencion>()
        notificarEmpleados(a)      // notificación + sonido
        agregarALista(a)
    }
}
scope.launch {
    canal.postgresChangeFlow<PostgresAction.Update>(schema = "public") {
        table = "atenciones_pendientes"
    }.collect { acc ->
        val a = acc.decodeRecord<Atencion>()
        if (a.status != "pendiente") quitarDeLista(a.id)
    }
}
canal.subscribe()

// Paso 4 — atender
suspend fun atender(id: Long, empleadoUid: String) {
    supabase.from("atenciones_pendientes").update({
        set("status", "atendido")
        set("atendido_en", "now()")
        set("atendido_por", empleadoUid)
    }) { filter { eq("id", id); eq("status", "pendiente") } }
}
```

### Alternativa REST / JS (si la app no usa el SDK Kotlin)

```js
// Cliente JS
const supabase = createClient(URL, ANON_KEY)        // tras login, usa el token del empleado
// Paso 1
const { data } = await supabase.from('atenciones_pendientes')
  .select('id,telefono,nombre,motivo,creado_en').eq('status','pendiente').order('creado_en')
// Paso 2/3
supabase.channel('cola-atenciones')
  .on('postgres_changes', { event:'INSERT', schema:'public', table:'atenciones_pendientes' },
      p => { notificar(p.new); agregar(p.new) })
  .on('postgres_changes', { event:'UPDATE', schema:'public', table:'atenciones_pendientes' },
      p => { if (p.new.status !== 'pendiente') quitar(p.new.id) })
  .subscribe()
// Paso 4
await supabase.from('atenciones_pendientes')
  .update({ status:'atendido', atendido_en:new Date().toISOString(), atendido_por: uid })
  .eq('id', id).eq('status','pendiente')
```

> Realtime + RLS: el cliente debe tener el **token del empleado** seteado (en supabase-js,
> `supabase.realtime.setAuth(accessToken)` tras el login; en supabase-kt es automático). Sin token
> válido de empleado activo, la suscripción no recibe filas.

---

## 4. Notas

- **Filtra siempre `status='pendiente'`** para la lista de "en espera".
- **"Esperando desde"**: usa `creado_en` para mostrar el tiempo de espera.
- **No te preocupes por duplicados**: el servidor garantiza una sola fila pendiente por teléfono.
- **Historial**: las filas `atendido` quedan guardadas (con quién y cuándo) — sirven para reportes.
- El campo `telefono` viene en formato WhatsApp (`58XXXXXXXXXX@c.us`); para mostrar, quita `@c.us`.
