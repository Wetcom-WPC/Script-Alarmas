# Auditoría de código — Agosto 2026

Revisión completa del proyecto previa al pase a producción del cierre automático de
alarmas silenciadas (v10.5.x).

Cada punto indica archivo y línea. El estado se actualiza a medida que se resuelven.

**Leyenda:** ✅ resuelto · ⬜ pendiente

---

## Resumen

| # | Severidad | Hallazgo | Estado |
|---|---|---|---|
| 1 | 🔴 Alta | Techo de 100 tickets sin paginación ni aviso | ⬜ |
| 2 | 🔴 Alta | Logs de excepciones siempre al canal de testing | ✅ v10.6.0 |
| 3 | 🔴 Alta | `ENTORNO` como constante en archivo versionado | ✅ v10.6.0 |
| 4 | 🟠 Media | Lógica de vencimiento de excepciones duplicada | ⬜ |
| 5 | 🟠 Media | Regla de excepción con typo falla en silencio | ⬜ |
| 6 | 🟠 Media | `_crearMensajeFecha` muta las fechas que recibe | ⬜ |
| 7 | 🟠 Media | Lookups sin `hasOwnProperty` sobre datos de planilla | ⬜ |
| 8 | 🟠 Media | La guardia no se envía si la API de feriados falla | ⬜ |
| 9 | 🟡 Diseño | ~130 líneas duplicadas entre render Slack y HTML | ⬜ |
| 10 | 🟡 Diseño | El origen viaja como string JSON usado de clave | ⬜ |
| 11 | 🟡 Diseño | `doGet` provoca un efecto de lado | ⬜ |
| 12 | 🟡 Diseño | `DriveApp.getFileById` acepta cualquier ID | ⬜ |
| 13 | 🟡 Diseño | Ninguna llamada HTTP tiene reintento | ⬜ |
| 14 | 🟡 Diseño | El token de Jira ahora tiene permisos de escritura | ⬜ |
| 15 | 🔵 Tests | `MessageFormatter` sin cobertura | ⬜ |
| 16 | 🔵 Tests | `DataRepository`, `Tools` y `WebApp` sin cobertura | ⬜ |
| 17–22 | ⚪ Menores | Varios | ⬜ |

---

## 🔴 Bloqueantes

### 1. `buscarAlarmas()` tiene un techo duro de 100 tickets y descarta el resto en silencio ⬜

**Dónde:** `services/JiraService.js:28`

`maxResults: 100` y `jsonResponse.issues.map(...)` sin bucle. No hay `startAt`,
`nextPageToken` ni `isLast` en ningún lado del repo.

Si el filtro devuelve 101 alarmas, la 101 no se procesa, no se informa y no queda ningún
rastro de que existió. No hay warning ni error. En un día de incidente masivo —justo
cuando más importa— el resumen queda mudo sobre lo que sobra.

Agravante: el `README.md` afirmaba "Realiza consultas paginadas a la API REST v3 de Jira".
La documentación describía algo que el código no hace, así que nadie iría a buscar ahí.

**Decisión del equipo (11/08/2026):** limitación contemplada. Rara vez hay más de 20
alarmas activas, así que 100 sobra por amplio margen.

**Propuesta de bajo costo (pendiente de aprobación).** La API nueva `/search/jql` pagina
con `nextPageToken`, así que el bucle es corto y acotado:

```js
let token = null;
let todas = [];
let vueltas = 0;

do {
  if (token) payload.nextPageToken = token;
  const json = /* ... fetch ... */;
  todas = todas.concat(json.issues || []);
  token = json.nextPageToken || null;
  vueltas++;
} while (token && vueltas < 10);   // tope duro: 1000 alarmas, imposible colgarse
```

Con ≤100 resultados el comportamiento es **idéntico** al actual (la API no devuelve
`nextPageToken`), así que el riesgo de regresión es mínimo. El tope de vueltas evita
cualquier bucle infinito ante una respuesta inesperada.

Alternativa aún más barata si no se quiere tocar el fetch: detectar
`issues.length >= maxResults` y empujar un error al resumen de Slack. No arregla el
problema, pero lo hace visible.

---

### 2. Los logs de excepciones iban siempre al webhook de TESTING ✅

**Dónde:** `services/SlackService.js` · **Resuelto en:** v10.6.0

`enviarLogExcepcion` tenía hardcodeado `SLACK_WEBHOOK_TESTING`. En producción, todos los
🔇 de alarmas silenciadas y los ✅/⚠️ del cierre automático caían en el canal de pruebas,
donde nadie los mira. Justamente el aviso de "no se pudo cerrar el ticket" —la señal de
que algo salió mal con las escrituras a Jira— terminaba en el lugar equivocado.

Se resolvió con `Config.obtenerWebhookLogs()`, que rutea por entorno entre
`SLACK_WEBHOOK_LOGS_PROD` y `SLACK_WEBHOOK_LOGS_TESTING`.

De paso se eliminó código muerto: `getPropiedad()` lanza excepción si la clave no existe,
así que el `if (!webhookURL)` posterior era inalcanzable. Ahora la ausencia se captura y
el aviso baja al Logger en vez de perderse.

---

### 3. `Config.ENTORNO` era una constante editada a mano en un archivo versionado ✅

**Dónde:** `config/Config.js` · **Resuelto en:** v10.6.0

Todo el ruteo (webhook de Slack, canal de logs, carpeta de Drive, columna de correos, CC a
`wpc@`) dependía de esa línea. Pasar a producción implicaba editar el archivo, pushear y
acordarse de no volver a commitearlo mal. Un `clasp push` con `ENTORNO: 'TESTING'` mandaba
las alarmas reales al canal de pruebas; al revés, un `'PRODUCCION'` en el script de testing
empezaba a escribir en los canales del cliente. Y desde v10.5.0 eso además **cierra tickets
reales en Jira**.

Ahora se lee de la Script Property `ENTORNO` (`TESTING` | `PRODUCCION`). El mismo commit
corre en los dos proyectos sin editar nada.

- Se aceptan `PROD` y `PRODUCCIÓN` como sinónimos, con normalización de espacios y
  mayúsculas, para que un tipeo de memoria no degrade el script en silencio.
- Ante property ausente, ilegible o no reconocida **se asume `TESTING`** y queda aviso en
  el Logger. Es el lado seguro: una configuración rota no debe publicar en canales
  productivos ni escribir en tickets de clientes.
- Cubierto por `test/entorno.test.js` (11 casos), incluido el de valor mal tipeado.

**Hallazgo asociado, también corregido:** `Main.js` comparaba `Config.ENTORNO === 'PROD'`
para decidir la copia a `wpc@`, mientras el resto del código comparaba contra `'TESTING'`.
Al renombrar el valor productivo, esa línea habría dejado de agregar la copia sin que nada
fallara. Toda la decisión pasa ahora por `Config.esProduccion()`.

---

## 🟠 Correctitud

### 4. La lógica de vencimiento de excepciones está duplicada y puede divergir ⬜

**Dónde:** `config/DataRepository.js:81-103` y `utils/Tools.js:65-87`

El mismo bloque de ~25 líneas, copiado, para interpretar `Fecha hasta` + `Hora hasta`.

Uno decide si una regla silencia; el otro decide si se borra la fila. Si alguien corrige un
caso borde en uno solo, se llega a un estado donde `limpiarExcepcionesVencidas` borra una
regla que el motor todavía considera vigente, o deja viva una que ya no aplica.

Agravante: el trigger de limpieza **elimina filas de la planilla**. El error no se deshace.

**Sugerencia:** extraer una función pura `interpretarVencimiento(fechaVal, horaVal)` a un
único lugar y consumirla desde ambos. Como es pura, se puede testear sin `SpreadsheetApp`,
lo que además avanza el punto 16.

---

### 5. Una regla de excepción con un typo falla en silencio, para siempre ⬜

**Dónde:** `core/AlarmProcessor.js:246-249`

```js
if (regla.cliente !== 'TODOS' && regla.cliente.trim() !== cliente.trim()) continue;
if (regla.tipoAlarma !== 'TODAS' && regla.tipoAlarma.trim() !== tipoAlarma.trim()) continue;
```

Comparación exacta y sensible a mayúsculas. `banco macro` no matchea `Banco Macro`; un
espacio de más tampoco.

Lo problemático no es la comparación, es que **no hay ninguna señal**: la regla nunca
silencia nada y el operador no se entera. Es la misma clase de problema que costó la
depuración del POD el 11/08.

**Inconsistencia asociada:** el POD sí se compara normalizado (`toUpperCase()`); el cliente
y el tipo de alarma, no. Son criterios distintos para campos del mismo formulario.

**Sugerencia:** normalizar los tres igual, y emitir un warning cuando una regla vigente no
matcheó ningún ticket en la corrida (candidato a aparecer en el canal de logs).

---

### 6. `_crearMensajeFecha` muta las fechas que recibe ⬜

**Dónde:** `utils/MessageFormatter.js:246`

```js
.map(entry => (entry && entry.created) ? new Date(entry.created.setSeconds(0, 0)) : null)
```

`setSeconds()` **modifica el objeto original** y devuelve un timestamp. Una función de
presentación, que debería sólo leer, está escribiendo sobre los datos del pipeline. En la
guardia se llama dos veces sobre las mismas entradas (Slack y HTML).

El efecto hoy es inocuo —pone los segundos en cero, y repetirlo da lo mismo—. Se registra
porque es una trampa: el día que alguien necesite los segundos, o compare fechas después de
formatear, el bug aparecerá lejos de acá.

**Sugerencia:** `new Date(entry.created.getTime())` y recién ahí `setSeconds`.

---

### 7. Lookups sin `hasOwnProperty` sobre datos que vienen de la planilla ⬜

**Dónde:** `core/AlarmProcessor.js:224` (`AlarmFormatters.manejadores[tipoAlarma]`), y el
mismo patrón en `mapaAlarmas`, `mapaClientes` y `mapaPodsClientes`.

Si en la columna B de la planilla apareciera un nombre como `toString` o `constructor`, el
lookup devolvería la función heredada del prototipo, se la invocaría como si fuera un
formateador, `resultado.incluir` quedaría `undefined` y la alarma se descartaría sin
explicación.

Es improbable en la práctica y se registra como tal. Pero el patrón "diccionario indexado
por texto de una planilla" aparece en cuatro lugares y la corrección es una línea en cada
uno (`Object.prototype.hasOwnProperty.call(...)`, o construir los mapas con
`Object.create(null)`).

---

### 8. `esFinDeSemanaOFeriado` falla hacia el lado que oculta el problema ⬜

**Dónde:** `utils/Tools.js:128` y `utils/Tools.js:132`

Si la API de feriados no responde, devuelve `false`. Consecuencia: un 25 de mayo con
`api.argentinadatos.com` caído, `disparadorGuardia()` decide que es día hábil y **no envía
la guardia**. Nadie recibe el reporte y el único registro es una línea en el Logger.

Es una decisión defendible (mejor no spamear que spamear), pero es una dependencia externa
no cacheada, consultada en cada corrida, cuyo modo de falla es "no hacer nada".

**Sugerencia:** cachear el listado anual de feriados en `CacheService` o en una Script
Property, y avisar a Slack cuando la consulta falle en vez de seguir de largo.

---

## 🟡 Diseño y mantenibilidad

### 9. ~130 líneas duplicadas entre el render de Slack y el de HTML ⬜

**Dónde:** `utils/MessageFormatter.js:116-217` y `utils/MessageFormatter.js:276-415`

Repiten completo el armado de `groupByCombination`: mismo parseo del origen, mismo `Set` de
summaries, misma `claveGrupo`, mismo relleno de `targets` / `entries`.

La consecuencia ya se materializó: al agregar los bloques por cobertura, `_agruparPorCobertura()`
se enganchó **sólo en el camino de Slack**. Funciona igual en el HTML por casualidad (la
cobertura ya está dentro de `claveGrupo`), pero es una divergencia que nadie eligió.

Es el refactor con mejor relación beneficio/riesgo del proyecto: extraer el agrupado a una
función y dejar que cada render se ocupe sólo de pintar. Conviene hacerlo junto con el
punto 15.

---

### 10. El origen viaja como string JSON usado de clave de objeto ⬜

**Dónde:** `core/AlarmProcessor.js:102` y `utils/MessageFormatter.js:127`

Se hace `JSON.stringify(c.origen)` para usarlo como clave de `mensajesProcesados`, y del
otro lado se vuelve a parsear con un `try/catch` que fabrica un objeto falso si falla.

Funciona porque el objeto siempre se construye con las mismas claves en el mismo orden.
Pero es una invariante implícita que nadie declara: agregar un campo condicional a `origen`
cambia la clave y por lo tanto el agrupado. Ya ocurre hoy con `cobertura` —una alarma 9x5 y
una 24x7 no se agrupan, que es lo que queremos, pero se logró por un efecto lateral de la
serialización y no por una decisión explícita.

---

### 11. `doGet` provoca un efecto de lado ⬜

**Dónde:** `WebApp.js:62`

Crea un borrador de Gmail dentro de un GET. Un GET debería ser seguro de repetir.

Lo modera bastante la configuración: `access: DOMAIN` y `executeAs: USER_ACCESSING` en
`appsscript.json` impiden que un bot anónimo (el unfurl de Slack, por ejemplo) ejecute algo.
El riesgo remanente es acotado: un prefetch del navegador de un usuario del dominio, o una
recarga de pestaña, genera borradores repetidos en su propia casilla. Molesto, no grave.

---

### 12. `DriveApp.getFileById(e.parameter.id)` acepta cualquier ID ⬜

**Dónde:** `WebApp.js:17`, con el contenido inyectado sin escapar en `WebApp.js:47`

El parámetro va sin validar. Con `executeAs: USER_ACCESSING` el alcance se limita a lo que
ese usuario ya puede leer, así que no hay escalada de privilegios —de ahí que quede en
amarillo—. Aun así, no hay ninguna verificación de que el archivo sea un borrador generado
por esta aplicación.

En la misma función, `${payloadBorrador.cliente}` (`WebApp.js:71`) y `${err.message}`
(`WebApp.js:80`) se interpolan sin escapar en el HTML de respuesta, mientras que
`MessageFormatter` sí tiene `_escapeHTML()` y lo usa con disciplina. Es una inconsistencia
dentro del mismo proyecto.

---

### 13. Ninguna llamada HTTP tiene reintento ⬜

Ni Jira, ni Slack, ni la API de feriados. Un 502 transitorio en `buscarAlarmas()` lanza
excepción y **aborta la corrida completa**: no se informa nada, no se cierra nada.

Con el cierre automático esto pesa más que antes: se hacen hasta 3 llamadas por alarma
silenciada (listar transiciones, transicionar, comentar), todas sin reintento.

**Sugerencia:** un helper `_fetchConReintento(url, options, intentos)` con back-off simple,
usado por `JiraService` y `SlackService`.

---

### 14. El token de Jira ahora tiene permisos de escritura ⬜

No es un defecto del código, es un cambio en el radio de impacto que conviene tener
presente. Hasta v10.4.0, comprometer `JIRA_AUTH_TOKEN` permitía leer tickets. Desde v10.5.0
permite además transicionarlos y comentarlos. Las Script Properties son legibles por
cualquiera con permiso de edición sobre el proyecto de Apps Script.

**Sugerencia:** confirmar que la cuenta de servicio tenga permisos acotados a los proyectos
de alarmas y a nada más.

---

## 🔵 Cobertura de tests

### 15. `MessageFormatter` no está testeado ⬜

Los golden congelan la salida de `AlarmProcessor` (la estructura `mensajesProcesados`), no
el mensaje de Slack final. **El string que efectivamente se publica no lo verifica nadie.**
Toda la lógica de indentación, agrupado por cobertura, rangos de fecha y ocultamiento de
"Desconocido" está sin red.

Es el módulo con más lógica condicional del proyecto y el único cuyo output ve el cliente.

---

### 16. Sin cobertura: `DataRepository`, `Tools` y `WebApp` ⬜

`_parseExcepciones` interpreta fechas y horas con varias ramas (Date, string, vacío) y es el
corazón del vencimiento de reglas. `limpiarExcepcionesVencidas` **borra filas de la
planilla**. Ninguno tiene un solo test.

`DataRepository` y `Tools` tocan `SpreadsheetApp`, pero la lógica de fechas es pura y se
puede extraer — que es además lo que resolvería el punto 4.

---

## ⚪ Menores

| # | Hallazgo | Dónde |
|---|---|---|
| 17 | `alarmaPricipal` está mal escrito. Es un contrato de datos: hay que cambiarlo en los dos lados a la vez | `MessageFormatter.js:34`, `WebApp.js:39` |
| 18 | `"wpc@wetcom.com"` hardcodeado existiendo `Config.EMAIL_FALLBACK` con el mismo valor | `WebApp.js:53` |
| 19 | El error `(Equiv. Fila ${index + 2})` arrastra la numeración de una planilla que ya no es la fuente de datos | `AlarmProcessor.js:89` |
| 20 | `_debeExcluirse` busca `"falso positivo"` como subcadena del summary completo: una alarma legítima que mencione la frase se descarta sin aviso | `AlarmProcessor.js:200` |
| 21 | `Target:?` no tiene delimitador de palabra; una etiqueta como `SubTarget:` matchearía | `AlarmParser.js:181` |
| 22 | Encabezado `POD WPC` redundante: el prefijo se agrega siempre aunque WPC no sea un POD numerado | `MessageFormatter.js:11` |

---

## Lo que está bien y conviene no romper

La capa `core/parsers/` está bien resuelta: el contrato canónico realmente aísla a
`AlarmProcessor` del dialecto, y las categorías declarativas de `VropsCategorias.js` hacen
que sumar un tipo de objeto sea agregar datos, no código. El ruteo por estructura en vez de
por prefijo fue la decisión correcta y ya se pagó sola. Los golden tests capturados antes
del refactor son la razón por la que se pudo mover todo eso sin romper el formato histórico.

---

## Orden sugerido para lo que queda

1. **Punto 1**, si se decide implementar la paginación — es lo único que puede hacer
   desaparecer alarmas sin dejar rastro.
2. **Puntos 4 y 5** — los otros dos que pueden hacer perder una alarma sin que nadie se
   entere.
3. **Puntos 9 y 15 juntos** — extraer el agrupado y taparlo con tests en el mismo
   movimiento.
4. El resto, por oportunidad.
