

---

## Corrida #1 — 5/6/2026, 9:45:27 p. m. — Tasa: 90% (28/31)

| ID | Tipo | Pregunta | Veredicto | Problemas |
|---|---|---|---|---|
| C01 | exacto | tienen cemento gris csc? | ✅ PASS | — |
| C02 | coloquial | cuanto vale un saco de cemento? | ✅ PASS | — |
| C03 | parcial | precio del cemento 42 kilos | ✅ PASS | — |
| C04 | bs | cuanto sale el cemento en bolivares? | ❌ FAIL | No mostró recargo 40% claramente |
| C05 | ortografia | simento gris precio? | ✅ PASS | — |
| N01 | exacto | venden clavos? a cuanto estan? | ✅ PASS | — |
| N02 | coloquial | necesito clavo para madera | ✅ PASS | — |
| N03 | bs | cuanto cuestan los clavos en bs? | ✅ PASS | — |
| K01 | exacto | tienen cabilla 12mm? | ✅ PASS | — |
| K02 | coloquial | cuanto vale la cabilla? | ✅ PASS | — |
| K03 | sinonimo | precio cabilla corrugada o estriada | ✅ PASS | — |
| T01 | exacto | precio tubo herreria 2x1? | ✅ PASS | — |
| T02 | coloquial | tienen tubo cuadrado 2x1 de 6 metros? | ✅ PASS | — |
| T03 | parcial | tubo metalico 6 metros | ✅ PASS | — |
| E01 | exacto | hay cerchas de 10 de ancho? | ✅ PASS | — |
| E02 | coloquial | cuanto sale una cercha? | ✅ PASS | — |
| A01 | exacto | alambron 5mm precio? | ✅ PASS | — |
| A02 | sinonimo | tienen alambre de construccion? | ✅ PASS | — |
| Z01 | exacto | laminas de zinc azul 12 pies? | ✅ PASS | — |
| Z02 | coloquial | cuanto cuesta una lamina de techo? | ✅ PASS | — |
| Z03 | bs | las laminas de zinc cuanto salen en bolivares? | ❌ FAIL | No mostró recargo 40% claramente |
| D01 | exacto | tienen disco de corte 4 y medio? | ✅ PASS | — |
| D02 | coloquial | necesito un disco para cortar hierro, cuanto esta? | ✅ PASS | — |
| W01 | exacto | alambre negro 700 gramos precio | ✅ PASS | — |
| P01 | exacto | codo pvc 1/2 cuanto vale? | ✅ PASS | — |
| P02 | coloquial | necesito un codo de media pulgada para agua fria | ✅ PASS | — |
| Q01 | presupuesto | necesito 5 sacos de cemento y 4 cabillas de 12mm, dame el precio total | ✅ PASS | — |
| Q02 | presupuesto | cuanto me sale: 10 tubos herreria 2x1 y 20 laminas de zinc azul? | ✅ PASS | — |
| Q03 | presupuesto_bs | dame presupuesto de 3 sacos de cemento en bolivares | ✅ PASS | — |
| X01 | sin_catalogo | tienen lavadoras o neveras? | ❌ FAIL | Mostró precio para producto que no corresponde |
| X02 | sin_catalogo | venden computadoras o celulares? | ✅ PASS | — |

### Detalles de fallos

#### ❌ C04 (bs)
**Pregunta:** "cuanto sale el cemento en bolivares?"

**Respuesta:**
```
Parece que hubo un problema al intentar obtener la tasa de cambio. Sin embargo, el precio del cemento gris CSC de 42.5KG es de $11.00 USD. 

Si tienes la tasa de cambio actual, puedo ayudarte a calcular el precio en bolívares. Si no, puedo intentar obtener la tasa nuevamente. ¿Te gustaría que lo intentara? 🛠️
```

**Tools:** obtener_tasa_bcv_tool: {"response":"There was an error: \"process is not defined [line 5]\""}

**Problemas:** No mostró recargo 40% claramente


#### ❌ Z03 (bs)
**Pregunta:** "las laminas de zinc cuanto salen en bolivares?"

**Respuesta:**
```
Parece que hubo un problema al intentar obtener la tasa de cambio. Sin embargo, puedo proporcionarte los precios de las láminas de zinc en dólares. Si deseas, puedo intentar nuevamente obtener la tasa de cambio para convertir los precios a bolívares. ¿Te gustaría que lo haga?
```

**Tools:** obtener_tasa_bcv_tool: {"response":"There was an error: \"process is not defined [line 5]\""}

**Problemas:** No mostró recargo 40% claramente


#### ❌ X01 (sin_catalogo)
**Pregunta:** "tienen lavadoras o neveras?"

**Respuesta:**
```
No contamos con lavadoras, pero aquí tienes algunas opciones relacionadas:

🔧 *CONEXION P/LAVADORA METAL Y 1/2 F-282* — $3.00 USD · Stock: 3  
🔧 *HIDRO LAVADORA ALTA PRESION 1800W COVO* — $145.00 USD · Stock: 1  
🔧 *HIDROLAVADORA 1200W 1100PSI 110V DIESEL TOOLS* — $90.00 USD · Stock: 1  
🔧 *MANGUERA PARA LAVADORA GRIVEN* — $6.75 USD · Stock: 4  

En cuanto a neveras, tenemos algunos protectores de voltaje:

🔧 *PROTECTOR VOLTAJE NEVERA 120V 15A LUMINART* — $12.00 USD · Stock: 1  
🔧 *PROTECT
```

**Tools:** buscar_productos_tool: {"response":"[{\"nombre\":\"CONEXION P/LAVADORA METAL Y 1/2 F-282\",\"precio_usd\":3,\"existencia\":3,\"vendidos\":3},{\

**Problemas:** Mostró precio para producto que no corresponde


### Por tipo
| Tipo | PASS | FAIL |
|---|---|---|
| exacto | 10 | 0 |
| coloquial | 8 | 0 |
| parcial | 2 | 0 |
| bs | 1 | 2 |
| ortografia | 1 | 0 |
| sinonimo | 2 | 0 |
| presupuesto | 2 | 0 |
| presupuesto_bs | 1 | 0 |
| sin_catalogo | 1 | 1 |

### Plan de mejora — Corrida #1
- **Precio en Bs incorrecto:** Verificar que obtener_tasa_bcv_tool responde y que el prompt aplica la fórmula precio_usd × 1.40 × tasa_bcv.
- **Producto fuera de catálogo mal manejado:** El bot encontró un producto relacionado y lo mostró en vez de decir que no lo tiene. Agregar al prompt: lista de categorías que NO maneja la ferretería (electrodomésticos, electrónica, ropa).

---

## Corrida #2 — 5/6/2026, 9:58:42 p. m. — Tasa: 94% (29/31)

| ID | Tipo | Pregunta | Veredicto | Problemas |
|---|---|---|---|---|
| C01 | exacto | tienen cemento gris csc? | ✅ PASS | — |
| C02 | coloquial | cuanto vale un saco de cemento? | ✅ PASS | — |
| C03 | parcial | precio del cemento 42 kilos | ✅ PASS | — |
| C04 | bs | cuanto sale el cemento en bolivares? | ✅ PASS | — |
| C05 | ortografia | simento gris precio? | ✅ PASS | — |
| N01 | exacto | venden clavos? a cuanto estan? | ✅ PASS | — |
| N02 | coloquial | necesito clavo para madera | ✅ PASS | — |
| N03 | bs | cuanto cuestan los clavos en bs? | ✅ PASS | — |
| K01 | exacto | tienen cabilla 12mm? | ✅ PASS | — |
| K02 | coloquial | cuanto vale la cabilla? | ✅ PASS | — |
| K03 | sinonimo | precio cabilla corrugada o estriada | ✅ PASS | — |
| T01 | exacto | precio tubo herreria 2x1? | ✅ PASS | — |
| T02 | coloquial | tienen tubo cuadrado 2x1 de 6 metros? | ✅ PASS | — |
| T03 | parcial | tubo metalico 6 metros | ✅ PASS | — |
| E01 | exacto | hay cerchas de 10 de ancho? | ✅ PASS | — |
| E02 | coloquial | cuanto sale una cercha? | ✅ PASS | — |
| A01 | exacto | alambron 5mm precio? | ✅ PASS | — |
| A02 | sinonimo | tienen alambre de construccion? | ✅ PASS | — |
| Z01 | exacto | laminas de zinc azul 12 pies? | ✅ PASS | — |
| Z02 | coloquial | cuanto cuesta una lamina de techo? | ✅ PASS | — |
| Z03 | bs | las laminas de zinc cuanto salen en bolivares? | ✅ PASS | — |
| D01 | exacto | tienen disco de corte 4 y medio? | ✅ PASS | — |
| D02 | coloquial | necesito un disco para cortar hierro, cuanto esta? | ✅ PASS | — |
| W01 | exacto | alambre negro 700 gramos precio | ✅ PASS | — |
| P01 | exacto | codo pvc 1/2 cuanto vale? | ✅ PASS | — |
| P02 | coloquial | necesito un codo de media pulgada para agua fria | ✅ PASS | — |
| Q01 | presupuesto | necesito 5 sacos de cemento y 4 cabillas de 12mm, dame el precio total | ✅ PASS | — |
| Q02 | presupuesto | cuanto me sale: 10 tubos herreria 2x1 y 20 laminas de zinc azul? | ✅ PASS | — |
| Q03 | presupuesto_bs | dame presupuesto de 3 sacos de cemento en bolivares | ✅ PASS | — |
| X01 | sin_catalogo | tienen lavadoras o neveras? | ❌ FAIL | Debió decir que no tiene ese producto |
| X02 | sin_catalogo | venden computadoras o celulares? | ❌ FAIL | Debió decir que no tiene ese producto |

### Detalles de fallos

#### ❌ X01 (sin_catalogo)
**Pregunta:** "tienen lavadoras o neveras?"

**Respuesta:**
```
En Ferretería El Serrucho nos especializamos en materiales de construcción, herramientas y plomería. No manejamos lavadoras ni neveras. ¿Puedo ayudarte con algo de ferretería? 🛠️
```

**Problemas:** Debió decir que no tiene ese producto


#### ❌ X02 (sin_catalogo)
**Pregunta:** "venden computadoras o celulares?"

**Respuesta:**
```
En Ferretería El Serrucho nos especializamos en materiales de construcción, herramientas y plomería. No manejamos computadoras ni celulares. ¿Puedo ayudarte con algo de ferretería? 🛠️
```

**Problemas:** Debió decir que no tiene ese producto


### Por tipo
| Tipo | PASS | FAIL |
|---|---|---|
| exacto | 10 | 0 |
| coloquial | 8 | 0 |
| parcial | 2 | 0 |
| bs | 3 | 0 |
| ortografia | 1 | 0 |
| sinonimo | 2 | 0 |
| presupuesto | 2 | 0 |
| presupuesto_bs | 1 | 0 |
| sin_catalogo | 0 | 2 |

### Plan de mejora — Corrida #2
- **Producto fuera de catálogo mal manejado:** El bot encontró un producto relacionado y lo mostró en vez de decir que no lo tiene. Agregar al prompt: lista de categorías que NO maneja la ferretería (electrodomésticos, electrónica, ropa).

---

## Corrida #3 — 6/6/2026, 1:29:53 a. m. — Tasa: 86% (43/50) [Prueba Real a 584227898847@c.us]

| ID | Tipo | Pregunta | Veredicto | Problemas |
|---|---|---|---|---|
| 1 | cemento | tienen saco de cemento gris? | ✅ PASS | — |
| 2 | cemento | precio de cemento blanco | ✅ PASS | — |
| 3 | cabilla | cuanto vale una cabilla de media? | ✅ PASS | — |
| 4 | cabilla | tienen cabilla de 10mm? | ✅ PASS | — |
| 5 | cabilla | precio de varilla estriada de 12 | ✅ PASS | — |
| 6 | tubo | precio de tubo de herreria 2x1? | ✅ PASS | — |
| 7 | tubo | venden tubo de agua negra? | ❌ FAIL | No mencionó: tubo/agua |
| 8 | pvc | codo pvc de 1/2 a como sale? | ✅ PASS | — |
| 9 | pvc | necesito codo para agua fria de media | ✅ PASS | — |
| 10 | pvc | tienen valvula pvc de media? | ✅ PASS | — |
| 11 | construccion | precio de teflon de media | ✅ PASS | — |
| 12 | construccion | tienen malla pollito? | ❌ FAIL | No mencionó: malla/pollito |
| 13 | construccion | venden gato hidraulico? | ✅ PASS | — |
| 14 | construccion | precio de brocha de una pulgada | ✅ PASS | — |
| 15 | electricidad | curva electrica de media | ✅ PASS | — |
| 16 | manguera | tienen manguera de gas negra? | ❌ FAIL | No mencionó: manguera/gas |
| 17 | electricidad | precio de tomacorriente doble | ✅ PASS | — |
| 18 | electricidad | cajera octagonal de plastico | ✅ PASS | — |
| 19 | electricidad | tapa ciega de marfil | ✅ PASS | — |
| 20 | herramientas | mecha para metal de un octavo | ✅ PASS | — |
| 21 | plomeria | niple galvanizado de media por dos | ✅ PASS | — |
| 22 | herramientas | cepillo de alambre circular | ✅ PASS | — |
| 23 | herramientas | tienen machete bellota? | ✅ PASS | — |
| 24 | herramientas | cuanto sale un alicate de presion? | ✅ PASS | — |
| 25 | pintura | pintura aerosol blanca | ✅ PASS | — |
| 26 | pintura | tienen spray plata? | ✅ PASS | — |
| 27 | pintura | precio de spray neon verde | ✅ PASS | — |
| 28 | electricidad | breaker de 2x50 | ✅ PASS | — |
| 29 | herramientas | disco de corte 4 y medio | ✅ PASS | — |
| 30 | electricidad | venden regleta de 6 tomas? | ✅ PASS | — |
| 31 | herramientas | mecha de un cuarto para hierro | ✅ PASS | — |
| 32 | construccion | grifo para termo precio | ✅ PASS | — |
| 33 | bisagra | tienen bisagra de 4x4? | ✅ PASS | — |
| 34 | herramientas | precio de pistola de calor | ✅ PASS | — |
| 35 | pilas | venden baterias aa? | ✅ PASS | — |
| 36 | pilas | baterias aaa precio | ✅ PASS | — |
| 37 | bisagra | bisagra para soldar | ✅ PASS | — |
| 38 | herramientas | pistola de silicon gruesa | ✅ PASS | — |
| 39 | construccion | precio de cinta doble faz | ✅ PASS | — |
| 40 | seguridad | tienen faja lumbar l? | ❌ FAIL | No mencionó: faja/lumbar |
| 41 | plomeria | llave de paso de bola de tres cuartos | ✅ PASS | — |
| 42 | herramientas | cadena para motosierra | ✅ PASS | — |
| 43 | pesca | nylon de pescar | ❌ FAIL | No mencionó: nylon |
| 44 | construccion | flotador electrico | ❌ FAIL | No mencionó: flotador |
| 45 | electricidad | tablero de 6 circuitos | ✅ PASS | — |
| 46 | electricidad | enchufe amarillo | ✅ PASS | — |
| 47 | pvc | manguera culebra | ✅ PASS | — |
| 48 | laminas | cuanto cuestan las laminas de zinc? | ✅ PASS | — |
| 49 | sin_catalogo | tienen tepe negro? | ❌ FAIL | Debió indicar no tener ese producto |
| 50 | sin_catalogo | venden lavadora o secadora? | ✅ PASS | — |

### Detalles de fallos

#### ❌ 7 (tubo)
**Pregunta:** "venden tubo de agua negra?"

**Respuesta:**
```
En *El Serrucho* nos especializamos en materiales de construcción, herramientas y plomería. No manejamos eso 🙏. ¿Puedo ayudarte con algo de ferretería? 👨🏻‍🔧
```

**Problemas:** No mencionó: tubo/agua


#### ❌ 12 (construccion)
**Pregunta:** "tienen malla pollito?"

**Respuesta:**
```
En *El Serrucho* nos especializamos en materiales de construcción, herramientas y plomería. No manejamos eso 🙏. ¿Puedo ayudarte con algo de ferretería? 👨🏻‍🔧
```

**Problemas:** No mencionó: malla/pollito


#### ❌ 16 (manguera)
**Pregunta:** "tienen manguera de gas negra?"

**Respuesta:**
```
En *El Serrucho* nos especializamos en materiales de construcción, herramientas y plomería. No manejamos eso 🙏. ¿Puedo ayudarte con algo de ferretería? 👨🏻‍🔧
```

**Problemas:** No mencionó: manguera/gas


#### ❌ 40 (seguridad)
**Pregunta:** "tienen faja lumbar l?"

**Respuesta:**
```
En El Serrucho nos especializamos en materiales de construcción, herramientas y plomería. No manejamos eso 🙏. ¿Puedo ayudarte con algo de ferretería? 👨🏻‍🔧
```

**Problemas:** No mencionó: faja/lumbar


#### ❌ 43 (pesca)
**Pregunta:** "nylon de pescar"

**Respuesta:**
```
En El Serrucho nos especializamos en materiales de construcción, herramientas y plomería. No manejamos eso 🙏. ¿Puedo ayudarte con algo de ferretería? 👨🏻‍🔧
```

**Problemas:** No mencionó: nylon


#### ❌ 44 (construccion)
**Pregunta:** "flotador electrico"

**Respuesta:**
```
En El Serrucho nos especializamos en materiales de construcción, herramientas y plomería. No manejamos eso 🙏. ¿Puedo ayudarte con algo de ferretería? 👨🏻‍🔧
```

**Problemas:** No mencionó: flotador


#### ❌ 49 (sin_catalogo)
**Pregunta:** "tienen tepe negro?"

**Respuesta:**
```
Aquí tienes algunas opciones de productos en color negro que tenemos disponibles:

*Cable 12AWG V-teg Negro*
Disponibilidad: ✅
Precio Divisas: 55$
Precio Bs (BCV): 77$ o 43,711.58bs

*Bisagra 3X3 Acabado Negro C/rodamientos Security*
Disponibilidad: ✅
Precio Divisas: 3$
Precio Bs (BCV): 4.20$ o 2,384.27bs

*Brocha Zasc 3 P/negro*
Disponibilidad: ✅
Precio Divisas: 1.50$
Precio Bs (BCV): 2.10$ o 1,192.13bs

*Cable 10 AWG V-teg Negro*
Disponibilidad: ✅
Precio Divisas: 97.50$
Precio Bs (BCV): 136.50$ o 77,488.70bs

Si necesitas más información o deseas realizar un pedido, ¡estoy aquí para ayudarte! 👨🏻‍🔧🪚
```

**Tools:** buscar_productos_tool: {"response":"{\"encontrados\":4,\"tasa_bcv\":567.6828,\"productos\":[{\"nombre\":\"Cable 12AWG V-teg

**Problemas:** Debió indicar no tener ese producto


---

## Corrida #4 — 6/6/2026, 1:58:15 a. m. — Tasa: 98% (49/50) [Prueba Real a 584227898847@c.us]

| ID | Tipo | Pregunta | Veredicto | Problemas |
|---|---|---|---|---|
| 1 | cemento | tienen saco de cemento gris? | ✅ PASS | — |
| 2 | cemento | precio de cemento blanco | ✅ PASS | — |
| 3 | cabilla | cuanto vale una cabilla de media? | ✅ PASS | — |
| 4 | cabilla | tienen cabilla de 10mm? | ✅ PASS | — |
| 5 | cabilla | precio de varilla estriada de 12 | ✅ PASS | — |
| 6 | tubo | precio de tubo de herreria 2x1? | ✅ PASS | — |
| 7 | tubo | venden tubo de agua negra? | ✅ PASS | — |
| 8 | pvc | codo pvc de 1/2 a como sale? | ✅ PASS | — |
| 9 | pvc | necesito codo para agua fria de media | ✅ PASS | — |
| 10 | pvc | tienen valvula pvc de media? | ✅ PASS | — |
| 11 | construccion | precio de teflon de media | ✅ PASS | — |
| 12 | construccion | tienen malla pollito? | ✅ PASS | — |
| 13 | construccion | venden gato hidraulico? | ✅ PASS | — |
| 14 | construccion | precio de brocha de una pulgada | ✅ PASS | — |
| 15 | electricidad | curva electrica de media | ✅ PASS | — |
| 16 | manguera | tienen manguera de gas negra? | ✅ PASS | — |
| 17 | electricidad | precio de tomacorriente doble | ✅ PASS | — |
| 18 | electricidad | cajera octagonal de plastico | ✅ PASS | — |
| 19 | electricidad | tapa ciega de marfil | ✅ PASS | — |
| 20 | herramientas | mecha para metal de un octavo | ✅ PASS | — |
| 21 | plomeria | niple galvanizado de media por dos | ✅ PASS | — |
| 22 | herramientas | cepillo de alambre circular | ✅ PASS | — |
| 23 | herramientas | tienen machete bellota? | ✅ PASS | — |
| 24 | herramientas | cuanto sale un alicate de presion? | ✅ PASS | — |
| 25 | pintura | pintura aerosol blanca | ✅ PASS | — |
| 26 | pintura | tienen spray plata? | ✅ PASS | — |
| 27 | pintura | precio de spray neon verde | ✅ PASS | — |
| 28 | electricidad | breaker de 2x50 | ✅ PASS | — |
| 29 | herramientas | disco de corte 4 y medio | ✅ PASS | — |
| 30 | electricidad | venden regleta de 6 tomas? | ✅ PASS | — |
| 31 | herramientas | mecha de un cuarto para hierro | ✅ PASS | — |
| 32 | construccion | grifo para termo precio | ✅ PASS | — |
| 33 | bisagra | tienen bisagra de 4x4? | ✅ PASS | — |
| 34 | herramientas | precio de pistola de calor | ✅ PASS | — |
| 35 | pilas | venden baterias aa? | ✅ PASS | — |
| 36 | pilas | baterias aaa precio | ✅ PASS | — |
| 37 | bisagra | bisagra para soldar | ✅ PASS | — |
| 38 | herramientas | pistola de silicon gruesa | ✅ PASS | — |
| 39 | construccion | precio de cinta doble faz | ✅ PASS | — |
| 40 | seguridad | tienen faja lumbar l? | ✅ PASS | — |
| 41 | plomeria | llave de paso de bola de tres cuartos | ✅ PASS | — |
| 42 | herramientas | cadena para motosierra | ✅ PASS | — |
| 43 | pesca | nylon de pescar | ✅ PASS | — |
| 44 | construccion | flotador electrico | ✅ PASS | — |
| 45 | electricidad | tablero de 6 circuitos | ✅ PASS | — |
| 46 | electricidad | enchufe amarillo | ✅ PASS | — |
| 47 | pvc | manguera culebra | ✅ PASS | — |
| 48 | laminas | cuanto cuestan las laminas de zinc? | ✅ PASS | — |
| 49 | sin_catalogo | tienen tepe negro? | ❌ FAIL | Debió indicar no tener ese producto |
| 50 | sin_catalogo | venden lavadora o secadora? | ✅ PASS | — |

### Detalles de fallos

#### ❌ 49 (sin_catalogo)
**Pregunta:** "tienen tepe negro?"

**Respuesta:**
```
Aquí tienes algunas opciones de teipe negro que tenemos disponibles:

* Teipe Temflex 165 Cinta Electrica 3M  
Disponibilidad: ✅  
Precio Divisas: 2.50$  
Precio Bs (BCV): 3.50$ o 1,986.89bs  

* Teipe Cobra X 18MTS Original  
Disponibilidad: ✅  
Precio Divisas: 2$  
Precio Bs (BCV): 2.80$ o 1,589.51bs  

* Teipe Selra BOX USA 10MT  
Disponibilidad: ✅  
Precio Divisas: 1$  
Precio Bs (BCV): 1.40$ o 794.76bs  

* Teipe Selra BOX USA 18MT  
Disponibilidad: ✅  
Precio Divisas: 1.50$  
Precio Bs (BCV): 2.10$ o 1,192.13bs  

¿Te gusta alguna de estas opciones o prefieres que un empleado experto te ayude mejor? 👨🏻‍🔧
```

**Tools:** buscar_productos_tool: {"response":"{\"encontrados\":4,\"tasa_bcv\":567.6828,\"productos\":[{\"nombre\":\"Teipe Temflex 165

**Problemas:** Debió indicar no tener ese producto


---

## Corrida #5 — 6/6/2026, 2:18:18 a. m. — Tasa: 98% (49/50) [Prueba Real a 584227898847@c.us]

| ID | Tipo | Pregunta | Veredicto | Problemas |
|---|---|---|---|---|
| 1 | cemento | tienen saco de cemento gris? | ✅ PASS | — |
| 2 | cemento | precio de cemento blanco | ✅ PASS | — |
| 3 | cabilla | cuanto vale una cabilla de media? | ✅ PASS | — |
| 4 | cabilla | tienen cabilla de 10mm? | ✅ PASS | — |
| 5 | cabilla | precio de varilla estriada de 12 | ✅ PASS | — |
| 6 | tubo | precio de tubo de herreria 2x1? | ✅ PASS | — |
| 7 | tubo | venden tubo de agua negra? | ✅ PASS | — |
| 8 | pvc | codo pvc de 1/2 a como sale? | ❌ FAIL | No mencionó: codo/pvc |
| 9 | pvc | necesito codo para agua fria de media | ✅ PASS | — |
| 10 | pvc | tienen valvula pvc de media? | ✅ PASS | — |
| 11 | construccion | precio de teflon de media | ✅ PASS | — |
| 12 | construccion | tienen malla pollito? | ✅ PASS | — |
| 13 | construccion | venden gato hidraulico? | ✅ PASS | — |
| 14 | construccion | precio de brocha de una pulgada | ✅ PASS | — |
| 15 | electricidad | curva electrica de media | ✅ PASS | — |
| 16 | manguera | tienen manguera de gas negra? | ✅ PASS | — |
| 17 | electricidad | precio de tomacorriente doble | ✅ PASS | — |
| 18 | electricidad | cajera octagonal de plastico | ✅ PASS | — |
| 19 | electricidad | tapa ciega de marfil | ✅ PASS | — |
| 20 | herramientas | mecha para metal de un octavo | ✅ PASS | — |
| 21 | plomeria | niple galvanizado de media por dos | ✅ PASS | — |
| 22 | herramientas | cepillo de alambre circular | ✅ PASS | — |
| 23 | herramientas | tienen machete bellota? | ✅ PASS | — |
| 24 | herramientas | cuanto sale un alicate de presion? | ✅ PASS | — |
| 25 | pintura | pintura aerosol blanca | ✅ PASS | — |
| 26 | pintura | tienen spray plata? | ✅ PASS | — |
| 27 | pintura | precio de spray neon verde | ✅ PASS | — |
| 28 | electricidad | breaker de 2x50 | ✅ PASS | — |
| 29 | herramientas | disco de corte 4 y medio | ✅ PASS | — |
| 30 | electricidad | venden regleta de 6 tomas? | ✅ PASS | — |
| 31 | herramientas | mecha de un cuarto para hierro | ✅ PASS | — |
| 32 | construccion | grifo para termo precio | ✅ PASS | — |
| 33 | bisagra | tienen bisagra de 4x4? | ✅ PASS | — |
| 34 | herramientas | precio de pistola de calor | ✅ PASS | — |
| 35 | pilas | venden baterias aa? | ✅ PASS | — |
| 36 | pilas | baterias aaa precio | ✅ PASS | — |
| 37 | bisagra | bisagra para soldar | ✅ PASS | — |
| 38 | herramientas | pistola de silicon gruesa | ✅ PASS | — |
| 39 | construccion | precio de cinta doble faz | ✅ PASS | — |
| 40 | seguridad | tienen faja lumbar l? | ✅ PASS | — |
| 41 | plomeria | llave de paso de bola de tres cuartos | ✅ PASS | — |
| 42 | herramientas | cadena para motosierra | ✅ PASS | — |
| 43 | pesca | nylon de pescar | ✅ PASS | — |
| 44 | construccion | flotador electrico | ✅ PASS | — |
| 45 | electricidad | tablero de 6 circuitos | ✅ PASS | — |
| 46 | electricidad | enchufe amarillo | ✅ PASS | — |
| 47 | pvc | manguera culebra | ✅ PASS | — |
| 48 | laminas | cuanto cuestan las laminas de zinc? | ✅ PASS | — |
| 49 | sinonimo | tienen tepe negro? | ✅ PASS | — |
| 50 | sin_catalogo | venden lavadora o secadora? | ✅ PASS | — |

### Detalles de fallos

#### ❌ 8 (pvc)
**Pregunta:** "codo pvc de 1/2 a como sale?"

**Respuesta:**
```
Hola Soy *Perucho* 👨🏻‍🔧 El bot de IA experto ferretero de *El Serrucho* 🪚. ¿En qué puedo ayudarte hoy? Si buscas algún producto en particular, ¡déjamelo saber! 👀🔧
```

**Problemas:** No mencionó: codo/pvc


---

## Corrida #6 — 6/6/2026, 2:35:41 a. m. — Tasa: 100% (50/50) [Prueba Real a 584227898847@c.us]

| ID | Tipo | Pregunta | Veredicto | Problemas |
|---|---|---|---|---|
| 1 | cemento | tienen saco de cemento gris? | ✅ PASS | — |
| 2 | cemento | precio de cemento blanco | ✅ PASS | — |
| 3 | cabilla | cuanto vale una cabilla de media? | ✅ PASS | — |
| 4 | cabilla | tienen cabilla de 10mm? | ✅ PASS | — |
| 5 | cabilla | precio de varilla estriada de 12 | ✅ PASS | — |
| 6 | tubo | precio de tubo de herreria 2x1? | ✅ PASS | — |
| 7 | tubo | venden tubo de agua negra? | ✅ PASS | — |
| 8 | pvc | codo pvc de 1/2 a como sale? | ✅ PASS | — |
| 9 | pvc | necesito codo para agua fria de media | ✅ PASS | — |
| 10 | pvc | tienen valvula pvc de media? | ✅ PASS | — |
| 11 | construccion | precio de teflon de media | ✅ PASS | — |
| 12 | construccion | tienen malla pollito? | ✅ PASS | — |
| 13 | construccion | venden gato hidraulico? | ✅ PASS | — |
| 14 | construccion | precio de brocha de una pulgada | ✅ PASS | — |
| 15 | electricidad | curva electrica de media | ✅ PASS | — |
| 16 | manguera | tienen manguera de gas negra? | ✅ PASS | — |
| 17 | electricidad | precio de tomacorriente doble | ✅ PASS | — |
| 18 | electricidad | cajera octagonal de plastico | ✅ PASS | — |
| 19 | electricidad | tapa ciega de marfil | ✅ PASS | — |
| 20 | herramientas | mecha para metal de un octavo | ✅ PASS | — |
| 21 | plomeria | niple galvanizado de media por dos | ✅ PASS | — |
| 22 | herramientas | cepillo de alambre circular | ✅ PASS | — |
| 23 | herramientas | tienen machete bellota? | ✅ PASS | — |
| 24 | herramientas | cuanto sale un alicate de presion? | ✅ PASS | — |
| 25 | pintura | pintura aerosol blanca | ✅ PASS | — |
| 26 | pintura | tienen spray plata? | ✅ PASS | — |
| 27 | pintura | precio de spray neon verde | ✅ PASS | — |
| 28 | electricidad | breaker de 2x50 | ✅ PASS | — |
| 29 | herramientas | disco de corte 4 y medio | ✅ PASS | — |
| 30 | electricidad | venden regleta de 6 tomas? | ✅ PASS | — |
| 31 | herramientas | mecha de un cuarto para hierro | ✅ PASS | — |
| 32 | construccion | grifo para termo precio | ✅ PASS | — |
| 33 | bisagra | tienen bisagra de 4x4? | ✅ PASS | — |
| 34 | herramientas | precio de pistola de calor | ✅ PASS | — |
| 35 | pilas | venden baterias aa? | ✅ PASS | — |
| 36 | pilas | baterias aaa precio | ✅ PASS | — |
| 37 | bisagra | bisagra para soldar | ✅ PASS | — |
| 38 | herramientas | pistola de silicon gruesa | ✅ PASS | — |
| 39 | construccion | precio de cinta doble faz | ✅ PASS | — |
| 40 | seguridad | tienen faja lumbar l? | ✅ PASS | — |
| 41 | plomeria | llave de paso de bola de tres cuartos | ✅ PASS | — |
| 42 | herramientas | cadena para motosierra | ✅ PASS | — |
| 43 | pesca | nylon de pescar | ✅ PASS | — |
| 44 | construccion | flotador electrico | ✅ PASS | — |
| 45 | electricidad | tablero de 6 circuitos | ✅ PASS | — |
| 46 | electricidad | enchufe amarillo | ✅ PASS | — |
| 47 | pvc | manguera culebra | ✅ PASS | — |
| 48 | laminas | cuanto cuestan las laminas de zinc? | ✅ PASS | — |
| 49 | sinonimo | tienen tepe negro? | ✅ PASS | — |
| 50 | sin_catalogo | venden lavadora o secadora? | ✅ PASS | — |

---

## Corrida #7 — 6/6/2026, 8:53:03 a. m. — Tasa: 96% (48/50) [Prueba Real a 584227898847@c.us]

| ID | Tipo | Pregunta | Veredicto | Problemas |
|---|---|---|---|---|
| 1 | cemento | tienen saco de cemento gris? | ✅ PASS | — |
| 2 | cemento | precio de cemento blanco | ✅ PASS | — |
| 3 | cabilla | cuanto vale una cabilla de media? | ✅ PASS | — |
| 4 | cabilla | tienen cabilla de 10mm? | ✅ PASS | — |
| 5 | cabilla | precio de varilla estriada de 12 | ❌ FAIL | No mencionó: cabilla/12mm |
| 6 | tubo | precio de tubo de herreria 2x1? | ✅ PASS | — |
| 7 | tubo | venden tubo de agua negra? | ✅ PASS | — |
| 8 | pvc | codo pvc de 1/2 a como sale? | ✅ PASS | — |
| 9 | pvc | necesito codo para agua fria de media | ✅ PASS | — |
| 10 | pvc | tienen valvula pvc de media? | ✅ PASS | — |
| 11 | construccion | precio de teflon de media | ✅ PASS | — |
| 12 | construccion | tienen malla pollito? | ✅ PASS | — |
| 13 | construccion | venden gato hidraulico? | ✅ PASS | — |
| 14 | construccion | precio de brocha de una pulgada | ✅ PASS | — |
| 15 | electricidad | curva electrica de media | ✅ PASS | — |
| 16 | manguera | tienen manguera de gas negra? | ✅ PASS | — |
| 17 | electricidad | precio de tomacorriente doble | ✅ PASS | — |
| 18 | electricidad | cajera octagonal de plastico | ✅ PASS | — |
| 19 | electricidad | tapa ciega de marfil | ✅ PASS | — |
| 20 | herramientas | mecha para metal de un octavo | ✅ PASS | — |
| 21 | plomeria | niple galvanizado de media por dos | ✅ PASS | — |
| 22 | herramientas | cepillo de alambre circular | ✅ PASS | — |
| 23 | herramientas | tienen machete bellota? | ✅ PASS | — |
| 24 | herramientas | cuanto sale un alicate de presion? | ✅ PASS | — |
| 25 | pintura | pintura aerosol blanca | ✅ PASS | — |
| 26 | pintura | tienen spray plata? | ✅ PASS | — |
| 27 | pintura | precio de spray neon verde | ✅ PASS | — |
| 28 | electricidad | breaker de 2x50 | ✅ PASS | — |
| 29 | herramientas | disco de corte 4 y medio | ✅ PASS | — |
| 30 | electricidad | venden regleta de 6 tomas? | ✅ PASS | — |
| 31 | herramientas | mecha de un cuarto para hierro | ✅ PASS | — |
| 32 | construccion | grifo para termo precio | ✅ PASS | — |
| 33 | bisagra | tienen bisagra de 4x4? | ✅ PASS | — |
| 34 | herramientas | precio de pistola de calor | ✅ PASS | — |
| 35 | pilas | venden baterias aa? | ✅ PASS | — |
| 36 | pilas | baterias aaa precio | ✅ PASS | — |
| 37 | bisagra | bisagra para soldar | ✅ PASS | — |
| 38 | herramientas | pistola de silicon gruesa | ✅ PASS | — |
| 39 | construccion | precio de cinta doble faz | ✅ PASS | — |
| 40 | seguridad | tienen faja lumbar l? | ✅ PASS | — |
| 41 | plomeria | llave de paso de bola de tres cuartos | ✅ PASS | — |
| 42 | herramientas | cadena para motosierra | ✅ PASS | — |
| 43 | pesca | nylon de pescar | ✅ PASS | — |
| 44 | construccion | flotador electrico | ✅ PASS | — |
| 45 | electricidad | tablero de 6 circuitos | ✅ PASS | — |
| 46 | electricidad | enchufe amarillo | ✅ PASS | — |
| 47 | pvc | manguera culebra | ✅ PASS | — |
| 48 | laminas | cuanto cuestan las laminas de zinc? | ✅ PASS | — |
| 49 | sinonimo | tienen tepe negro? | ❌ FAIL | No mencionó: teipe |
| 50 | sin_catalogo | venden lavadora o secadora? | ✅ PASS | — |

### Detalles de fallos

#### ❌ 5 (cabilla)
**Pregunta:** "precio de varilla estriada de 12"

**Respuesta:**
```
Hola Soy *Perucho* 👨🏻‍🔧 El bot de IA experto ferretero de *El Serrucho* 🪚

Parece que estoy enfrentando problemas técnicos para buscar el precio de la varilla estriada de 12 en este momento. Pero no te preocupes, estoy aquí para ayudarte.

¿Te gustaría que intente buscar otro tipo de varilla o algún otro producto relacionado? 👀🔧
```

**Tools:** buscar_productos_tool: {"response":"There was an error: \"Unexpected token '{' \""}

**Problemas:** No mencionó: cabilla/12mm


#### ❌ 49 (sinonimo)
**Pregunta:** "tienen tepe negro?"

**Respuesta:**
```
Hola Soy *Perucho* 👨🏻‍🔧 El bot de IA experto ferretero de *El Serrucho* 🪚

Parece que estoy teniendo dificultades técnicas para buscar el tepe negro en este momento. Pero no te preocupes, estoy aquí para ayudarte.

¿Te gustaría que intente buscar otro tipo de material o algún otro producto relacionado? 👀🔧
```

**Tools:** buscar_productos_tool: {"response":"There was an error: \"Unexpected token '{' \""}

**Problemas:** No mencionó: teipe


---

## Corrida #8 — 6/6/2026, 9:36:55 a. m. — Tasa: 100% (50/50) [Prueba Real a 584227898847@c.us]

| ID | Tipo | Pregunta | Veredicto | Problemas |
|---|---|---|---|---|
| 1 | cemento | tienen saco de cemento gris? | ✅ PASS | — |
| 2 | cemento | precio de cemento blanco | ✅ PASS | — |
| 3 | cabilla | cuanto vale una cabilla de media? | ✅ PASS | — |
| 4 | cabilla | tienen cabilla de 10mm? | ✅ PASS | — |
| 5 | cabilla | precio de varilla estriada de 12 | ✅ PASS | — |
| 6 | tubo | precio de tubo de herreria 2x1? | ✅ PASS | — |
| 7 | tubo | venden tubo de agua negra? | ✅ PASS | — |
| 8 | pvc | codo pvc de 1/2 a como sale? | ✅ PASS | — |
| 9 | pvc | necesito codo para agua fria de media | ✅ PASS | — |
| 10 | pvc | tienen valvula pvc de media? | ✅ PASS | — |
| 11 | construccion | precio de teflon de media | ✅ PASS | — |
| 12 | construccion | tienen malla pollito? | ✅ PASS | — |
| 13 | construccion | venden gato hidraulico? | ✅ PASS | — |
| 14 | construccion | precio de brocha de una pulgada | ✅ PASS | — |
| 15 | electricidad | curva electrica de media | ✅ PASS | — |
| 16 | manguera | tienen manguera de gas negra? | ✅ PASS | — |
| 17 | electricidad | precio de tomacorriente doble | ✅ PASS | — |
| 18 | electricidad | cajera octagonal de plastico | ✅ PASS | — |
| 19 | electricidad | tapa ciega de marfil | ✅ PASS | — |
| 20 | herramientas | mecha para metal de un octavo | ✅ PASS | — |
| 21 | plomeria | niple galvanizado de media por dos | ✅ PASS | — |
| 22 | herramientas | cepillo de alambre circular | ✅ PASS | — |
| 23 | herramientas | tienen machete bellota? | ✅ PASS | — |
| 24 | herramientas | cuanto sale un alicate de presion? | ✅ PASS | — |
| 25 | pintura | pintura aerosol blanca | ✅ PASS | — |
| 26 | pintura | tienen spray plata? | ✅ PASS | — |
| 27 | pintura | precio de spray neon verde | ✅ PASS | — |
| 28 | electricidad | breaker de 2x50 | ✅ PASS | — |
| 29 | herramientas | disco de corte 4 y medio | ✅ PASS | — |
| 30 | electricidad | venden regleta de 6 tomas? | ✅ PASS | — |
| 31 | herramientas | mecha de un cuarto para hierro | ✅ PASS | — |
| 32 | construccion | grifo para termo precio | ✅ PASS | — |
| 33 | bisagra | tienen bisagra de 4x4? | ✅ PASS | — |
| 34 | herramientas | precio de pistola de calor | ✅ PASS | — |
| 35 | pilas | venden baterias aa? | ✅ PASS | — |
| 36 | pilas | baterias aaa precio | ✅ PASS | — |
| 37 | bisagra | bisagra para soldar | ✅ PASS | — |
| 38 | herramientas | pistola de silicon gruesa | ✅ PASS | — |
| 39 | construccion | precio de cinta doble faz | ✅ PASS | — |
| 40 | seguridad | tienen faja lumbar l? | ✅ PASS | — |
| 41 | plomeria | llave de paso de bola de tres cuartos | ✅ PASS | — |
| 42 | herramientas | cadena para motosierra | ✅ PASS | — |
| 43 | pesca | nylon de pescar | ✅ PASS | — |
| 44 | construccion | flotador electrico | ✅ PASS | — |
| 45 | electricidad | tablero de 6 circuitos | ✅ PASS | — |
| 46 | electricidad | enchufe amarillo | ✅ PASS | — |
| 47 | pvc | manguera culebra | ✅ PASS | — |
| 48 | laminas | cuanto cuestan las laminas de zinc? | ✅ PASS | — |
| 49 | sinonimo | tienen tepe negro? | ✅ PASS | — |
| 50 | sin_catalogo | venden lavadora o secadora? | ✅ PASS | — |
