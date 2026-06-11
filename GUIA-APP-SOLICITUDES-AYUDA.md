# Guía: "Solicitudes de ayuda" del bot (elegir productos → el bot reenvía)

Cuando el bot **no encuentra** un producto o el cliente **refuta** el resultado, el bot emite
`[PEDIR_AYUDA]`: n8n crea una fila en `solicitudes_ayuda`, le manda al cliente un mensaje puente
("dame un momentico, lo confirmo con un compañero 🪚") y **notifica a la app**. El empleado abre la
solicitud, **elige el/los producto(s) correcto(s)** y al enviar, n8n **rearma el mensaje y se lo
manda al cliente** por WhatsApp. Todo el lado servidor (tablas, Realtime, RLS, detección y reenvío)
**ya está hecho y probado**. Esta guía es solo para la pantalla de la app.

> Reusa lo que ya existe en la app: el patrón de cola de `app/atenciones.tsx` + `useAtenciones`, y el
> selector de productos `app/seleccionar-productos.tsx` + `usePresupuestoStore`.

---

## 0. Lo que ya está listo en el servidor

- **`solicitudes_ayuda`** (`id, telefono, nombre, consulta, motivo, status, creado_en, resuelto_en, resuelto_por, enviado_en`).
  `status`: `pendiente` → (el empleado elige) `resuelto` → (n8n envía) `enviado`.
- **`solicitudes_ayuda_items`** (`id, solicitud_id, codigo_producto, descripcion, cantidad, precio_unitario`).
- **Realtime** activado sobre `solicitudes_ayuda` (la app ve la cola al instante, igual que atenciones).
- **Webhook de reenvío** (n8n, ya activo): `POST {N8N_URL}/webhook/reenviar-ayuda` con `{ "solicitud_id": <id> }`.
  Idempotente: solo envía si la solicitud está `resuelto`; al enviar la marca `enviado`. Si el envío
  falla, responde error y NO la marca (se puede reintentar).
- **RLS**: empleado **activo** logueado (`authenticated`) puede leer la cola, escribir los items y resolver.

`.env.local` (nuevo): `EXPO_PUBLIC_N8N_URL=http://192.168.1.143:5678`  ← n8n en la PC de la tienda
(misma red local; fuera de la tienda se necesita túnel/url pública).

---

## 1. Tipos (añadir a `src/lib/supabase.ts`)

```ts
export type SolicitudAyuda = {
  id:           number;
  telefono:     string;
  nombre:       string | null;
  consulta:     string | null;   // lo que pidió el cliente (su mensaje)
  motivo:       string;          // 'no_encontrado' | 'refutado'
  status:       'pendiente' | 'resuelto' | 'enviado' | 'descartado';
  creado_en:    string;
  resuelto_en:  string | null;
  resuelto_por: string | null;
  enviado_en:   string | null;
};
```

---

## 2. Paso a paso

### Paso 1 — Cola de solicitudes pendientes (hook + Realtime)
Igual que `useAtenciones`. La invalidación por Realtime ya la maneja el suscriptor global de la app
(el mismo que refresca `atenciones`); solo agrega la tabla `solicitudes_ayuda` a esa suscripción.

```ts
// src/hooks/useSolicitudes.ts
import { useQuery } from '@tanstack/react-query';
import { supabase, SolicitudAyuda } from '../lib/supabase';

export function useSolicitudes() {
  return useQuery({
    queryKey: ['solicitudes-pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitudes_ayuda')
        .select('id, telefono, nombre, consulta, motivo, status, creado_en, resuelto_en, resuelto_por, enviado_en')
        .eq('status', 'pendiente')
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SolicitudAyuda[];
    },
    staleTime: 0,
  });
}
```

En el suscriptor Realtime global, añade el canal (igual que para `atenciones_pendientes`):
```ts
supabase.channel('solicitudes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes_ayuda' }, () => {
    queryClient.invalidateQueries({ queryKey: ['solicitudes-pendientes'] });
    // notificar al empleado en INSERT (igual que en atenciones)
  })
  .subscribe();
```

### Paso 2 — Pantalla de cola (reusar el patrón de `atenciones.tsx`)
Una `FlashList` de tarjetas: muestra `nombre`/`telefono`, **`consulta`** (lo que pidió el cliente) y
el tiempo de espera. Botón principal: **"ELEGIR PRODUCTO(S)"** → navega al selector pasando el `id`
de la solicitud (`router.push({ pathname: '/seleccionar-productos', params: { solicitudId: item.id } })`).

### Paso 3 — Elegir productos (reusar `seleccionar-productos` + `usePresupuestoStore`)
La pantalla `seleccionar-productos.tsx` ya busca productos y arma una lista con cantidades
(`usePresupuestoStore`: `items[] = { producto, cantidad, precio_unitario }`). Reúsala; cuando venga
con `params.solicitudId`, el botón de confirmar llama a `resolverSolicitud()` (Paso 4) en vez de crear
un presupuesto normal.

### Paso 4 — Enviar la selección (escribe en DB + dispara el reenvío)
```ts
// src/hooks/useResolverSolicitud.ts
import { supabase } from '../lib/supabase';

const N8N_URL = process.env.EXPO_PUBLIC_N8N_URL;

export async function resolverSolicitud(
  solicitudId: number,
  empleadoId: string,
  items: { producto: { codigo_interno: string; descripcion: string; precio_venta: number }; cantidad: number }[],
) {
  if (items.length === 0) throw new Error('Elige al menos un producto');

  // 1) guardar los productos elegidos
  const { error: e1 } = await supabase.from('solicitudes_ayuda_items').insert(
    items.map(i => ({
      solicitud_id:    solicitudId,
      codigo_producto: i.producto.codigo_interno,
      descripcion:     i.producto.descripcion,
      cantidad:        i.cantidad,
      precio_unitario: i.producto.precio_venta,
    })),
  );
  if (e1) throw e1;

  // 2) marcar resuelto (solo si sigue pendiente -> evita doble resolución)
  const { data: upd, error: e2 } = await supabase
    .from('solicitudes_ayuda')
    .update({ status: 'resuelto', resuelto_por: empleadoId, resuelto_en: new Date().toISOString() })
    .eq('id', solicitudId)
    .eq('status', 'pendiente')
    .select();
  if (e2) throw e2;
  if (!upd || upd.length === 0) throw new Error('Esta solicitud ya fue resuelta por otro compañero.');

  // 3) disparar el reenvío del mensaje corregido al cliente
  const res = await fetch(`${N8N_URL}/webhook/reenviar-ayuda`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ solicitud_id: solicitudId }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.ok === false) {
    // los productos quedaron guardados y la solicitud 'resuelto'; se puede reintentar el POST
    throw new Error('Se guardó, pero no se pudo enviar al cliente. Reintenta el envío.');
  }
  return out; // { ok: true, mensaje: 'mensaje reenviado al cliente', solicitud_id }
}
```

Al volver, limpia el store: `usePresupuestoStore.getState().clear()` y navega a la cola.

---

## 3. Reintento (si el webhook falló)
La solicitud queda `resuelto` con sus items guardados. Para reenviar, vuelve a hacer
`POST {N8N_URL}/webhook/reenviar-ayuda { solicitud_id }` (es idempotente: si ya se envió responde
`status=enviado` y no reenvía). Útil un botón "Reintentar envío" en las solicitudes `resuelto` sin
`enviado_en`.

---

## 4. Notas

- **Concurrencia**: el `.eq('status','pendiente')` en el update (Paso 4) garantiza que solo un empleado
  resuelva cada solicitud (igual que el claim de `atenciones`).
- **Mensaje que recibe el cliente**: lo arma n8n con los productos elegidos y precios actuales
  (USD + Bs). 1 producto = ficha; varios = presupuesto con total. La app NO arma el texto.
- **`consulta`** es el último mensaje del cliente; úsalo para saber qué buscar.
- **`motivo`** es `no_encontrado` por defecto (el bot no lo halló); informativo.
- **Seguridad**: el webhook no lleva auth (red local). Si se expone a internet, conviene un secreto
  en header. Las escrituras en DB sí exigen empleado activo (RLS).
- `telefono` viene como `58XXXXXXXXXX@c.us` (quita `@c.us` para mostrar).
