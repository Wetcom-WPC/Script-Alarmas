# Auditoría de código — Agosto 2026

Revisión completa del proyecto previa al pase a producción del cierre automático de
alarmas silenciadas (v10.5.x).

Cada punto indica archivo y línea. El estado se actualiza a medida que se resuelven.

**Leyenda:** ✅ resuelto · ⬜ pendiente

---

## Resumen

| # | Severidad | Hallazgo | Estado |
|---|---|---|---|
| 1 | 🔴 Alta | Techo de 100 tickets sin paginación ni aviso | ⬜ (no se va a resolver, ver nota) |
| 2 | 🔴 Alta | Logs de excepciones siempre al canal de testing | ✅ v10.6.0 |
| 3 | 🔴 Alta | `ENTORNO` como constante en archivo versionado | ✅ v10.6.0 |
| 4 | 🟠 Media | Lógica de vencimiento de excepciones duplicada | ✅ v10.7.0 |
| 5 | 🟠 Media | Regla de excepción con typo falla en silencio | ✅ v10.7.0 |
| 6 | 🟠 Media | `_crearMensajeFecha` muta las fechas que recibe | ✅ v10.7.0 |
| 7 | 🟠 Media | Lookups sin `hasOwnProperty` sobre datos de planilla | ✅ v10.7.0 |
| 8 | 🟠 Media | La guardia no se envía si la API de feriados falla | ✅ v10.7.0 |
| 9 | 🟡 Diseño | ~130 líneas duplicadas entre render Slack y HTML | ✅ v10.8.0 |
| 10 | 🟡 Diseño | El origen viaja como string JSON usado de clave | ✅ v10.8.0 |
| 11 | 🟡 Diseño | `doGet` provoca un efecto de lado | ✅ v10.8.0 |
| 12 | 🟡 Diseño | `DriveApp.getFileById` acepta cualquier ID | ✅ v10.8.0 |
| 13 | 🟡 Diseño | Ninguna llamada HTTP tiene reintento | ✅ v10.8.0 (parcial, ver nota) |
| 14 | 🟡 Diseño | El token de Jira ahora tiene permisos de escritura | ⬜ (ya contemplado por el equipo, fuera del código) |
| 15 | 🔵 Tests | `MessageFormatter` sin cobertura | ✅ v10.9.0 |
| 16 | 🔵 Tests | `DataRepository`, `Tools` y `WebApp` sin cobertura | ✅ v10.9.0 (parcial, ver nota) |
| 17 | ⚪ Menor | `alarmaPricipal` mal escrito (contrato de datos) | ✅ v10.10.0 |
| 18 | ⚪ Menor | `"wpc@wetcom.com"` hardcodeado en `WebApp.js` | ✅ v10.10.0 |
| 19 | ⚪ Menor | Error con numeración de fila de Excel inexistente | ✅ v10.10.0 |
| 20 | ⚪ Menor | `_debeExcluirse` matchea "falso positivo" como subcadena | ⬜ (contemplado por el equipo, no se va a resolver) |
| 21 | ⚪ Menor | `Target:?` sin delimitador de palabra (matchea `SubTarget:`) | ✅ v10.10.0 |
| 22 | ⚪ Menor | Encabezado `POD WPC` redundante | ⬜ (contemplado por el equipo, no se va a resolver) |

---

## 🔴 Bloqueantes

### 1. `buscarAlarmas()` tiene un techo duro de 100 tickets y descarta el resto en silencio 🔒 cerrado, sin implementar

**Dónde:** `services/JiraService.js:28`

`maxResults: 100` y `jsonResponse.issues.map(...)` sin bucle. No hay `startAt`,
`nextPageToken` ni `isLast` en ningún lado del repo.

Si el filtro devuelve 101 alarmas, la 101 no se procesa, no se informa y no queda ningún
rastro de que existió. No hay warning ni error. En un día de incidente masivo —justo
cuando más importa— el resumen queda mudo sobre lo que sobra.

Agravante: el `README.md` afirmaba "Realiza consultas paginadas a la API REST v3 de Jira".
La documentación describía algo que el código no hace, así que nadie iría a buscar ahí.

**Decisión del equipo (11/08/2026):** limitación contemplada. Rara vez hay más de 20
alarmas activas, así que 100 sobra por amplio margen. Se evaluó la propuesta de abajo y se
decidió **no implementarla**: no vale la complejidad para un caso que no ocurre en la
práctica. Punto cerrado, sin cambios de código.

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

### 4. La lógica de vencimiento de excepciones está duplicada y puede divergir ✅

**Dónde:** `config/DataRepository.js` y `utils/Tools.js` · **Resuelto en:** v10.7.0

El mismo bloque de ~25 líneas, copiado, para interpretar `Fecha hasta` + `Hora hasta`.

Uno decide si una regla silencia; el otro decide si se borra la fila. Si alguien corrige un
caso borde en uno solo, se llega a un estado donde `limpiarExcepcionesVencidas` borra una
regla que el motor todavía considera vigente, o deja viva una que ya no aplica.

Se extrajo tal cual se sugería: `Fechas.interpretarVencimiento(fechaVal, horaVal)` en
`utils/Fechas.js`, función pura, testeada sola (`test/fechas.test.js`, 9 casos) y consumida
desde `DataRepository._parseExcepciones` y `Tools.limpiarExcepcionesVencidas`.

**Secuela (18/08/2026, v10.10.1):** la unificación resultó clave, pero la función unificada
arrastraba un bug que ninguna de las dos copias originales había resuelto: ante una fecha
ilegible caía a `new Date()` (hoy) como base, así que la regla se revalidaba sola en cada
corrida y no vencía nunca. Se detectó en producción con la excepción `Tempora_Macro`. Que el
criterio ya estuviera en un solo lugar permitió arreglarlo una vez y que valiera para el
matching y para la limpieza a la vez — exactamente el escenario que este punto anticipaba,
sólo que en la dirección inversa a la temida. Ver CHANGELOG v10.10.1.

---

### 5. Una regla de excepción con un typo falla en silencio, para siempre ✅

**Dónde:** `core/AlarmProcessor.js` · **Resuelto en:** v10.7.0

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

**Resuelto:** cliente y tipo de alarma ahora se normalizan igual que el POD
(`trim().toUpperCase()`) en `_verificarExcepcion`. Cubierto por 3 casos nuevos en
`test/excepciones.test.js`.

**Lo que quedó afuera (deliberado):** la idea original también proponía avisar cuando una
regla vigente no matcheó ningún ticket en la corrida. Se descartó: una regla legítima no
matchea nada en la mayoría de las corridas simplemente porque no llegó ninguna alarma que
silenciar — eso no es un typo, es el caso normal. Implementarlo generaría un falso positivo
en casi todas las corridas exitosas, no una señal útil. La normalización sola cubre el caso
real que motivó el punto.

---

### 6. `_crearMensajeFecha` muta las fechas que recibe ✅

**Dónde:** `utils/MessageFormatter.js` · **Resuelto en:** v10.7.0

```js
.map(entry => (entry && entry.created) ? new Date(entry.created.setSeconds(0, 0)) : null)
```

`setSeconds()` **modifica el objeto original** y devuelve un timestamp. Una función de
presentación, que debería sólo leer, está escribiendo sobre los datos del pipeline. En la
guardia se llama dos veces sobre las mismas entradas (Slack y HTML).

El efecto hoy es inocuo —pone los segundos en cero, y repetirlo da lo mismo—. Se registra
porque es una trampa: el día que alguien necesite los segundos, o compare fechas después de
formatear, el bug aparecerá lejos de acá.

**Resuelto:** clona con `new Date(entry.created.getTime())` antes de truncar los segundos.

---

### 7. Lookups sin `hasOwnProperty` sobre datos que vienen de la planilla ✅

**Dónde:** `core/AlarmProcessor.js` (`AlarmFormatters.manejadores[tipoAlarma]`) y
`config/DataRepository.js` (`mapaClientes`, `mapaPodsClientes`, `mapaCorreos*`) ·
**Resuelto en:** v10.7.0

Si en la columna B de la planilla apareciera un nombre como `toString` o `constructor`, el
lookup devolvería la función heredada del prototipo, se la invocaría como si fuera un
formateador, `resultado.incluir` quedaría `undefined` y la alarma se descartaría sin
explicación.

Es improbable en la práctica y se registra como tal. Pero el patrón "diccionario indexado
por texto de una planilla" aparece en cuatro lugares.

**Resuelto** con la alternativa de bajo costo que ya proponía el hallazgo: los mapas que
arma `DataRepository` (`_createMap`, `_crearMapaPods`, `_parseCorreosEntorno`) se construyen
ahora con `Object.create(null)`, así que no tienen prototipo del que heredar nada. El único
lookup que no pasa por esos mapas —`AlarmFormatters.manejadores[tipoAlarma]`, que es un
objeto autoral, no uno armado desde la planilla— quedó atrás de un
`Object.prototype.hasOwnProperty.call(...)` explícito en el sitio de consumo.

---

### 8. `esFinDeSemanaOFeriado` falla hacia el lado que oculta el problema ✅

**Dónde:** `utils/Tools.js` · **Resuelto en:** v10.7.0

Si la API de feriados no respondía, devolvía `false`. Consecuencia: un 25 de mayo con
`api.argentinadatos.com` caído, `disparadorGuardia()` decidía que era día hábil y **no
enviaba la guardia**. Nadie recibía el reporte y el único registro era una línea en el
Logger.

**Resuelto**, con una variante a la sugerencia original — decisión explícita del equipo
(11/08/2026): no cachear el listado anual (ensuciaría Script Properties o CacheService sin
necesidad real), y en cambio invertir directamente el lado del fallo. Ahora
`_consultarFeriados` reintenta la llamada una vez (para no tratar un error momentáneo igual
que una caída real) y, si las dos fallan, `esFinDeSemanaOFeriado` **asume que el día NO es
hábil** —se envía la guardia igual— y lo avisa por Slack con `SlackService.enviarLogTexto`
(nuevo, mismo webhook de logs). Cubierto por `test/tools.test.js` (6 casos, incluida la
recuperación tras un solo fallo).

---

## 🟡 Diseño y mantenibilidad

### 9. ~130 líneas duplicadas entre el render de Slack y el de HTML ✅

**Dónde:** `utils/MessageFormatter.js` · **Resuelto en:** v10.8.0

Repiten completo el armado de `groupByCombination`: mismo parseo del origen, mismo `Set` de
summaries, misma `claveGrupo`, mismo relleno de `targets` / `entries`.

La consecuencia ya se materializó: al agregar los bloques por cobertura, `_agruparPorCobertura()`
se enganchó **sólo en el camino de Slack**. Funciona igual en el HTML por casualidad (la
cobertura ya está dentro de `claveGrupo`), pero es una divergencia que nadie eligió.

**Resuelto** tal cual se sugería: se extrajo `_agruparPorCombinacion(entradasTarget)`,
usada ahora por `_generarDetalleAlarmas` (Slack) y `_generarDetalleAlarmasHTML`. Cada
render se ocupa sólo de pintar. Los 31 golden tests verifican que la salida no cambió un
carácter.

---

### 10. El origen viaja como string JSON usado de clave de objeto ✅

**Dónde:** `core/AlarmProcessor.js` · **Resuelto en:** v10.8.0

Se hacía `JSON.stringify(c.origen)` para usarlo como clave de `mensajesProcesados`, y del
otro lado se volvía a parsear con un `try/catch` que fabrica un objeto falso si falla.

Funcionaba porque el objeto siempre se construía con las mismas claves en el mismo orden.
Pero era una invariante implícita que nadie declaraba: dos parsers que arman `origen` con
las mismas claves en distinto orden (ej. uno agrega `etiquetaTarget` antes de `cobertura`,
otro después) generaban strings distintos y la misma alarma terminaba en dos grupos.

**Resuelto:** nueva `AlarmProcessor._claveOrigen(origen)`, que ordena las claves antes de
serializar (`JSON.stringify(origen, Object.keys(origen).sort())`). Mismo contenido, orden
determinístico — deja de depender de en qué orden cada parser construyó el objeto.

---

### 11. `doGet` provoca un efecto de lado ✅

**Dónde:** `WebApp.js` · **Resuelto en:** v10.8.0

Creaba un borrador de Gmail dentro de un GET. Un GET debería ser seguro de repetir.

**Resuelto:** `doGet` ya no crea nada. Devuelve una página que se reenvía sola como POST
(un `<form>` con `onload="submit()"`) hacia el nuevo `doPost`, que es quien de verdad llama
a `GmailApp.createDraft`. Un prefetch del navegador o una recarga de pestaña ya no generan
un borrador de más.

---

### 12. `DriveApp.getFileById(e.parameter.id)` acepta cualquier ID ✅

**Dónde:** `WebApp.js` · **Resuelto en:** v10.8.0

El parámetro iba sin validar. Con `executeAs: USER_ACCESSING` el alcance se limita a lo que
ese usuario ya puede leer, así que no había escalada de privilegios —de ahí que quedara en
amarillo—. Aun así, no había ninguna verificación de que el archivo fuera un borrador
generado por esta aplicación.

**Resuelto:**
- Nueva `_esPayloadBorradorValido(payload)`: si el JSON leído no tiene la forma mínima
  esperada (`cliente` y `html` como string), se corta con un mensaje claro en vez de
  intentar armar un correo con datos ajenos.
- `${payloadBorrador.cliente}` y `${err.message}` ahora pasan por
  `MessageFormatter._escapeHTML()` antes de ir al HTML de respuesta, igual que ya se hacía
  en el resto de `MessageFormatter`.

---

### 13. Ninguna llamada HTTP tenía reintento ✅ (parcial, a propósito)

**Resuelto en:** v10.8.0 — nuevo `utils/Http.js`.

Ni Jira, ni Slack, ni la API de feriados. Un 502 transitorio en `buscarAlarmas()` lanzaba
excepción y **abortaba la corrida completa**: no se informaba nada, no se cerraba nada.

**Resuelto, con alcance acotado a propósito:** `Http.fetchConReintento` (reintenta ante una
excepción de red o un HTTP 429/5xx; un 4xx es determinístico y se devuelve tal cual) se usa
en las llamadas de **sólo lectura**: `JiraService.buscarAlarmas`, `JiraService.obtenerTransiciones`
y `Tools._consultarFeriados` (que ya tenía su propio reintento ad-hoc desde el punto 8;
ahora usa el helper compartido).

**Deliberadamente NO se aplicó a los POST que mutan estado** (transicionar un ticket,
comentarlo, publicar en Slack): un POST que tira una excepción de red pudo haber llegado
igual al servidor, y reintentarlo a ciegas arriesga duplicar la acción — el mismo motivo por
el que `JiraService.comentarTicketInterno` ya evita reintentar tras un resultado incierto.
Generalizar el reintento a esos POST sin resolver antes la idempotencia sería cambiar un
problema (falla silenciosa) por otro peor (duplicados en Jira o en el canal de Slack).

---

### 14. El token de Jira ahora tiene permisos de escritura 🔒 fuera de alcance (ya contemplado por el equipo)

No es un defecto del código, es un cambio en el radio de impacto que conviene tener
presente. Hasta v10.4.0, comprometer `JIRA_AUTH_TOKEN` permitía leer tickets. Desde v10.5.0
permite además transicionarlos y comentarlos. Las Script Properties son legibles por
cualquiera con permiso de edición sobre el proyecto de Apps Script.

**Sugerencia:** confirmar que la cuenta de servicio tenga permisos acotados a los proyectos
de alarmas y a nada más.

**Decisión del equipo (11/08/2026):** ya contemplado por fuera del código (permisos de la
cuenta de servicio en Jira). No requiere cambios acá.

---

## 🔵 Cobertura de tests

### 15. `MessageFormatter` no está testeado ✅

**Resuelto en:** v10.9.0 — `test/messageFormatter.test.js` (20 casos).

Los golden congelan la salida de `AlarmProcessor` (la estructura `mensajesProcesados`), no
el mensaje de Slack final. **El string que efectivamente se publica no lo verifica nadie.**
Toda la lógica de indentación, agrupado por cobertura, rangos de fecha y ocultamiento de
"Desconocido" estaba sin red.

Es el módulo con más lógica condicional del proyecto y el único cuyo output ve el cliente.

**Resuelto:** se llama a `generarMensaje` / `generarCorreoGuardiaHTML` directamente con
estructuras `mensajesProcesados` armadas a mano (sin pasar por `AlarmProcessor`), y se
verifica el string resultante. Cubre: saludo `@wpc` vs `@pod<N>`, el párrafo de cierre
compartido, los 4 niveles de indentación (vCenter/Cluster/Target/detalle) con y sin
Cluster, el ocultamiento de "Desconocido"/"no encontrado", los bloques separados por
cobertura vs el agrupado dentro de la misma cobertura, el partido de summaries
multilínea, los 4 formatos de `_crearMensajeFecha` (fecha única, mismo minuto tras
truncar segundos, rango dentro del día, rango entre días), `_escapeHTML` y el escapado
del nombre del cliente en el HTML de guardia. De paso quedó confirmado que
`generarMensaje` no revienta sin `CacheService`/`DriveApp` disponibles (el intento de
generar el link de borrador está bien encapsulado en su propio try/catch).

---

### 16. Sin cobertura: `DataRepository`, `Tools` y `WebApp` ✅ (parcial, ver nota)

**Resuelto en:** v10.9.0.

`_parseExcepciones` interpreta fechas y horas con varias ramas (Date, string, vacío) y es el
corazón del vencimiento de reglas. `limpiarExcepcionesVencidas` **borra filas de la
planilla**. Ninguno tenía un solo test.

**Resuelto**, con un tercer tipo de sandbox nuevo en `test/harness.js`
(`crearSandboxHojas`, con un doble mutable de `SpreadsheetApp`) para poder ejercitar código
que lee/escribe hojas de cálculo sin tocar Sheets real:

- `test/dataRepository.test.js` (7 casos): `_createMap`, `_crearMapaPods`,
  `_parseCorreosEntorno` (columna B vs C según entorno) y `_parseExcepciones` (defaults,
  delegación en `Fechas.interpretarVencimiento`, filas sin ID).
- `test/limpieza.test.js` (7 casos): `Tools.limpiarExcepcionesVencidas` — la función que
  la propia auditoría marcó como la más riesgosa por borrar filas sin vuelta atrás.
  Cubre el caso central (recorrer de abajo hacia arriba sin saltear filas al borrar en el
  medio), reglas sin fecha que nunca vencen, la hoja `"Excepciones"` vieja (sin sufijo de
  POD) que debe ignorarse, y varias hojas de POD procesándose de forma independiente.
- `test/webapp.test.js` (6 casos): `_esPayloadBorradorValido`, la validación agregada en
  el punto 12.

**Lo que quedó afuera, a propósito:** `doGet`/`doPost`/`_generarBorrador` en sí (integran
`GmailApp`, `DriveApp`, `CacheService` y `HtmlService` reales) y
`Tools.limpiarBorradoresViejos` (usa `DriveApp`, y es una limpieza de caché de baja
severidad — un archivo trashado de más no pierde información real, a diferencia de borrar
una fila de la planilla). Mockear las cuatro APIs de Google para un test de integración de
`WebApp.js` completo no parecía tener buena relación esfuerzo/valor frente a testear
directamente la parte con lógica real (la validación). `DataRepository.obtenerMapeos()`
tampoco se testea end-to-end: se prefirió cubrir sus cuatro funciones internas, que es
donde vive toda la lógica no trivial.

---

## ⚪ Menores

### 17. `alarmaPricipal` estaba mal escrito ✅

**Resuelto en:** v10.10.0. Era un contrato de datos entre `MessageFormatter.js` (quien
escribe el JSON del borrador) y `WebApp.js` (quien lo lee) — se corrigió en los dos lados a
la vez, a `alarmaPrincipal`.

---

### 18. `"wpc@wetcom.com"` hardcodeado en `WebApp.js` ✅

**Resuelto en:** v10.10.0. Existiendo `Config.EMAIL_FALLBACK` con el mismo valor, no había
motivo para repetirlo suelto. `correosCC` ahora arranca de `Config.EMAIL_FALLBACK`.

---

### 19. El error de procesamiento citaba una fila de Excel inexistente ✅

**Resuelto en:** v10.10.0. `(Equiv. Fila ${index + 2})` era retrocompatibilidad con una
época en la que las alarmas SÍ venían de una planilla; hoy vienen de la API de Jira y esa
fila no corresponde a nada real. Ahora el error identifica al ticket por su `key` real y,
sólo si ni siquiera eso está disponible (el caso de "Clave faltante"), por su posición en
el lote — descrito como tal ("elemento #N del lote"), no como si fuera una fila de Excel.
Cubierto por `test/erroresProcesamiento.test.js` (3 casos).

---

### 20. `_debeExcluirse` matchea "falso positivo" como subcadena ⬜

**Decisión del equipo (13/08/2026):** contemplado, no se va a resolver.

---

### 21. `Target:?` sin delimitador de palabra ✅

**Resuelto en:** v10.10.0. La regex de `AlarmParser.extraerOrigen` buscaba la etiqueta
`Target:` sin verificar que no fuera parte de otra palabra, así que una etiqueta como
`SubTarget:` (que no tiene nada que ver) matcheaba igual y su valor se tomaba como si fuera
el target real de la alarma. Se agregó `(?:^|\s)` antes de `Target`, el mismo criterio que
ya usa `LegacyVCenterParser._extraerBloqueDescription` para `Description:`. Cubierto por
`test/alarmParser.test.js` (3 casos, incluido el de "SubTarget: ruido" seguido de la
etiqueta real, para confirmar que se usa la real y no la falsa).

---

### 22. Encabezado `POD WPC` redundante ⬜

**Decisión del equipo (13/08/2026):** contemplado, no se va a resolver.

---

## Lo que está bien y conviene no romper

La capa `core/parsers/` está bien resuelta: el contrato canónico realmente aísla a
`AlarmProcessor` del dialecto, y las categorías declarativas de `VropsCategorias.js` hacen
que sumar un tipo de objeto sea agregar datos, no código. El ruteo por estructura en vez de
por prefijo fue la decisión correcta y ya se pagó sola. Los golden tests capturados antes
del refactor son la razón por la que se pudo mover todo eso sin romper el formato histórico.

---

## Estado final

Auditoría cerrada. De los 22 hallazgos: 18 resueltos (2-13, 15-19, 21), 4 cerrados
deliberadamente sin cambios de código por decisión del equipo (1: complejidad no
justificada; 14: ya contemplado por fuera del código; 20 y 22: contemplados, no se van a
resolver). 0 pendientes sin decisión. Suite de tests: 146/146.

**Posterior a la auditoría:** v10.10.1 (18/08/2026) corrigió un bug de vencimiento de
Excepciones detectado en producción, sobre la función que había unificado el punto 4. Ver la
secuela anotada en ese punto y el CHANGELOG.
