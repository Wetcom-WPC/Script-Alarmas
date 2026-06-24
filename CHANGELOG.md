# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y el proyecto se adhiere a [Semantic Versioning](https://semver.org/).

## [10.1.0] - 2026-06-24

### Added
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
