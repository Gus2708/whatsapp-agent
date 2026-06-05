# Estudio de Calidad — Bot Perucho (5/6/2026)

## Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Total escenarios | 29 |
| ✅ PASS | 19 |
| ❌ FAIL | 10 |
| Tasa de éxito | 66% |

### Por tipo de prueba
| Tipo | PASS | FAIL |
|---|---|---|
| exacto | 7 | 3 |
| coloquial | 6 | 3 |
| parcial | 2 | 1 |
| bs | 2 | 1 |
| ortografia | 1 | 0 |
| multi | 1 | 0 |
| sin_stock | 0 | 1 |
| fuera_catalogo | 0 | 1 |

## Resultados detallados

### ✅ PASS `C01` — exacto
**Pregunta del cliente:** "tienen cemento gris csc?"

**Respuesta del bot:**
```
Sí, tenemos cemento gris CSC disponible:

🔧 *CEMENTO GRIS CSC 42.5KG* — $11.00 USD · Stock: 555  

Si deseas realizar un pedido o necesitas más información, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `C02` — coloquial
**Pregunta del cliente:** "cuanto vale un saco de cemento?"

**Respuesta del bot:**
```
El precio de un saco de cemento gris CSC de 42.5KG es:

🔧 *CEMENTO GRIS CSC 42.5KG* — $11.00 USD  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `C03` — parcial
**Pregunta del cliente:** "precio del cemento 42 kilos"

**Respuesta del bot:**
```
El precio del cemento gris CSC de 42.5KG es:

🔧 *CEMENTO GRIS CSC 42.5KG* — $11.00 USD  

Si deseas más información o realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `C04` — bs
**Pregunta del cliente:** "cuanto sale el cemento en bolivares?"

**Respuesta del bot:**
```
El precio del cemento gris CSC de 42.5KG en bolívares es:

- Precio: $11.00 USD  
- En Bs: Bs 8,624.40 (tasa BCV × precio + 40% recargo)  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado · Precio en Bs incluido · +40% recargo mencionado

---

### ✅ PASS `C05` — ortografia
**Pregunta del cliente:** "simento gris precio?"

**Respuesta del bot:**
```
El precio del cemento gris CSC de 42.5KG es:

🔧 *CEMENTO GRIS CSC 42.5KG* — $11.00 USD · Stock: 555  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ❌ FAIL `N01` — exacto
**Pregunta del cliente:** "venden clavos? a cuanto estan?"

**Respuesta del bot:**
```
¡Hola! Bienvenido a Ferretería El Serrucho. ¿En qué puedo ayudarte hoy? Si buscas algún producto en particular, no dudes en decírmelo. 🛠️
```

**✗ Problemas:** No mencionó "CLAVOS" · No mostró precio correcto ($2)

---

### ✅ PASS `N02` — coloquial
**Pregunta del cliente:** "necesito clavo para madera"

**Respuesta del bot:**
```
Tenemos clavos que pueden servir para madera:

🔧 *CLAVOS* — $2.00 USD · Stock: 747  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `N03` — bs
**Pregunta del cliente:** "cuanto cuestan los clavos en bs?"

**Respuesta del bot:**
```
El precio de los clavos en bolívares es:

- Precio: $2.00 USD  
- En Bs: Bs 1,585.84 (tasa BCV × precio + 40% recargo)  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado · Precio en Bs incluido · +40% recargo mencionado

---

### ✅ PASS `K01` — exacto
**Pregunta del cliente:** "tienen cabilla 12mm?"

**Respuesta del bot:**
```
Sí, tenemos cabilla de 12mm disponible:

🔧 *CABILLA ESTRIADA 12MMX12MTS* — $16.50 USD · Stock: 1  

Si deseas realizar un pedido o necesitas más información, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `K02` — coloquial
**Pregunta del cliente:** "cuanto vale la cabilla?"

**Respuesta del bot:**
```
El precio de la cabilla estriada de 12mm es:

🔧 *CABILLA ESTRIADA 12MMX12MTS* — $16.50 USD · Stock: 1  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `K03` — parcial
**Pregunta del cliente:** "precio cabilla corrugada"

**Respuesta del bot:**
```
No tenemos cabilla corrugada específicamente, pero sí contamos con cabilla estriada:

🔧 *CABILLA ESTRIADA 12MMX12MTS* — $16.50 USD · Stock: 1  

Si deseas más información o realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ❌ FAIL `T01` — exacto
**Pregunta del cliente:** "precio tubo herreria 2x1?"

**Respuesta del bot:**
```
Tenemos disponible el tubo de herrería de 2x1:

🔧 *TUBO HERRERIA 2X1 1.4MM 6 MTS* — $16.50 USD · Stock: 27  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado

**✗ Problemas:** No mostró precio correcto ($10)

---

### ❌ FAIL `T02` — coloquial
**Pregunta del cliente:** "tienen tubo cuadrado 2x1 de 6 metros?"

**Respuesta del bot:**
```
No tenemos tubo cuadrado de 2x1, pero sí contamos con el tubo de herrería de 2x1:

🔧 *TUBO HERRERIA 2X1 1.4MM 6 MTS* — $16.50 USD · Stock: 27  

Si deseas más información o realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado

**✗ Problemas:** No mostró precio correcto ($10)

---

### ❌ FAIL `T03` — parcial
**Pregunta del cliente:** "tubo metalico 6 metros"

**Respuesta del bot:**
```
Aquí tienes algunas opciones de tubos metálicos de 6 metros:

🔧 *TUBO HERRERIA 3 X 1 X 0.90MM X 6 MTS* — $14.50 USD · Stock: 84  
🔧 *TUBO HERRERIA 2X1 1.4MM 6 MTS* — $16.50 USD · Stock: 27  
🔧 *TUBO HERRERIA 1 X 1/2 X 0.90 MM X 6 MTS* — $6.00 USD · Stock: 70  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado

**✗ Problemas:** No mostró precio correcto ($10)

---

### ✅ PASS `E01` — exacto
**Pregunta del cliente:** "hay cerchas de 10 de ancho?"

**Respuesta del bot:**
```
Sí, tenemos cerchas de 10 de ancho:

🔧 *CERCHA DE 10X6MTS* — $11.00 USD · Stock: 57  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `E02` — coloquial
**Pregunta del cliente:** "cuanto sale una cercha?"

**Respuesta del bot:**
```
La cercha de 10x6 mts cuesta $11.00 USD.  

Si deseas realizar un pedido o necesitas más información, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `A01` — exacto
**Pregunta del cliente:** "alambron 5mm precio?"

**Respuesta del bot:**
```
Tenemos disponible el alambrón de 5mm:

🔧 *ALAMBRON ESTRIADO 5MM X 6MTS* — $2.00 USD · Stock: 284  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ❌ FAIL `A02` — coloquial
**Pregunta del cliente:** "tienen alambre de construccion?"

**Respuesta del bot:**
```
No tenemos alambre de construcción específicamente, pero tenemos un producto relacionado:

🔧 *CEPILLO DE ALAMBRE NEGRO* — $1.50 USD · Stock: 15  

Si necesitas más información o deseas buscar otro producto, ¡házmelo saber! 🛠️
```

**✗ Problemas:** No mencionó "ALAMBRON" · No mostró precio correcto ($2)

---

### ❌ FAIL `Z01` — exacto
**Pregunta del cliente:** "láminas de zinc azul 12 pies?"

**Respuesta del bot:**
```
Aquí tienes las láminas de zinc azul de 12 pies:

🔧 *LAMINA DE ZINC 0.20 X 0.80 12 PIES X3.66 MTS IMPORT* — $8.50 USD · Stock: 154  
🔧 *LAMINA DE ZINC 0.25 X 0.80 12 PIES X3.66 MTS IMPORT* — $9.50 USD · Stock: 1  

Si deseas más información o realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado

**✗ Problemas:** No mostró precio correcto ($10.5)

---

### ❌ FAIL `Z02` — coloquial
**Pregunta del cliente:** "cuanto cuesta una lamina de techo?"

**Respuesta del bot:**
```
La lámina de zinc de 12 pies tiene los siguientes precios:

🔧 *LAMINA DE ZINC 0.20 X 0.80 12 PIES X3.66 MTS IMPORT* — $8.50 USD  
🔧 *LAMINA DE ZINC 0.25 X 0.80 12 PIES X3.66 MTS IMPORT* — $9.50 USD  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado

**✗ Problemas:** No mostró precio correcto ($10.5)

---

### ❌ FAIL `Z03` — bs
**Pregunta del cliente:** "las laminas de zinc cuanto salen en bolivares?"

**Respuesta del bot:**
```
Los precios de las láminas de zinc en bolívares son los siguientes:

🔧 *LAMINA DE ZINC 0.20 X 0.80 12 PIES X3.66 MTS IMPORT*  
Precio: $8.50 USD · En Bs: Bs 6,413.63 (tasa BCV × precio + 40% recargo)  

🔧 *LAMINA DE ZINC 0.25 X 0.80 12 PIES X3.66 MTS IMPORT*  
Precio: $9.50 USD · En Bs: Bs 7,086.49 (tasa BCV × precio + 40% recargo)  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio en Bs incluido · +40% recargo mencionado

**✗ Problemas:** No mostró precio correcto ($10.5)

---

### ✅ PASS `D01` — exacto
**Pregunta del cliente:** "tienen disco de corte 4 y medio?"

**Respuesta del bot:**
```
Tenemos disponibles los siguientes discos de corte de 4 y medio:

🔧 *DISCO D/CORTE 4.5 INOX WF-INOX-4.5* — $1.00 USD · Stock: 93  
🔧 *DISCO WOLFGANG DE CORTE 4.5 INOX* — $1.00 USD · Stock: 28  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `D02` — coloquial
**Pregunta del cliente:** "necesito un disco para cortar hierro, cuanto esta?"

**Respuesta del bot:**
```
Para cortar hierro, tenemos el siguiente disco:

🔧 *DISCO D/CORTE 4.5 INOX WF-INOX-4.5* — $1.00 USD · Stock: 93  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `W01` — exacto
**Pregunta del cliente:** "alambre negro 700 gramos precio"

**Respuesta del bot:**
```
Tenemos disponible el alambre negro de 700 gramos:

🔧 *ALAMBRE GH 700GR* — $2.50 USD · Stock: 168  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `P01` — exacto
**Pregunta del cliente:** "codo pvc 1/2 cuanto vale?"

**Respuesta del bot:**
```
Tenemos disponible el codo PVC de 1/2:

🔧 *CODO 90° CON ROSCA PVC AF 1/2* — $0.50 USD · Stock: 70  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `P02` — coloquial
**Pregunta del cliente:** "necesito un codo de media pulgada para agua fría"

**Respuesta del bot:**
```
Para agua fría, tenemos el siguiente codo de media pulgada:

🔧 *CODO 90° CON ROSCA PVC AF 1/2* — $0.50 USD · Stock: 70  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto mencionado · Precio correcto mencionado

---

### ✅ PASS `M01` — multi
**Pregunta del cliente:** "necesito cemento y cabilla 12mm, cuanto tendría que pagar por los dos?"

**Respuesta del bot:**
```
Aquí tienes los precios del cemento y la cabilla de 12mm:

🔧 *CEMENTO GRIS CSC 42.5KG* — $11.00 USD  
🔧 *CABILLA ESTRIADA 12MMX12MTS* — $16.50 USD  

**Total a pagar:** $27.50 USD  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Producto "CEMENTO" mencionado · Producto "CABILLA" mencionado

---

### ❌ FAIL `X01` — sin_stock
**Pregunta del cliente:** "tienen lavadoras o neveras?"

**Respuesta del bot:**
```
No tenemos lavadoras ni neveras disponibles, pero sí contamos con algunos accesorios relacionados:

🔧 *MANGUERA PARA LAVADORA GRIVEN* — $6.75 USD · Stock: 4  
🔧 *MANGUERA PARA LAVADORA* — $2.00 USD · Stock: 2  

Y para neveras, tenemos protectores de voltaje:

🔧 *PROTECTOR VOLTAJE NEVERA 120V 15A LUMINART* — $12.00 USD · Stock: 1  
🔧 *PROTECTOR DE VOLTAJE P/REFRIG Y NEVERAS VITRON* — $10.00 USD · Stock: 6  
🔧 *PROTECTOR DE NEVERA TROEN TR-VP10-120V* — $9.50 USD · Stock: 2  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Indicó que no hay producto

**✗ Problemas:** Mencionó precio cuando no debía

---

### ❌ FAIL `X02` — fuera_catalogo
**Pregunta del cliente:** "venden pintura epóxica para pisos?"

**Respuesta del bot:**
```
No tenemos pintura epóxica específica para pisos, pero tenemos la siguiente pintura:

🔧 *PINTURA EVERY E317 OCRE* — $37.50 USD · Stock: 4  

Si necesitas más información o deseas realizar un pedido, ¡házmelo saber! 🛠️
```

**✓ Correcto:** Indicó que no hay producto

**✗ Problemas:** Mencionó precio cuando no debía

---

## Plan de mejora detallado

### Problemas encontrados y soluciones

#### **Búsqueda exacta falla:** La función `buscar_productos` (RPC PostgreSQL) no devuelve el producto por nombre exacto. → Verificar que la función RPC hace búsqueda `ILIKE %término%` y no solo full-text; considerar agregar `ts_rank` con tokenización en español.

#### **Términos coloquiales no resueltos:** El cliente dice "saco de cemento" y el bot no lo mapea. → Añadir un diccionario de sinónimos en el código de la herramienta (cemento→saco, cabilla→hierro/varilla, etc.) o ampliar el prompt del AI Agent con ejemplos de vocabulario ferretero venezolano.

#### **Búsqueda parcial falla:** El término parcial no activa resultados. → Refinar la función RPC para dividir el término en tokens y hacer OR entre ellos.

#### **Precio en Bs incorrecto o faltante:** El bot no aplica +40% o no muestra el cálculo. → Reforzar instrucción en el prompt y agregar lógica explícita de cálculo en la herramienta BCV.

#### **Manejo de sin-stock:** El bot menciona productos agotados o no ofrece alternativas. → El filtro en buscar_productos_tool (existencia>0) debe ser más agresivo; si no hay resultados con stock, retornar mensaje de "no hay stock".

#### **Producto fuera de catálogo:** El bot no dice claramente que no lo tiene. → Ajustar el fallback del prompt para que sea más directo al decir que no maneja ese tipo de producto.

### Roadmap de mejoras (por prioridad)

| Prioridad | Mejora | Impacto | Esfuerzo |
|---|---|---|---|
| 🔴 Alta | Sinónimos ferreteros venezolanos en prompt/herramienta | Alto | Bajo |
| 🔴 Alta | Trigram search (`pg_trgm`) en Supabase para errores ortográficos | Alto | Medio |
| 🔴 Alta | Recargo +40% Bs: verificar que el cálculo se muestre siempre | Alto | Bajo |
| 🟡 Media | Búsqueda multi-token OR en la RPC `buscar_productos` | Medio | Medio |
| 🟡 Media | Multi-producto: prompt para llamar herramienta 2x | Medio | Bajo |
| 🟢 Baja | Cache de top-20 vendidos en Engram para respuesta rápida | Bajo | Bajo |

### Próximos pasos concretos

1. **Crear función RPC mejorada** en Supabase que use `pg_trgm` + sinónimos.
2. **Ampliar diccionario** en `buscar_productos_tool`: mapear términos coloquiales antes de llamar a Supabase.
3. **Test de regresión**: re-correr este estudio tras cada mejora y comparar las tasas.
4. **Engram**: sembrar los 20 más vendidos como memorias de "productos estrella" para que el bot los recuerde sin consultar BD.

---
*Generado automáticamente por `_estudio_agente.js` — 2026-06-05T22:04:02.333Z*
