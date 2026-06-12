# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y el proyecto se adhiere a [Semantic Versioning](https://semver.org/).

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
