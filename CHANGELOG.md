# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y el proyecto se adhiere a [Semantic Versioning](https://semver.org/).

## [10.11.3] - 2026-09-10

Primer bug que aparece al quedar el WebApp actualizado y sirviéndose desde su propio
proyecto: el patrón `doGet`/`doPost` de v10.8.0 nunca había llegado a correr en producción.

### Fixed
- **La confirmación del borrador terminaba en "refused to connect" (`WebApp.js`):** al hacer clic en "Generar correo para ..." el borrador se creaba correctamente, pero en lugar de la pantalla de confirmación el navegador mostraba `script.google.com refused to connect`.
  - Apps Script sirve el HTML de `doGet` dentro de un iframe anidado (`*.scriptusercontent.com`) embebido en la página `/exec`. El form que se autoenvía no declaraba `target`, así que navegaba **ese iframe** hacia `/exec`, y esa URL se niega a ser embebida. El POST llegaba igual al servidor —de ahí que el borrador apareciera en Gmail— y lo único que fallaba era renderizar la respuesta de `doPost`.
  - Con `target="_top"` el form navega la pestaña entera y la confirmación se muestra como una página normal.
  - **Por qué recién se ve ahora:** el patrón `doGet`/`doPost` lo introdujo v10.8.0, para que un GET dejara de mutar. Pero el deployment que atendía los enlaces siguió fijado a la versión 8, anterior a ese cambio (ver v10.11.1): el código estaba escrito y documentado, y no se estaba ejecutando en ningún lado. Sólo se volvió visible cuando producción pasó a servir su propio WebApp actualizado.

### Added
- **Tests:** 3 casos en `test/webapp.test.js`, stubeando `HtmlService` y `ScriptApp`. `doGet` no estaba cubierto precisamente por depender de esos dos servicios, pero la parte que arma el HTML es barata de testear y es donde vivía el bug: se verifica el `target="_top"`, que el id se reenvíe como POST y que sin id no se arme ningún form. `doPost` / `_generarBorrador` siguen fuera del alcance (integran Gmail, Drive y Cache reales). Suite total: 171/171.

## [10.11.2] - 2026-09-10

Corrige una decisión de v10.11.1 y, de paso, un modo de falla que esa decisión estaba tapando.

### Changed
- **`URL_WEB_APP` vuelve a Script Properties (`config/Config.js`):** v10.11.1 dejó las dos URLs como constantes versionadas en el código, justificándolo con que "no son secretos". El criterio estaba mal planteado. `CARPETA_BORRADORES_PROD` / `_TESTING` tampoco es un secreto y vive en Script Properties: la regla del proyecto no es *"secretos afuera"* sino *"identificador de infraestructura por entorno, afuera"*, y una URL de deployment es exactamente eso. Además, el getter de `ENTORNO` documenta que el interruptor existe justamente para no tener que tocar constantes versionadas al cambiar de entorno — que es lo que v10.11.1 reintrodujo.
  - Pasa a `getPropiedad("URL_WEB_APP_PROD")` / `getPropiedad("URL_WEB_APP_TESTING")`, con la misma forma que `ID_CARPETA_BORRADORES`.
  - **Requiere las dos Script Properties cargadas en cada proyecto.** Sin ellas el mensaje se publica igual, pero sin los enlaces de borrador.

### Fixed
- **Una property ausente dejaba al POD sin mensaje, no sin enlaces (`utils/MessageFormatter.js`):** `Config.URL_WEB_APP` se leía en la condición del `if`, **fuera** del `try` que envuelve la generación del borrador. Mientras el valor era una constante eso nunca fallaba; al moverlo a Script Properties pasó a importar, porque `getPropiedad` lanza si la clave falta. Una property sin cargar se llevaba puesta a `generarMensaje` entera y ninguna alarma llegaba a Slack.
  - Nueva `MessageFormatter._urlWebApp()`, que absorbe cualquier falla al resolver la URL y devuelve `null`. El mensaje se publica sin enlaces y queda el aviso en el log. El enlace al borrador es una comodidad; el resumen de alarmas es el producto.

### Added
- **Tests:** 4 casos reescritos en `test/entorno.test.js` (verifican **qué** property se lee en cada entorno, que un `ENTORNO` roto cae en la de testing y que el error nombra la clave faltante) y 2 en `test/messageFormatter.test.js`, uno de ellos la regresión de la property ausente. Suite total: 168/168.

### Nota operativa
- Script Properties a cargar en **cada** proyecto: `URL_WEB_APP_PROD` y `URL_WEB_APP_TESTING`. Cada entorno lee sólo la suya, pero tener ambas permite flipear `ENTORNO` para reproducir un problema del otro lado sin tocar nada más — igual que con los webhooks de Slack.
- Si en algún momento los enlaces "Generar correo para ..." desaparecen del mensaje de Slack, la causa más probable es una de estas properties sin cargar o mal tipeada. El Logger lo dice explícitamente ("No se pudo resolver URL_WEB_APP").

## [10.11.1] - 2026-09-10

Cierra el desfasaje del WebApp de borradores que venía arrastrándose desde el hotfix del
asunto `undefined` (v10.10.2). La causa raíz resultó ser de despliegue, no de código.

### Fixed
- **Cada entorno publica su propio WebApp (`config/Config.js`):** `URL_WEB_APP` era una constante única hardcodeada, la misma en las dos ramas, apuntando a un deployment de **alarmas-testing**. Los enlaces "Generar correo para ..." que publicaba **producción** abrían, por lo tanto, el WebApp del proyecto de testing.
  - No era un detalle cosmético: el WebApp corre dentro del proyecto dueño del deployment y resuelve `DataRepository` contra la planilla a la que **ese** proyecto está atado. Los destinatarios de los borradores de clientes reales salían de la hoja "Correos Clientes" de testing.
  - Ese deployment estaba además **fijado a la versión 8**, una foto del código anterior al rename `alarmaPricipal` → `alarmaPrincipal` (13399ae, 13/08). De ahí salía el asunto `undefined`. Una versión fijada **no se actualiza con `clasp push`**, y por eso ningún push movió el problema: el alias que dejó v10.10.2 en el payload fue lo que lo mantuvo funcionando.
  - La versión 8 tampoco tenía nada del endurecimiento de v10.8.0 en adelante: sin `_esPayloadBorradorValido`, sin `doPost` (creaba el borrador dentro del `GET`), sin `_escapeHTML` sobre cliente y errores, y con `"wpc@wetcom.com"` hardcodeado en lugar de `Config.EMAIL_FALLBACK`. Todo eso figuraba como resuelto en este changelog y no estaba corriendo en ningún lado.
  - `URL_WEB_APP` pasa a ser un getter sobre `esProduccion()`, con una constante por entorno, siguiendo el mismo patrón que `obtenerWebhookSlack()` e `ID_CARPETA_BORRADORES`. Ante una property `ENTORNO` ausente o ilegible cae al WebApp de **testing**, nunca al productivo — el mismo criterio de fail-safe que el resto del interruptor.
  - Las URLs van en el código y no en Script Properties: no son secretos (el acceso al WebApp ya está restringido al dominio) y así quedan versionadas junto al resto.
  - > **Revertido en v10.11.2.** El criterio estaba mal planteado: la regla del proyecto no es "secretos afuera" sino "identificador de infraestructura por entorno, afuera". Las URLs viven ahora en Script Properties.

### Added
- **Tests:** 4 casos nuevos en `test/entorno.test.js` (total 15): cada entorno resuelve su propio WebApp, los dos deployments son distintos, y una property rota cae al de testing. Suite total: 167/167.

### Nota operativa
- **alarmas-produccion** no tenía ningún deployment versionado (sólo el `@HEAD` automático). Se creó uno.
- **alarmas-testing** conservó el id de deployment que ya tenía, republicado a una versión actual, para que los enlaces que ya estaban en Slack siguieran funcionando.
- Si en el futuro hay que republicar, conviene reusar el id con `clasp create-deployment -i <deploymentId>`: saca una versión nueva sin cambiar la URL, así no hay que tocar `Config.js` ni se rompen los enlaces vigentes.
- El alias `alarmaPricipal` que dejó v10.10.2 en el payload ya no es necesario para producción, pero conviene conservarlo mientras puedan quedar borradores viejos en Drive (se vencen a las 6 horas).

## [10.11.0] - 2026-09-10

Validado primero en `alarmas-testing` y promovido a producción después de la verificación del NOC.

### Added
- **Enlaces a los tickets de Jira junto al nombre del cliente (`core/AlarmProcessor.js`, `utils/MessageFormatter.js`):** la línea del cliente en el mensaje de Slack pasa de `*Falabella*` a `*Falabella* | SOPFALABEL-26796 | SOPFALABEL-26801`, con cada key enlazada a su ticket. El POD puede saltar al ticket sin tener que buscarlo a mano.
  - La `ticketKey` ya viajaba en las candidatas de `AlarmProcessor` —se usaba para el log de duplicadas por cobertura y para el cierre automático en Jira— pero se perdía al agrupar. Ahora queda guardada en la entrada, junto a `created`, `warnings` y `summaryResto`.
  - `_agruparMensaje` pasa a recibir la candidata entera en vez de sus campos sueltos: ya tenía ocho parámetros posicionales y la key habría sido el noveno.
  - Nueva `MessageFormatter._enlacesTickets()`. Recorre todas las alarmas del cliente y todos sus grupos de origen, porque un mismo bloque puede venir de más de un ticket: la misma alarma sobre tres hosts llega como tres tickets de Jira distintos y se publica como una sola línea. Deduplica conservando el orden de aparición —el mismo en el que se listan las alarmas debajo— y arma los enlaces con `Config.JIRA_BASE_URL`.
- **Tests:** `test/ticketsCliente.test.js` (6 casos), que cubre las dos capas por separado (el guardado de la key en `AlarmProcessor` y el armado de los enlaces en `MessageFormatter`) más el punta a punta sobre el mensaje completo. El golden no se mueve: su vista aplanada no emite `ticketKey`. Suite total: 163/163.

### Nota de alcance
- **Sólo cambia el mensaje de Slack.** El correo al cliente sigue igual: las keys de Jira son referencias internas y no corresponde mandárselas.
- **No hay tope de tickets por cliente.** Un cliente con muchas alarmas va a tener una línea larga. Se dejó así a propósito en vez de inventar un corte; si en la práctica molesta, el lugar para acotarlo es `_enlacesTickets`.

## [10.10.2] - 2026-09-09

Tres fixes de producción encadenados por el mismo reporte: el borrador de correo que genera
el botón "Generar correo para ..." de Slack. El tercero destapó un bug de parseo que venía
publicando alarmas con el nombre equivocado, en Slack y en el correo al cliente.

### Fixed
- **Asunto del borrador con `undefined` (`WebApp.js`, `utils/MessageFormatter.js`):** el nombre de la alarma viaja en un JSON que escribe `MessageFormatter` y queda persistido en Drive; el que lo lee es el deployment publicado en `Config.URL_WEB_APP`. Son dos ejecuciones distintas y no necesariamente del mismo código. La v10.10.0 renombró el campo `alarmaPricipal` → `alarmaPrincipal` **en los dos lados a la vez**, asumiendo que siempre corren la misma versión; cuando el deployment que atiende el enlace es anterior a ese cambio, busca el nombre viejo, no lo encuentra, y el asunto sale como `undefined - WETCOM - Cliente - dd/MM/yyyy`. El cuerpo del correo salía bien porque viaja pre-renderizado en el payload.
  - `WebApp.js`: el asunto pasa por `_alarmaPrincipalDe()`, que acepta los dos nombres del campo y cae a `"Incidentes Varios"` ante un valor ausente o inservible, en vez de dejar que un `undefined` llegue al asunto.
  - `MessageFormatter.js`: el payload escribe **también** el alias histórico, para que un lector previo a v10.10.0 arme bien el asunto igual. Se puede borrar cuando `Config.URL_WEB_APP` apunte con certeza a un deployment posterior (ver la nota operativa).
- **Viñeta suelta en el DETALLE del correo (`utils/MessageFormatter.js`):** en la tabla del correo, DETALLE era el único campo que se renderizaba como lista; ALARMA, FECHA, el target y VCENTER son todos texto plano. Esa `<ul>` es un resto del formato de Slack, donde el detalle cuelga indentado del target y la viñeta marca esa jerarquía. En el correo no hay jerarquía que marcar —la celda ya está rotulada DETALLE—, así que la viñeta no separaba nada y quedaba como un punto suelto. Ahora un detalle de una sola línea va como texto plano; con varias líneas se mantiene la lista, porque ahí cada línea es un campo distinto (`Descripcion`, `Health Status`, ...) y sin viñeta se leerían como un solo párrafo. El color pasa a la celda y las líneas vacías se descartan en vez de generar viñetas huérfanas. **El formato de Slack no se toca:** allí la viñeta sí marca la indentación.
- **Alarmas `<target> - [alarm.X]` colapsando a un mismo nombre (`core/AlarmParser.js`):** SOPFALABEL-26796 es una alarma de vencimiento de certificado SSL y se publicó como *"Alarma por estado de licencia"*. La planilla ya tenía la fila correcta (`CertificateStatusAlarm` → *"Alarma de estado de Certificado"*); nunca se usaba porque el parser no llegaba a extraer ese ID. Tres defectos encadenados:
  - El normalizador de identificadores matcheaba también la forma que **ya** estaba canónica y le anteponía un segundo punto: `[alarm.X]` quedaba como `[alarm..X]`. Se agregó un `(?!\.)`.
  - El patrón genérico `"<target> - <texto>"` cortaba en el primer punto —que ahora era el de `[alarm.`— y devolvía `[alarm` como nombre de alarma. **Toda** alarma de esa forma colapsaba al mismo nombre: el que tuviera cargada la fila `[alarm` de la planilla. Se agregó un `(?!\[?alarm\.)` para que ese patrón le ceda el paso al específico que existe justo para los identificadores canónicos, unas líneas más abajo.
  - Al quitar el identificador del medio del summary, el detalle quedaba con el target repetido y un espacio doble (`"Datacenters -  Certificate..."`). El recorte pasa a hacerse por posición y descarta ese prefijo, que ya se publica en su propia fila.

### Added
- **Tests:** 11 casos nuevos — 4 en `test/webapp.test.js` (resolución del nombre de alarma del asunto, incluido el alias viejo), 4 en `test/messageFormatter.test.js` (una línea sin viñeta, varias líneas con lista, el texto por defecto y el escapado del detalle) y 3 en `test/alarmParser.test.js` (con el summary literal de SOPFALABEL-26796 y la verificación de que dos alarmas distintas ya no colapsan). Suite total: 157/157.
- El único golden que cambia es el que congelaba el punto de más: `"Alarma desconocida [.EstoNoExisteEnLaPlanilla]"` → sin el punto. Los 31 casos siguen pasando.

### Nota operativa
- **La fila `[alarm` de la hoja "Tipos de Alarmas" conviene borrarla.** Con el fix ya no se extrae nunca ese nombre, así que queda muerta; pero mientras exista vuelve a tapar cualquier bug parecido en vez de dejar que se note.
- Las alarmas que caían en esa fila pasan a resolver por su **ID real**. Las que todavía no tengan su fila cargada van a salir como `Alarma desconocida [X]` con su warning — que es lo correcto, y dice exactamente cuál falta. Es ruido esperable las primeras corridas, e información que hasta ahora el sistema estaba ocultando.
- **Pendiente:** `Config.URL_WEB_APP` apunta al deployment `AKfycbw-ZHuJoFY…`, que no figura entre los deployments de este proyecto (`clasp` reporta uno solo, `AKfycbyDbPTRzK9…@HEAD`). El asunto sale bien gracias al alias, pero el desfasaje entre el código que escribe el borrador y el que lo lee sigue ahí, y es el que va a morder la próxima vez que cambie ese contrato.

## [10.10.1] - 2026-08-18

Hotfix de producción. Detectado en vivo: la excepción `Tempora_Macro` (Banco Macro) siguió
silenciando alarmas de Desconexión de Host el 18/08, cuatro días después de su vencimiento
declarado (14/08 18:00), y la fila nunca se borraba de la planilla.

### Fixed
- **Vencimiento de Excepciones con fecha ilegible (`utils/Fechas.js`):** si la celda "Fecha hasta" llegaba como texto que `new Date()` no podía parsear —el caso real: `"14/08/2026"`, que el motor JS lee como `MM/DD/YYYY` y da `Invalid Date`—, el código caía en silencio a `new Date()` (hoy) como fecha base. La hora sí se aplicaba encima, así que el vencimiento se recalculaba como "hoy a las HH:mm" **en cada corrida**: la regla nunca vencía y la fila nunca se borraba. Afectaba por igual al matching de Excepciones (`DataRepository._parseExcepciones`) y a la limpieza automática (`Tools.limpiarExcepcionesVencidas`), porque desde v10.7.0 ambas comparten esta función.
  - Ahora se acepta explícitamente texto `"DD/MM/YYYY"` / `"DD-MM-YYYY"`, validando que la fecha exista de verdad (un `31/02/2026` no rueda a marzo, se rechaza).
  - **Fail-closed:** si ninguna interpretación da una fecha válida, la regla se trata como **ya vencida** en vez de "no vence nunca" o "vence hoy". Una celda ilegible no debe seguir silenciando alarmas de forma indefinida — es el mismo criterio que el punto 8 de la auditoría aplicó a los feriados: ante configuración rota, fallar del lado que deja ver la alarma, no del que la oculta.

### Added
- **Tests:** 4 casos nuevos en `test/fechas.test.js` (total 9), incluida la reproducción exacta del incidente `Tempora_Macro` y los dos caminos de fail-closed (texto ilegible y fecha imposible). Suite total: 146/146.

### Nota operativa
El fix hace que el script trate la regla como vencida, pero **no reescribe la planilla**: una
celda "Fecha hasta" que haya quedado como texto conviene volver a cargarla para que Sheets la
reconozca como fecha real. Se configuró además el trigger diario de
`runnerLimpiarExcepcionesVencidas`, que hasta ahora no existía (la limpieza automática nunca
había corrido).

## [10.10.0] - 2026-08-13

Cierra AUDITORIA.md. Últimos hallazgos menores (17, 18, 19, 21). Los puntos 20 y 22 quedan
sin resolver por decisión del equipo (contemplados, no urgentes).

### Fixed
- **`alarmaPricipal` → `alarmaPrincipal`:** typo en el contrato de datos entre `MessageFormatter.js` (arma el JSON del borrador) y `WebApp.js` (lo lee). Corregido en ambos lados a la vez.
- **`"wpc@wetcom.com"` hardcodeado en `WebApp.js`:** reemplazado por `Config.EMAIL_FALLBACK`, que ya tenía el mismo valor.
- **Error de procesamiento con numeración de fila de Excel inexistente:** `AlarmProcessor` citaba `(Equiv. Fila N)`, retrocompatibilidad con una época en la que las alarmas venían de una planilla. Ahora identifica al ticket por su `key` real y, sólo si falta, por su posición en el lote (descrita como tal, no como una fila).
- **`Target:?` sin delimitador de palabra:** la regex de `AlarmParser.extraerOrigen` matcheaba `SubTarget:` como si fuera la etiqueta `Target:`, tomando el valor de una etiqueta ajena. Se agregó `(?:^|\s)` antes de la etiqueta, el mismo criterio que ya usaba `LegacyVCenterParser` para `Description:`.

### Added
- **Tests:** `test/erroresProcesamiento.test.js` (3 casos) y `test/alarmParser.test.js` (3 casos, incluida la reproducción específica del bug de "SubTarget:"). Suite total: 142/142.

## [10.9.0] - 2026-08-11

### Added
- **Cobertura de Tests para `MessageFormatter`, `DataRepository`, `Tools` y `WebApp`** (AUDITORIA.md, puntos 15-16):
  - `test/messageFormatter.test.js` (20 casos): testea el string final que se publica (Slack y el HTML de guardia), no sólo la estructura intermedia. Indentación (vCenter/Cluster/Target/detalle), ocultamiento de "Desconocido", bloques por cobertura, los 4 formatos de rango de fecha, `_escapeHTML` y el escapado del nombre del cliente en el correo.
  - `test/dataRepository.test.js` (7 casos) y `test/limpieza.test.js` (7 casos, para `Tools.limpiarExcepcionesVencidas` — la función que borra filas de la planilla sin vuelta atrás).
  - `test/webapp.test.js` (6 casos) para `_esPayloadBorradorValido`.
  - Nuevo tipo de sandbox en `test/harness.js` (`crearSandboxHojas`) con un doble mutable de `SpreadsheetApp`, para poder testear código que lee/escribe hojas de cálculo.
  - Quedan fuera a propósito: `doGet`/`doPost`/`_generarBorrador` de punta a punta (integran Gmail/Drive/Cache/HtmlService reales) y `Tools.limpiarBorradoresViejos` (usa DriveApp, severidad baja). Ver la nota de alcance en AUDITORIA.md punto 16.
  - Suite total: 136/136.

## [10.8.0] - 2026-08-11

### Changed
- **`MessageFormatter` sin Duplicación entre Slack y HTML:** el armado de `groupByCombination` (parseo del origen, agrupado por vCenter/cluster/summaries) estaba copiado entero entre `_generarDetalleAlarmas` (Slack) y `_generarDetalleAlarmasHTML`, y ya habían llegado a divergir una vez sin que nadie lo decidiera (`_agruparPorCobertura` sólo se enganchaba en el camino de Slack). Se extrajo `_agruparPorCombinacion(entradasTarget)`, usada por los dos. Sin cambios de salida: los 31 golden tests lo verifican.
- **Clave de Agrupación de Alarmas, Explícita:** `AlarmProcessor` usaba `JSON.stringify(origen)` directo como clave de `mensajesProcesados`, dependiendo implícitamente de que todos los parsers construyeran el objeto `origen` con las claves en el mismo orden. Nueva `_claveOrigen(origen)` ordena las claves antes de serializar, así deja de ser un efecto colateral del orden de inserción.
- **`doGet` ya no muta nada:** creaba un borrador de Gmail dentro de una request GET (que debería ser segura de repetir). Ahora `doGet` sólo devuelve una página que se reenvía sola como POST hacia el nuevo `doPost`, que es quien llama a `GmailApp.createDraft`.
- **Borrador de Correo, Validado antes de Usarse:** `WebApp.js` tomaba cualquier `DriveApp.getFileById(id)` sin verificar que el contenido fuera realmente un borrador generado por esta app. Nueva `_esPayloadBorradorValido()` corta con un mensaje claro si no tiene la forma esperada. De paso, `${payloadBorrador.cliente}` y `${err.message}` pasan ahora por `MessageFormatter._escapeHTML()` antes de ir al HTML de respuesta (antes se interpolaban sin escapar).
- **Reintento en Llamadas HTTP de Sólo Lectura:** nuevo `utils/Http.js` (`conReintento` / `fetchConReintento`, con backoff simple y sin reintentar 4xx). Se usa en `JiraService.buscarAlarmas`, `JiraService.obtenerTransiciones` y `Tools._consultarFeriados` (que pasa a usar el helper compartido en vez de su reintento ad-hoc). Deliberadamente **no** se aplica a los POST que mutan estado (transicionar/comentar un ticket, publicar en Slack): un POST que tira una excepción de red pudo haber llegado igual al servidor, y reintentarlo a ciegas arriesga duplicar la acción.

### Added
- **Tests:** `test/http.test.js` (10 casos, `Http.conReintento` / `fetchConReintento`). Suite total: 100/100.

## [10.7.0] - 2026-08-11

### Fixed
- **Vencimiento de Excepciones Duplicado (podía divergir):** `DataRepository._parseExcepciones` (decide si una regla sigue vigente) y `Tools.limpiarExcepcionesVencidas` (decide si la fila se borra de la planilla) tenían el mismo bloque de ~25 líneas copiado. Un fix aplicado en uno solo podía dejar al motor de Excepciones y a la limpieza automática tomando decisiones distintas sobre la misma regla. Se extrajo a `Fechas.interpretarVencimiento(fechaVal, horaVal)` (`utils/Fechas.js`), función pura, y ambos la consumen ahora.
- **Regla de Excepción con Typo Fallaba en Silencio:** la comparación de `cliente` y `tipoAlarma` en `AlarmProcessor._verificarExcepcion` era exacta y sensible a mayúsculas — `banco macro` no matcheaba `Banco Macro`, y la regla quedaba sin efecto para siempre sin ningún aviso. Ahora se normalizan igual que el POD (mayúsculas + trim).
- **`_crearMensajeFecha` Mutaba las Fechas que Recibía:** `entry.created.setSeconds(0, 0)` modifica el objeto original en vez de devolver uno nuevo. Inocuo hoy (poner los segundos en cero es idempotente), pero la guardia formatea las mismas entradas dos veces (Slack y HTML) y era una trampa para el día que alguien necesitara los segundos originales. Ahora se clona con `new Date(entry.created.getTime())` antes de truncar.
- **Lookups sin `hasOwnProperty` sobre Datos de Planilla:** un valor como `constructor` en la columna de "Tipos de Alarmas" o en "Clientes" podía resolver contra el prototipo de `Object` en vez de dar "no encontrado". Los mapas que arma `DataRepository` (`mapaClientes`, `mapaPodsClientes`, `mapaCorreos*`) se construyen ahora con `Object.create(null)`, y el lookup de `AlarmFormatters.manejadores[tipoAlarma]` en `AlarmProcessor` quedó atrás de un `hasOwnProperty` explícito.
- **La Guardia se Omitía si la API de Feriados Fallaba:** `esFinDeSemanaOFeriado` asumía día hábil (no enviaba la guardia) ante cualquier falla de `api.argentinadatos.com`, sin más rastro que una línea en el Logger. Ahora reintenta una vez (para no tratar un error momentáneo como una caída real) y, si sigue fallando, asume que el día NO es hábil —se envía la guardia igual— y lo avisa por Slack vía `SlackService.enviarLogTexto` (nuevo). Es la falla más segura: una guardia de más un día hábil es molesta, una guardia de menos un feriado real es el problema que esta función existe para evitar.

### Added
- **Tests:** `test/fechas.test.js` (5 casos, `Fechas.interpretarVencimiento`) y `test/tools.test.js` (6 casos, reintento y aviso por Slack de `esFinDeSemanaOFeriado`). 3 casos nuevos en `test/excepciones.test.js` para la normalización de cliente/tipo de alarma. Suite total: 90/90.

## [10.6.1] - 2026-08-11

### Changed
- **Cierre Unificado del Mensaje de Slack (hot-fix):** WPC tenía su propia variante del párrafo final (*"¿Desean que generemos un ticket para analizar la anomalía en profundidad? Aguardamos sus comentarios. Saludos cordiales."*). Ese texto está redactado para el **cliente**, no para el POD, así que en el canal interno preguntaba lo que no correspondía. Todos los PODs usan ahora el mismo cierre: *"Ante esto, les consulto, ¿están al tanto de la/s anomalía/s? ¿desean que le informemos al cliente?"*. La mención `@wpc` no se toca. El texto orientado al cliente sigue vivo donde sí corresponde: en el borrador de correo que arma `WebApp.js`.

## [10.6.0] - 2026-08-11

### Fixed
- **Los Logs de Excepciones Iban Siempre al Canal de Testing:** `SlackService.enviarLogExcepcion` tenía hardcodeado `SLACK_WEBHOOK_TESTING`, así que en producción **todos** los avisos de alarmas silenciadas —y el ✅/⚠️ del cierre automático en Jira— caían en el canal de pruebas, donde nadie los mira. Justo el aviso de "no se pudo cerrar el ticket" terminaba en el lugar equivocado. Ahora se resuelve por entorno vía `Config.obtenerWebhookLogs()` (`SLACK_WEBHOOK_LOGS_PROD` / `SLACK_WEBHOOK_LOGS_TESTING`). Se eliminó de paso una guarda muerta: `getPropiedad()` lanza si la clave falta, por lo que el `if (!webhookURL)` posterior era inalcanzable; ahora la ausencia se captura y el aviso baja al Logger en vez de perderse.
- **Comparación de Entorno Inconsistente:** `Main.js` comparaba `Config.ENTORNO === 'PROD'` para decidir la copia a `wpc@` en el correo de guardia, mientras el resto del código comparaba contra `'TESTING'`. Al renombrar el valor productivo, esa línea habría dejado de agregar la copia sin que nada fallara. Toda la decisión pasa ahora por `Config.esProduccion()`.

### Changed
- **El Entorno se Configura por Script Property, no por Código:** `Config.ENTORNO` era una constante editada a mano en un archivo versionado, de la que dependen el webhook de Slack, el canal de logs, la carpeta de Drive y la copia a `wpc@`. Pasar a producción obligaba a editarla, pushear y acordarse de no volver a commitearla mal; un `clasp push` con el valor equivocado publicaba las alarmas reales en el canal de pruebas, y desde v10.5.0 además cierra tickets reales en Jira. Ahora se lee de la Script Property `ENTORNO` (`TESTING` | `PRODUCCION`), así el mismo commit corre en los dos proyectos sin tocar nada.
  - Se aceptan `PROD` y `PRODUCCIÓN` como sinónimos, y el valor se normaliza (espacios y mayúsculas), para que un tipeo de memoria no degrade el script en silencio.
  - **Ante property ausente, ilegible o no reconocida se asume `TESTING`** y se deja aviso en el Logger. Es el lado seguro: una configuración rota no debe publicar en canales productivos ni escribir en los tickets de los clientes.
  - El valor se cachea por ejecución: `PropertiesService` es una llamada de red encubierta y el entorno se consulta muchas veces por corrida.

### Added
- **Tests de Entorno y Ruteo de Webhooks (`test/entorno.test.js`):** 11 casos que blindan el interruptor más delicado del proyecto. Incluyen explícitamente el caso "valor mal tipeado" y verifican que en producción los logs **no** vayan al webhook de testing. `crearSandboxServicios()` acepta ahora un juego de Script Properties simuladas.

## [10.5.3] - 2026-08-11

### Changed
- **Nota Interna de Cierre más Escueta:** El comentario pasa a ser una sola línea: `Alarma cerrada automáticamente por excepción: <ID>`. Antes repetía el cliente, la alarma y el host, datos que ya están en el propio ticket.
- **El ID de la Excepción Viaja como Dato, no como Texto:** `_verificarExcepcion` ahora devuelve `idExcepcion` además del `log`. El cierre usa el ID crudo en lugar de rasparlo del log de Slack, que está escrito con markdown y para otro destinatario. Se eliminó el saneo de asteriscos, que existía sólo por eso.

## [10.5.2] - 2026-08-11

### Fixed
- **Alarmas sin POD Imposibles de Silenciar:** Las reglas de Excepciones viven en hojas por POD (`Excepciones WPC`, `Excepciones POD 1`, …) y lo primero que validan es que el POD del ticket coincida con el de la hoja. Si Jira no traía el POD en el custom field, el ticket quedaba como `POD Desconocido` y **ninguna** regla podía matchearlo: la alarma era imposible de silenciar por más que la excepción estuviera bien cargada. Ahora, cuando falta el custom field, el POD se toma de la columna **POD de la hoja Clientes**, que ya declaraba ese dato (lo usaba `actualizarDropdownsClientes` para armar los dropdowns) pero se descartaba al construir los mapeos. Si Jira sí trae el POD, manda Jira: el respaldo nunca lo pisa.
- **`DataRepository.mapaPodsClientes`:** Nuevo mapeo código de proyecto → POD (Columna A → Columna C de la hoja Clientes).

## [10.5.1] - 2026-08-11

### Fixed
- **El Comentario de Cierre era Visible para el Cliente:** Los tickets viven en Jira Service Management y el cliente ve el portal, por lo que el comentario que dejaba el cierre automático se publicaba como *respuesta al cliente*, exponiéndole el detalle interno de por qué silenciamos su alarma. Ahora se crea siempre como **nota interna**.
  - La vía principal es la API de Service Desk, que expone `public` como campo de primer orden y lo devuelve en la respuesta: no alcanza con un `2xx`, se **verifica** contra lo que Jira contestó que el comentario quedó privado.
  - Como respaldo (por si el proyecto no fuera un service desk) se usa la API v3 marcando la propiedad `sd.public.comment` como interna.
  - `comentarTicket()` pasó a llamarse `comentarTicketInterno()` y **no acepta comentar en público**: si no se puede garantizar que la nota sea interna, no se comenta nada. En el caso límite de que Jira igual lo cree público, se avisa y no se reintenta, para no dejar dos comentarios sin poder borrar el que ya quedó publicado.

## [10.5.0] - 2026-08-11

### Added
- **Cierre Automático de Alarmas Silenciadas:** Hasta ahora "silenciar" significaba únicamente omitir la alarma del resumen del POD: el ticket quedaba abierto en Jira sin dueño. Ahora, cuando una alarma matchea una regla de Excepciones, además se transiciona a *Cerrada* y se le deja un comentario con el ID de la excepción que la silenció, para que quede trazable quién la cerró y por qué. Se controla con `Config.CERRAR_ALARMAS_SILENCIADAS`.
- **Selección de Transición por Workflow, no por ID:** El cierre no hardcodea el ID de la transición. Se listan las transiciones que el workflow ofrece para el ticket y se elige por nombre (`Cerrar Alarma`) o, si lo renombraron, por el nombre del estado destino (`Cerrada`); ambos configurables en `Config.JIRA_TRANSICION_CIERRE`. Esto permite que proyectos distintos (SBM, SBDER, …) con workflows distintos funcionen sin tocar código, y evita el riesgo de aplicar por ID una transición equivocada.
- **`JiraService.obtenerTransiciones()` y `JiraService.comentarTicket()`:** Primeras operaciones de escritura del proyecto contra Jira. El comentario se envía en formato ADF, como exige la API v3.
- **Tests del Cierre (`test/cierreJira.test.js`):** 9 casos sobre un doble de `UrlFetchApp` que verifican qué se llama, con qué payload y qué se hace ante cada respuesta de Jira. Se agregó `crearSandboxServicios()` al harness, separado del sandbox de parseo (donde la red sigue estando prohibida a propósito).

### Changed
- **Tolerancia a Fallos en el Cierre:** Ningún error de Jira puede interrumpir el envío del resumen a Slack. `cerrarTicket()` nunca lanza por un rechazo de la API: devuelve `{ cerrado, detalle }` y el resultado se informa como una línea extra en el log de excepciones del canal de Slack (✅ cerrado / ⚠️ con el motivo del fallo). Una alarma que no se pudo cerrar sigue estando correctamente silenciada.
- **El comentario es *best-effort*:** si el ticket se cerró pero el comentario falla, el cierre se da por bueno y el fallo queda en los logs. Cerrar es lo que importa.
- **Un ticket ya cerrado no se reintenta:** Jira sencillamente no ofrece la transición de cierre, y ese caso se distingue de un error real (el detalle lista las transiciones que sí estaban disponibles).
- **`Main.js` Desduplicado:** Los dos bloques idénticos que recorrían `alarmasSilenciadas` (el del disparador principal y el de la guardia) se unificaron en `_procesarAlarmasSilenciadas()`. `disparadorPrincipal_Local` queda deliberadamente afuera: es una simulación y no debe cerrar tickets ni postear en Slack.

## [10.4.0] - 2026-08-10

### Added
- **Arquitectura Multi-Parser (Strategy + Chain of Responsibility):** Se introdujo `AlarmParserRegistry.js`, un registro de estrategias de parseo que permite soportar varios formatos de alarma en paralelo. Cada dialecto vive en su propio archivo bajo `core/parsers/` y expone un contrato mínimo (`puedeParsear` / `parsear`) devolviendo siempre el mismo **modelo canónico**. Gracias a eso, el motor de Excepciones, el agrupado y `MessageFormatter.js` no necesitan saber de qué formato vino la alarma. Agregar un formato nuevo ya no requiere tocar `AlarmProcessor.js`.
- **Soporte para el Formato Estandarizado Nuevo (vROps / Aria Operations):** Se implementó `VropsStandardParser.js`, capaz de interpretar las alarmas que el equipo nuevo envía con descripciones estructuradas del tipo `Etiqueta: valor`. Extrae correctamente el objeto afectado, vCenter, Cluster, Datacenter, Descripción, Recomendación, Health Status y las latencias de vSAN Stretched Cluster.
- **Catálogo Declarativo de Categorías:** Las "Categorías" del formato nuevo (`Host`, `vSAN Cluster`, `Capacity Disk`) se declaran como datos en `VropsCategorias.js`, no como código. Sumar una categoría futura (Datastore, Virtual Machine, etc.) es agregar una entrada al array: no se escribe lógica nueva ni se duplica parseo.
- **Suite de Tests de Regresión:** Se incorporó `test/` con *golden tests* ejecutables en Node (`npm test`). Congelan la salida exacta de 14 casos del formato viejo para garantizar que ningún refactor futuro los altere, cubren 7 casos del formato nuevo, y validan 9 escenarios del motor de Excepciones sobre ambos dialectos. Se agregó `.claspignore` para que esta carpeta nunca se suba a Apps Script.

### Fixed
- **Target Basura en Alarmas del Formato Nuevo:** Las alarmas con los prefijos `9x5 - Operations - `, `9x5 - vCenter - ` y `24x7 Wetcom - ` estaban llegando a Slack con el prefijo interpretado como si fuera el recurso afectado (Ej: `Host: 9x5 - Operations`). El ruteo por estructura de la descripción corrige el problema de raíz.
- **Alarmas Nuevas Reportadas como Desconocidas:** El prefijo del summary impedía cruzar el nombre contra la hoja *Tipos de Alarmas*, por lo que toda alarma del formato nuevo aparecía como `Alarma desconocida [...]`. Ahora el prefijo se remueve (de forma configurable vía `Config.PREFIJOS_SOBRE_ALARMA`) antes del cruce, contemplando además el punto final que Jira agrega y la planilla no tiene.
- **Colapso de Alarmas bajo el Placeholder "Configurar en Excel":** Las filas de la planilla dadas de alta pero aún sin traducir devolvían literalmente el texto `Configurar en Excel` como nombre de alarma, lo que agrupaba decenas de alarmas distintas bajo un mismo ítem en Slack. Ahora se detecta ese placeholder (`Config.PLACEHOLDER_TIPO_ALARMA`), se muestra el nombre original de la alarma y se deja un warning. Al completar la columna B de la planilla, la traducción aplica sola sin tocar código.
- **Variables de vROps sin Resolver:** Los campos cuya variable no resuelve y llegan literales (Ej: `${VMWARE|HostSystem|summary|parentCluster}`) se descartan en lugar de publicarse como si fueran datos reales.
- **Alarmas Nativas de vCenter Reenviadas con Prefijo:** Los tickets del tipo `9x5 - vCenter - alarm.StorageConnectivityAlarm` llegaban a Slack como `Alarma desconocida [vCenter - alarm]`, porque la expresión regular del formato histórico cortaba el nombre en el primer punto. Ahora el prefijo se remueve también en el camino legacy.
- **Detalle Perdido en Alarmas Reenviadas:** En estos tickets el summary trae únicamente el ID de la alarma y el texto legible quedó en la sección `Description:` del cuerpo. Se agregó un segundo intento de resolución que reutiliza el mismo extractor sobre esa sección. Gracias a eso, la alarma vieja y la nueva resuelven al **mismo** nombre de la planilla (Ej: `vSAN Health Test`, `Perdida de redundancia de storage`), se agrupan juntas en Slack y siguen pasando por sus `AlarmFormatters` de siempre. No hace falta cargar filas nuevas en *Tipos de Alarmas*.
- **Falsos Positivos que se Colaban tras Corregir el Prefijo:** Las alarmas `Falso positivo - Wetcom` se venían filtrando de rebote (el nombre no se encontraba y el texto quedaba embebido en `Alarma desconocida [...]`). Al resolverse bien el nombre ese efecto colateral desaparecía y se habrían publicado. El descarte ahora evalúa también el summary crudo.

- **Detalle Perdido por el Aplanado de ADF (Producción):** La sección `Description:` se buscaba anclada a un salto de línea, pero Jira une los párrafos de nivel superior de la description con un **espacio**, por lo que un cuerpo que en la UI se ve en varias líneas puede llegar como un único renglón. En producción esto hacía desaparecer el detalle de las alarmas `9x5 - vCenter -`. El anclaje ya no depende de saltos de línea.
- **Placeholder Numerado en la Planilla:** La detección del texto `Configurar en Excel` era por coincidencia exacta y no cubría las variantes numeradas reales de la hoja (`Configurar en Excel 2`), por lo que ese texto igual llegaba a Slack como nombre de alarma. Ahora la comparación es por prefijo.

### Added
- **Deduplicación por Cobertura Contratada:** Cuando la misma alarma sobre el mismo objeto entra por los dos canales (las reglas de `9x5` y `24x7` disparan sobre el mismo evento), se informa una sola vez. El orden de preferencia se configura en `Config.PRIORIDAD_COBERTURA`. La identidad se calcula con cliente + POD + alarma + objeto afectado, deliberadamente **sin** vCenter ni Cluster, porque la copia del canal 24x7 trae menos datos de ubicación y de otro modo nunca se reconocerían como la misma alarma. Si el objeto afectado no pudo identificarse, no se deduplica: perder una alarma es peor que verla repetida. Los duplicados de la misma cobertura se siguen agrupando como siempre, en un ítem con su rango de fechas.
- **Soporte de la Variante en Prosa (canal 24x7):** El canal `24x7 Wetcom` no envía campos rotulados sino una frase (`Alerta reportada en <objeto> ubicado en <cluster>. Descripcion: ...`). Se reconoce como una variante legítima del formato nuevo y se le extraen objeto, cluster y descripción.
- **`AlarmEnvelope.js`:** Desensobra el prefijo del summary y expone la cobertura contratada y el origen emisor, dato que antes se descartaba. La cobertura se usa para deduplicar y, opcionalmente, para rotular cada alarma (`Config.MOSTRAR_ROTULO_COBERTURA`, apagado por defecto).
- **Alarmas sin Descripción (`Config.ALARMAS_SIN_DESCRIPCION`):** Lista de alarmas cuyo título ya es suficientemente explícito y cuya descripción de vROps (un párrafo genérico y largo) no se publica. Acepta tanto el nombre traducido de la planilla como el original en inglés. Además, la descripción se omite automáticamente cuando repite el nombre de la alarma.

### Changed
- **`AlarmProcessor.js` Adelgazado:** Se extrajeron `_debeExcluirse()` e `_inferirEtiquetaTarget()` como políticas transversales aplicables a cualquier dialecto. La lógica de parseo del formato viejo se movió sin modificaciones a `LegacyVCenterParser.js`, que además queda registrado como **fallback universal**: si ningún parser específico reconoce un ticket, el comportamiento es idéntico al histórico.
- **Robustez ante el ADF de Jira:** El parser del formato nuevo no depende de saltos de línea. Según cómo la automatización arme la descripción, Jira puede entregarla multilínea o colapsada en un único renglón; el troceo por etiquetas conocidas funciona igual en ambos casos.

## [10.3.0] - 2026-07-16

### Added
- **Filtro de Excepciones por Datastore:** Se introdujo la capacidad de filtrar excepciones utilizando el nuevo campo `Datastore`. El motor examina inteligentemente tanto el `Target` principal de la alarma como el `Cuerpo` descriptivo de la misma buscando coincidencias (Ej: *Affected datastores: CTALLE...*), permitiendo silenciar infraestructura de almacenamiento específica sin importar en qué host detone el fallo.

## [10.2.0] - 2026-06-30

### Added
- **Motor de Excepciones Inteligente V2:** Se reconstruyó por completo el sistema de silenciamiento de alarmas (Excepciones). La nueva matriz soporta 9 columnas y evaluación condicional estricta.
- **Automatización de Dropdowns Dinámicos (onChange/onEdit):** Se eliminó el obsoleto y lento `onEdit` celda por celda. En su lugar, el script monitorea pasivamente los cambios estructurales. Al editar la hoja `Clientes` o agregar un nuevo POD, se regeneran instantáneamente las validaciones de datos para columnas enteras.
- **Arquitectura de Excepciones Multi-hoja:** Las excepciones ahora se encuentran separadas lógicamente en múltiples hojas (Ej: `Excepciones POD 1`, `Excepciones WPC`). El motor de lectura y limpieza descubre estas hojas dinámicamente basándose en su nomenclatura, eliminando la necesidad de una columna "POD".
- **Limpieza Automatizada de Excepciones:** Se introdujo la función `limpiarExcepcionesVencidas` en `Tools.js`. Este script escanea todas las matrices de excepciones (múltiples hojas) y elimina silenciosamente de Google Sheets las filas cuya fecha/hora de expiración haya caducado, manteniendo la base de datos libre de basura.
- **Canal de Testing Exclusivo para Excepciones:** Las alarmas filtradas por el motor ya no se ignoran por completo, sino que generan un log detallado (`Alarma silenciada por Excepción ID...`). Estos logs se despachan directamente al webhook `SLACK_WEBHOOK_TESTING` (Canal de Testing) para dejar un registro de auditoría sin hacer ruido en el NOC.

### Changed
- **Lógica Dinámica de Campos (Cluster/Host):** El motor de excepciones se ajustó para heredar la inteligencia de `AlarmFormatters.js`. Si una alarma etiqueta dinámicamente a un recurso como "Cluster" (Ej: Alarmas de vSAN), la regla de excepción `Campo = Cluster` lo matcheará automáticamente, evitando falsos negativos.
- **Etiquetas de Log Dinámicas con Enlaces a Jira:** Las notificaciones enviadas a Slack sobre alarmas silenciadas ahora especifican dinámicamente si el recurso omitido es un `Host`, `Cluster`, o `Datastore`. Además, el encabezado incluye un hipervínculo clickeable que redirige directamente al ticket original en Jira (`https://wetcom.atlassian.net/browse/SBM-XXXX`).

### Fixed
- **Prevención de Inyección HTML (Seguridad):** Se parcheó una vulnerabilidad severa detectada en `MessageFormatter.js` que permitía Cross-Site Scripting / Inyección de Etiquetas HTML rotas provenientes de los campos dinámicos de Jira (Summary, Target, etc) hacia la WebApp (Correos Electrónicos). Se implementó un filtro de saneamiento `_escapeHTML` en todas las variables insertadas.
- **Falsos Negativos por Espacios/Prefijos:** Se normalizó la evaluación de campos cruzados. El script ahora detecta automáticamente y elimina prefijos como "POD" y espacios en blanco al momento de evaluar si una alarma de Jira coincide con una regla de Excepción, resolviendo un bug donde `"POD 5"` fallaba al compararse contra `"5"`.

## [10.1.0] - 2026-06-24
- **UI Dinámica de Slack:** Los enlaces de generación de correos fueron agrupados al final del mensaje del POD, debajo de la pregunta consultiva. El texto del botón ahora incluye el nombre del cliente explícito (Ej: `Generar correo para Banco Macro`) para mejorar la experiencia de usuario y evitar clics erróneos.
- **Variables de Entorno en Drive:** Se extrajo el ID hardcodeado de la carpeta de Google Drive en `Config.js`. Ahora utiliza un getter dinámico que lee `CARPETA_BORRADORES_PROD` o `CARPETA_BORRADORES_TESTING` desde el *PropertiesService*, garantizando aislamiento total entre desarrollos y el entorno productivo.

### Fixed
- **Bugs Post-Refactor (Clean Code):** Se corrigieron un par de llamadas huérfanas en `WebApp.js` que referenciaban a la antigua función en inglés `DataRepository.getMappings()`.

## [10.0.0] - 2026-06-23

### Added
- **Estandarización de Idioma (Clean Code):** Se refactorizó todo el código fuente para eliminar el "Spanglish", traduciendo variables, funciones y métodos internos al Español. El código ahora mantiene una convención uniforme (Ej: `sendNotification` a `enviarNotificacion`).
- **Sistema Dual de Caché y Drive:** Se implementó `WebApp.js` para servir borradores de correo HTML a los operadores mediante enlaces inyectados en Slack.
- **Deduplicación de Alta Velocidad (MD5):** El almacenamiento en Drive ahora utiliza un hash MD5 derivado del cuerpo del correo (`payloadBorrador`) para identificar y prevenir la regeneración de archivos idénticos durante un aluvión de alarmas repetidas.
- **Prevención de Fallos Multi-Cuenta (OAuth):** La WebApp se configuró estricta en modalidad `USER_DEPLOYING` y enrutamiento interno (`/a/macros/wetcom.com/`), resolviendo los problemas de permisos al abrir los enlaces con cuentas de Google personales activas en el navegador.

## [7.8.0] - 2026-06-16

### Added
- **Estructura de Carpetas (SOLID):** Se reorganizó la estructura del repositorio local separando los archivos en carpetas lógicas (`config/`, `core/`, `services/`, `utils/`) logrando una mejor organización visual en GitHub y en el editor de Apps Script mediante el parseo de barras de Clasp.

## [7.6.1] - 2026-06-16

### Fixed
- **Fallo Silencioso (Main.js):** Se complementó el manejo de errores riguroso de `v7.6.0` agregando un `throw new Error` definitivo al final de `disparadorPrincipal_conAPI` en `Main.js`. Ahora, si ocurre un error catastrófico (como caída de Slack), el script de Google Workspace lo considerará explícitamente como "Fallido" y alertará al NOC por email mediante los triggers del sistema.

## [7.6.0] - 2026-06-16

### Added
- **Parser Aislado (`AlarmParser.js`):** Se extrajo exitosamente toda la lógica pesada de parsing (Regex, interceptores) que residía en `AlarmProcessor.js` hacia un nuevo módulo de parseo puro y dedicado (`AlarmParser.js`), cumpliendo estrictamente con el Principio de Responsabilidad Única (SRP).

### Changed
- **Manejo de Errores Slack:** Se modificó `SlackService.js` para que ante cualquier error HTTP o caída de red de Slack, se arroje (throw) una excepción explícita hacia la capa superior (`Main.js`), permitiendo que los Triggers de Google Apps Script registren la falla adecuadamente y notifiquen al administrador, eliminando el fallo silencioso.

### Removed
- **Deuda Técnica Eliminada:** Se eliminaron las reglas de negocio estáticas (hardcodeadas por retrocompatibilidad) para `vsan` y `hardware sensor status` que seguían vivas en el código. Ahora el motor confía al 100% en los mapeos dinámicos gestionados directamente desde la planilla "Tipos de Alarmas".

## [7.5.0] - 2026-06-16

### Added
- **Soporte Multi-entorno:** Se implementó una bandera `ENVIRONMENT` en `Config.js` que permite alternar la ejecución del script entre Producción (`PROD`) y Pruebas (`TESTING`), evitando el envío accidental de falsas alarmas al cliente durante tareas de desarrollo.
- **Migration Script:** Se añadió `Migration.js`, una función temporal diseñada para ejecutarse una única vez y automatizar el traspaso seguro de las credenciales viejas hacia la nueva nomenclatura sin pérdida de datos.

### Changed
- **Renombramiento Semántico de Propiedades:** Las variables globales de *PropertiesService* fueron refactorizadas para adoptar estándares limpios:
  - `JIRA_AUTH_TOKEN_BASE64` ahora es `JIRA_AUTH_TOKEN`
  - `SLACK_WEBHOOK_URL_VM` ahora es `SLACK_WEBHOOK_TESTING` (reservado para el canal antiguo)
  - Se introdujo `SLACK_WEBHOOK_PROD` para el nuevo endpoint oficial.

## [7.4.1] - 2026-06-16

### Fixed
- **Indentación Escalonada:** Se incrementó la sangría (tabulación) de las propiedades `Cluster`, `Target/Host` y los detalles de la alarma para generar una jerarquía visual escalonada respecto al `vCenter` superior, facilitando la lectura en cascada de los recursos afectados.

## [7.4.0] - 2026-06-12

### Added
- **Clasificación Inteligente de Objetivos (Smart Targeting):** Se integró el uso avanzado del Patrón Strategy (`AlarmFormatters.js`) y una nueva heurística de respaldo en `AlarmProcessor.js` para deducir automáticamente si un `Target` es un `Host`, un `Cluster`, o un `Datastore`. 
- **Limpieza de UX (Anti-ruido Visual):** El script ahora omite y oculta de forma dinámica cualquier propiedad de la alerta (vCenter, Cluster, o Target) cuyo valor sea "Desconocido", así como también evita redundancias (Ej. ocultando el campo genérico "Cluster" si la alerta ya está apuntando explícitamente a un Cluster en su propiedad Target).

## [7.3.4] - 2026-06-12

### Changed
- **Agrupamiento Profundo (Summaries):** Se mejoró el algoritmo de agrupar por origen. Ahora el script detecta automáticamente si múltiples `Hosts/Targets` bajo el mismo `vCenter` y `Cluster` comparten exactamente los mismos detalles descriptivos de alarma (Summaries). De ser así, apila todos los `Host/Target` y redacta la descripción *una única vez* debajo de ellos, reduciendo masivamente el ruido visual.

## [7.3.3] - 2026-06-12

### Changed
- **Agrupamiento por Origen:** La lógica de `MessageFormatter.js` fue completamente reestructurada para agrupar visualmente los Hosts bajo un único `vCenter` y `Cluster`. Esto elimina la redundancia masiva de texto cuando un mismo entorno sufre alertas en múltiples servidores de manera concurrente.
- Se deshizo la adición de la línea divisoria ASCII final por requerimiento del usuario.

## [7.3.2] - 2026-06-12

### Fixed
- **Ajustes Estéticos (Items):** Las viñetas de los elementos anidados se unificaron usando el carácter de punto sólido (`•`) para mantener idéntica compatibilidad con el estilo visual de la versión anterior a pedido del usuario.
- Se agregó una línea separadora ASCII (`━━━━━━━━━━`) adicional antes de la sección de preguntas (Despedida de la alerta).

## [7.3.1] - 2026-06-12

### Fixed
- **Slack Markdown:** Se removió la envoltura de bloque de código (` ``` `) en `SlackService.js` que estaba rompiendo la interpretación del texto en negrita y cursiva.
- **Ajustes Estéticos:** Se removieron los emojis, se simplificó el encabezado de "Alarmas - POD X" a "POD X", y se restauraron las viñetas de puntos y guiones clásicos a pedido del liderazgo.

## [7.3.0] - 2026-06-12

### Changed
- **Simulación Visual "Premium":** Tras rechazar Block Kit por limitaciones de copy-paste del workflow humano, `MessageFormatter.js` fue rediseñado usando una combinación de texto Markdown avanzado, separadores ASCII (`━━━━━━━━━━`) y Emojis para mantener la compatibilidad 100% nativa con el portapapeles sin perder la jerarquía y estética modernas.

## [7.2.0] - 2026-06-10

### Added
- **Contexto de Origen Expandido:** Las alarmas ahora extraen explícitamente el `vCenter`, `Cluster` y `Host/Target` directo desde la descripción nativa de Jira.
- **Jerarquía Visual de Origen:** El bot de Slack ahora indenta y dibuja la tríada de origen (vCenter, Cluster, Host) estructurando mejor la lectura para el NOC en `MessageFormatter.js`.

### Changed
- Refactorizado el método `_extraerTarget` en `AlarmProcessor.js` hacia `_extraerOrigen`, pasando de devolver un string crudo a devolver un objeto de dominio JSON.

## [7.1.0] - 2026-06-08

### Added
- **Formateador Agregado (Strategy):** Implementado `AlarmFormatters.js` aislando las reglas únicas de cada alarma, evitando acoplamiento y cumpliendo el Principio Abierto/Cerrado.
- **Parser de Documentos Jira (ADF):** Nuevo motor recursivo en `JiraService.js` diseñado para iterar Atlassian Document Format, asegurando la extracción incondicional de texto oculto en listas de viñetas, tablas, etc.
- **Manejo de Errores Slack:** Implementado `muteHttpExceptions: true` logrando capturar y detallar explícitamente cuando Slack devuelve códigos 400 o 500 al script.
- **Formateo Específico WPC:** Estructura de saludo automatizada en Slack exclusiva para el POD WPC con su respectiva mención.

### Changed
- **Límites de Búsqueda:** La búsqueda REST hacia Jira ahora incorpora la paginación base solicitando hasta un máximo de 100 resultados de forma forzada (`maxResults: 100`).
- **Simplificación de Formatters:** Refactor total de `MessageFormatter.js` eliminando sentencias lógicas harcodeadas. Es 100% agnóstico al tipo de alerta.
- **Desacoplamiento Local:** Se migró de variables globales hacia integraciones profundas al Google Workspace utilizando el almacén encriptado (`PropertiesService`).

### Removed
- **Hardcodeo de Seguridad:** Eliminación completa de `SLACK_WEBHOOK_URL_VM`, `JIRA_AUTH_TOKEN_BASE64` en el código.

## [7.0.2] - 2026-06-08

### Added
- **Herramienta de Debug:** Nueva función `debugCamposJira_Runner` en `Main.js` para extraer y mapear todos los Custom Fields nativos de Jira a una pestaña de Sheets temporal.

### Changed
- **Filtro Falsos Positivos:** El filtro de exclusión en `AlarmProcessor.js` fue reescrito para ser *case-insensitive* y buscar "falso positivo" en cualquier parte del nombre, evitando bugs de coincidencia exacta.

### Removed
- **Independencia de Hoja PODs:** Se eliminó por completo la dependencia del script hacia la pestaña "PODs". La asignación ahora se procesa nativamente extrayendo el `customfield_12331` de la API de Jira y limpiando el prefijo.

## [7.0.1] - 2026-06-08

### Fixed
- **Parseo de Expresiones Regulares:** Resuelto bug crítico en `AlarmProcessor.js` que causaba que alarmas con prefijos como `[[alarm] StorageConnectivityAlarm]` devolvieran `"Alarma desconocida"`. Las Regex fueron normalizadas y desacopladas del anclaje estricto de inicio (`^`) logrando máxima tolerancia a basura proveniente del summary de Jira.
- **Hoja Tipos de Alarmas:** Se limpiaron los datos en la nube removiendo 35 "Falsos Positivos" y 46 repeticiones sucias finales (`]`). Se aseguró el formato UTF-8 BOM para soporte correcto de tildes en Excel de Windows.

## [7.0.0] - 2026-06-05

### Added
- **Arquitectura SOLID:** Nueva estructura de proyecto modularizada separando el monolito en 6 responsabilidades exclusivas.
- **Módulos Independientes:** 
  - `Config.js` (Variables de entorno)
  - `JiraService.js` (Requests a API v3)
  - `DataRepository.js` (Lectura optimizada de Sheets en O(1))
  - `AlarmProcessor.js` (Motor de reglas Regex / Interceptores)
  - `MessageFormatter.js` (Agrupador lógico por POD/Cliente)
  - `SlackService.js` (Webhooks)
  - `Main.js` (Controller principal)
- Configuración de CLI `clasp` lista para versionar el código localmente de forma profesional.

### Changed
- Reescritura absoluta del conector con Jira. Se abandonó el método de iteración por array 2D y ahora se extrae y parsea el JSON original nativo de la REST API.

### Removed
- Eliminado el archivo `Code.js` obsoleto, difícil de leer y carente de buenas prácticas de programación.

## [6.7.0] - Pre-Refactorización

### Info
- Última iteración del código legacy funcionando en producción. El script era 100% monolítico con toda la lógica mezclada en una sola sábana gigante de funciones con parseo rudimentario.
