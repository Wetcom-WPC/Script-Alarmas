# Automatización de Alarmas: Jira a Slack

**Navegación Rápida:** [Ver Changelog (Historial de Versiones)](CHANGELOG.md)

Este proyecto es un script de **Google Apps Script (GAS)** que se encarga de extraer de forma automática las alarmas (tickets) generadas en Jira, procesarlas, cruzarlas con la base de datos de clientes/PODs alojada en Google Sheets, y enviar un resumen consolidado por canal de Slack.

## Arquitectura del Proyecto (SOLID)

Para garantizar calidad *Enterprise*, el código original ha sido dividido en módulos especializados con responsabilidad única.

### 1. `Config.js`
Maneja las constantes estáticas, entornos y la configuración global del proyecto.
* **Entornos (`TESTING` / `PRODUCCION`):** El entorno se lee de la Script Property `ENTORNO`, **no** de una constante en el código. Así el mismo commit corre en `alarmas-testing` y en `alarmas-produccion` sin editar nada, y no existe el riesgo de pushear el proyecto productivo con la bandera apuntando a pruebas (o al revés). Determina el webhook de Slack, el canal de logs, la carpeta de Drive y si el correo de guardia lleva copia a `wpc@`.
  * Si la property falta o trae un valor no reconocido, **se asume `TESTING`**: ante una configuración rota preferimos no publicar en los canales productivos ni escribir en los tickets de los clientes. Queda un aviso en el Logger. El único punto donde se decide esto es `Config.esProduccion()`.
* **Seguridad:** Extrae los tokens secretos y claves de entorno (`JIRA_AUTH_TOKEN`, `SLACK_WEBHOOK_PROD`, `CARPETA_BORRADORES_PROD`, etc) del `PropertiesService` seguro de Google.

### 2. `JiraService.js`
Se encarga de la conexión con Atlassian Jira.
* Realiza consultas paginadas a la **API REST v3 de Jira**.
* Implementa un **Parser Recursivo de ADF (Atlassian Document Format)** que garantiza extraer texto oculto dentro de tablas o viñetas.
* **Cierre automático de alarmas silenciadas:** cuando una alarma cae en una regla de Excepciones, además de omitirla del resumen se transiciona el ticket a *Cerrada* y se le deja una **nota interna** con el motivo (nunca una respuesta al cliente: el cliente ve el portal de Service Management). La privacidad no se asume, se verifica contra la respuesta de Jira; si no se puede garantizar, no se comenta nada. La transición no se hardcodea por ID: se listan las disponibles del workflow y se elige por nombre (`Cerrar Alarma`) o por estado destino (`Cerrada`), configurable en `Config.JIRA_TRANSICION_CIERRE`. Así funciona aunque cada proyecto (SBM, SBDER, …) tenga su propio workflow. Se apaga con `Config.CERRAR_ALARMAS_SILENCIADAS`.
  * Ningún fallo de Jira interrumpe el envío del resumen: si el cierre no se puede hacer, la alarma queda silenciada igual y el motivo se informa en el canal de logs.

### 3. `DataRepository.js`
Actúa como la base de datos en RAM.
* Lee las pestañas **Clientes** y **Tipos de Alarmas** transformándolas en diccionarios para procesamiento O(1).

### 4. `AlarmParser.js`
El motor de disección de Strings del **formato histórico**.
* Aplica interceptores y expresiones regulares complejas para adivinar nombres de alarmas y extraer "vCenter", "Cluster" y "Target" limpios de los bloques de descripción de Jira.
* Expone además `resolverNombreAlarma()`, el cruce contra la hoja *Tipos de Alarmas* que comparten **todos** los parsers, para que la resolución del nombre sea idéntica en cualquier formato.

### 4.b `core/parsers/` (Strategy + Chain of Responsibility)
La capa que permite soportar **varios formatos de alarma a la vez**. Distintos equipos envían las alarmas con estructuras distintas; cada estructura ("dialecto") se resuelve con su propia estrategia.

* **`AlarmParserRegistry.js`** — Le pregunta a cada estrategia si reconoce el ticket y delega en la primera que dice que sí, ordenadas por prioridad. Define el **modelo canónico** que todas devuelven, de modo que el resto del sistema no sabe ni le importa de qué formato vino la alarma.
* **`LegacyVCenterParser.js`** — Envuelve a `AlarmParser` sin modificarlo. Tiene prioridad `0` y acepta cualquier ticket: es el **fallback universal**, garantía de que lo que no se reconoce se comporta exactamente como siempre.
* **`VropsStandardParser.js`** — Formato estandarizado nuevo (vROps / Aria Operations), con descripciones estructuradas `Etiqueta: valor`.
* **`VropsCategorias.js`** — Catálogo **declarativo** de las Categorías del formato nuevo (`Host`, `vSAN Cluster`, `Capacity Disk`...). Agregar una categoría es agregar una entrada al array, sin escribir lógica.

> El ruteo entre parsers se decide por la **estructura de la descripción**, nunca por el prefijo del summary. Así, si el equipo emisor cambia sus prefijos, el ruteo no se rompe.

### 5. `AlarmProcessor.js`
El orquestador de reglas de negocio.
* Agrupa las alarmas validadas. Delega el parseo al `AlarmParserRegistry` y, sólo para el formato histórico, el formateo lógico a las estrategias de `AlarmFormatters`.
* Concentra las **políticas transversales** a todos los dialectos: `_debeExcluirse()` (tipos ignorados por diseño y falsos positivos) e `_inferirEtiquetaTarget()` (heurística por prefijo para deducir si un Target es `Host`, `Cluster` o `Datastore`).

### 6. `AlarmFormatters.js` (Strategy Pattern)
* Encapsula las **Reglas Específicas** de limpieza para cada tipo de alerta. Devuelve objetos JSON inyectando `targetLabel` inteligente para que el procesador sepa con qué tipo de recurso está lidiando.

### 7. `MessageFormatter.js`
Agnóstico, encargado puramente de la capa de renderizado visual para Slack.
* Redacta el mensaje en formato "Plano Premium": Utiliza viñetas, negritas e indentación escalonada dinámica (vCenter -> Cluster -> Target -> Summary) para generar reportes fáciles de leer y copiar en el NOC.
* Limpia de forma dinámica cualquier valor catalogado como "Desconocido" u ocultando propiedades redundantes.

### 8. `SlackService.js`
El conector saliente.
* Envía el HTTP POST a Slack y arroja excepciones explícitas al servidor si detecta errores de red (evita fallos silenciosos).

### 9. `Main.js`
El entrypoint para Google Apps Script.
* Procesa todo en un entorno seguro y ofrece opciones para imprimir localmente en vez de ir a Slack (Modo Prueba Local).

### 10. `WebApp.js`
Punto de entrada HTTP (doGet) para la aplicación web integrada.
* Actúa como servidor web devolviendo el HTML del borrador del correo generado para el cliente.
* Lee los datos desde Google Drive o desde el `CacheService` de manera segura, utilizando validación por hash MD5.

---

## Despliegue y Configuración

1. **Gestión de Entornos (Pruebas Locales sin molestar a Clientes):**
   El entorno **no se toca en el código**. Se define en la Script Property `ENTORNO` de cada proyecto de Apps Script: `TESTING` en `alarmas-testing`, `PRODUCCION` en `alarmas-produccion`. Se aceptan además `PROD` y `PRODUCCIÓN` como sinónimos. Cualquier otro valor (o su ausencia) se interpreta como `TESTING`.

2. **Propiedades Seguras (Secrets):**
   Viven en *Configuración de Proyecto > Propiedades de Script* dentro del IDE web de Apps Script. Cada proyecto tiene su propio juego:

   | Property | Para qué |
   |---|---|
   | `ENTORNO` | `TESTING` o `PRODUCCION` |
   | `JIRA_AUTH_TOKEN` | Basic auth de la API de Jira (lectura + transición + comentario) |
   | `SLACK_WEBHOOK_PROD` / `SLACK_WEBHOOK_TESTING` | Canal del resumen de alarmas |
   | `SLACK_WEBHOOK_LOGS_PROD` / `SLACK_WEBHOOK_LOGS_TESTING` | Canal de logs de excepciones y del cierre automático |
   | `SLACK_WEBHOOK_GUARDIA` | Canal de la guardia nocturna |
   | `CARPETA_BORRADORES_PROD` / `CARPETA_BORRADORES_TESTING` | Carpeta de Drive para los borradores |

   Sólo se leen las que corresponden al entorno activo, así que un proyecto no necesita cargar las del otro.

3. **Uso local con Clasp:** 
   ```bash
   clasp pull   # Bajar la versión en producción actual (¡Hacer siempre antes de empezar!)
   clasp push   # Subir tus cambios al servidor de Google
   ```

## Cómo agregar un nuevo Tipo de Alarma

1. **Traducción Simple:** Ve a la hoja de Google Sheets **"Tipos de Alarmas"** y agrega el nombre en inglés del lado izquierdo, y el nombre comercial del lado derecho. (Recuerda que ya no hay reglas hardcodeadas).
2. **Parsing Complejo:** Si la alarma tiene un nombre extrañísimo escondido en el summary, agrégale un regex interceptor en `AlarmParser.js`.
3. **TargetLabel Inteligente:** Si la alarma impacta un recurso extraño que no es un ESXi ni un Cluster, entra a `AlarmFormatters.js` y crea un strategy para que devuelva el `targetLabel` correcto.
