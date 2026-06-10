# Automatización de Alarmas: Jira a Slack

🔗 **Navegación Rápida:** [📖 Ver Changelog (Historial de Versiones)](CHANGELOG.md) | [🤝 Guía de Contribución](CONTRIBUTING.md)

Este proyecto es un script de **Google Apps Script (GAS)** que se encarga de extraer de forma automática las alarmas (tickets) generadas en Jira, procesarlas, cruzarlas con la base de datos de clientes/PODs alojada en Google Sheets, y enviar un resumen consolidado por canal de Slack.

## 🏗️ Arquitectura del Proyecto

Para facilitar su mantenimiento, el código monolítico original se ha dividido en múltiples módulos enfocados en una única responsabilidad (Principios SOLID).

### 1. `Config.js`
Maneja las constantes estáticas y la configuración global del proyecto.
* **Propósito:** Evitar dejar credenciales o IDs importantes (como el `JIRA_FILTER_ID`) esparcidos por todo el código.
* **Seguridad:** Utiliza el método seguro `PropertiesService` para buscar claves de API. Las contraseñas (como tokens base64 o URLs de Webhooks) jamás deben escribirse en texto plano.

### 2. `JiraService.js`
Se encarga de la conexión con Atlassian Jira.
* Realiza consultas a la **API REST v3 de Jira** (ahora con paginación optimizada hasta 100 resultados).
* Extrae y formatea el JSON nativo para devolver un arreglo de objetos claros. Además, implementa un **Parser Recursivo de ADF (Atlassian Document Format)** que garantiza extraer todo el texto incluso si la alerta se origina escondida dentro de tablas o viñetas.

### 3. `DataRepository.js`
Actúa como la base de datos del script.
* Lee las pestañas **Clientes** y **Tipos de Alarmas** desde la planilla de Google Sheets activa.
* Transforma estas tablas en diccionarios (objetos de llave-valor en Javascript) para que el procesamiento sea instantáneo sin tener que iterar planillas completas.

### 4. `AlarmProcessor.js`
Es el "cerebro" central de ruteo y exclusión (Reglas Generales).
* **Extracción de Nombres:** Usa arreglos de expresiones regulares (Regex) llamados **interceptores** para deducir el tipo de alarma genérica si no es obvia.
* **Extracción del Target:** Revisa inteligentemente el "description" y el "summary" del ticket de Jira para obtener el target (host, datastore, etc.) como respaldo.

### 5. `AlarmFormatters.js`
Implementación del Patrón Strategy. 
* Encapsula las **Reglas Específicas** de limpieza para cada tipo de alerta compleja. Si una alarma necesita limpieza textual adicional (ej: caídas de host, redundancias de storage), la lógica vive exclusivamente acá en lugar de sobrecargar el procesador general.

### 6. `MessageFormatter.js`
Se encarga exclusivamente de la capa de presentación (Agnóstico).
* Agrupa de manera jerárquica todas las alarmas en el orden: `POD > Cliente > Tipo de Alarma > Target`.
* Construye arreglos de objetos JSON compatibles con la **API Block Kit de Slack** (Headers, Dividers, Sections), separando los envíos por POD para evitar superar el límite nativo de 50 bloques por mensaje.

### 7. `SlackService.js`
El conector saliente.
* Se responsabiliza puramente de enviar el Payload JSON al webhook de Slack mediante un HTTP POST, con una política de silenciado HTTP (`muteHttpExceptions`) que permite atrapar y detallar claramente errores de red como `400 Bad Request`.

### 8. `Main.js`
El orquestador general y punto de entrada.
* Contiene la función `disparadorPrincipal_conAPI()` que es la que se ejecuta manualmente desde el menú de Sheets o que se asigna a un "Trigger" automatizado de Apps Script basado en tiempo.
---

## 🚀 Despliegue y Pruebas

1. **Uso local con Clasp:** 
   El proyecto incluye configuración de `clasp` (`.clasp.json`). Puedes hacer modificaciones locales en tu editor favorito y subirlas al servidor usando:
   ```bash
   clasp push
   ```
   **⚠️ IMPORTANTE:** Antes de empezar a programar localmente, recuerda siempre ejecutar `clasp pull` para descargarte la última versión de la nube y asegurarte de no sobrescribir el código que otro miembro del equipo haya subido recientemente.

2. **Ejecución de Pruebas:**
   En la planilla de Google Sheets, ve a **Automatización de Alarmas > Ejecutar e Imprimir Local**. Esto procesará las alarmas reales y renderizará el crudo JSON de Block Kit en una ventana modal segura sobre la planilla, garantizando total seguridad y visualización durante el desarrollo sin disparar webhooks.

## 🛠️ Cómo agregar un nuevo Tipo de Alarma

1. Agrega el nombre exacto de la alarma y su "Traducción" en la hoja de cálculo **"Tipos de Alarmas"**.
2. Si el título que llega de Jira es muy distinto y complejo de interpretar mediante limpieza simple, dirígete a `AlarmProcessor.js` y añade un nuevo objeto al array `interceptors`.
3. Si la alarma requiere formateo de texto complejo (limpiar el summary o extraer solo una porción útil descartando ruido), abre el archivo `AlarmFormatters.js`.
4. En el diccionario `handlers`, crea una nueva función usando como llave (`key`) el nombre exacto de tu nueva alarma, y devuelve como respuesta un string (texto). El sistema la enlazará y le añadirá viñetas de forma automática sin tocar el código central.
