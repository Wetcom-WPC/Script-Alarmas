# Automatización de Alarmas: Jira a Slack

**Navegación Rápida:** [Ver Changelog (Historial de Versiones)](CHANGELOG.md)

Este proyecto es un script de **Google Apps Script (GAS)** que se encarga de extraer de forma automática las alarmas (tickets) generadas en Jira, procesarlas, cruzarlas con la base de datos de clientes/PODs alojada en Google Sheets, y enviar un resumen consolidado por canal de Slack.

## Arquitectura del Proyecto (SOLID)

Para garantizar calidad *Enterprise*, el código original ha sido dividido en módulos especializados con responsabilidad única.

### 1. `Config.js`
Maneja las constantes estáticas, entornos y la configuración global del proyecto.
* **Entornos (PROD/TEST):** Posee una bandera `ENVIRONMENT` para cambiar rápidamente a un webhook de pruebas y evitar notificaciones erróneas durante el desarrollo.
* **Seguridad:** Extrae los tokens secretos (`JIRA_AUTH_TOKEN`, `SLACK_WEBHOOK_PROD`) del `PropertiesService` seguro de Google.

### 2. `JiraService.js`
Se encarga de la conexión con Atlassian Jira.
* Realiza consultas paginadas a la **API REST v3 de Jira**.
* Implementa un **Parser Recursivo de ADF (Atlassian Document Format)** que garantiza extraer texto oculto dentro de tablas o viñetas.

### 3. `DataRepository.js`
Actúa como la base de datos en RAM.
* Lee las pestañas **Clientes** y **Tipos de Alarmas** transformándolas en diccionarios para procesamiento O(1).

### 4. `AlarmParser.js`
El motor de disección de Strings.
* Aplica interceptores y expresiones regulares complejas para adivinar nombres de alarmas y extraer "vCenter", "Cluster" y "Target" limpios de los bloques de descripción de Jira.

### 5. `AlarmProcessor.js`
El orquestador de reglas de negocio.
* Agrupa las alarmas validadas. Delega el parseo a `AlarmParser` y delega el formateo lógico a las estrategias de `AlarmFormatters`. Implementa heurísticas por prefijo para deducir si un Target es un `Host`, un `Cluster` o un `Datastore`.

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

---

## Despliegue y Configuración

1. **Gestión de Entornos (Pruebas Locales sin molestar a Clientes):**
   Abre `Config.js` y asegúrate de configurar `ENVIRONMENT: 'TESTING'` antes de empezar a programar.

2. **Propiedades Seguras:**
   Tus variables `JIRA_AUTH_TOKEN`, `SLACK_WEBHOOK_PROD` y `SLACK_WEBHOOK_TESTING` viven encriptadas en *Configuración de Proyecto > Propiedades de Script* dentro del IDE web de Apps Script.

3. **Uso local con Clasp:** 
   ```bash
   clasp pull   # Bajar la versión en producción actual (¡Hacer siempre antes de empezar!)
   clasp push   # Subir tus cambios al servidor de Google
   ```

## Cómo agregar un nuevo Tipo de Alarma

1. **Traducción Simple:** Ve a la hoja de Google Sheets **"Tipos de Alarmas"** y agrega el nombre en inglés del lado izquierdo, y el nombre comercial del lado derecho. (Recuerda que ya no hay reglas hardcodeadas).
2. **Parsing Complejo:** Si la alarma tiene un nombre extrañísimo escondido en el summary, agrégale un regex interceptor en `AlarmParser.js`.
3. **TargetLabel Inteligente:** Si la alarma impacta un recurso extraño que no es un ESXi ni un Cluster, entra a `AlarmFormatters.js` y crea un strategy para que devuelva el `targetLabel` correcto.
