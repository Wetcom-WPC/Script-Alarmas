# Guía de Contribución para el Equipo

¡Bienvenido! Este repositorio gestiona el script de sincronización y procesamiento de alarmas entre Jira y Slack de WETCOM usando Google Apps Script. 

Para que el proyecto se mantenga prolijo, limpio y escalable con el tiempo (y evitar que vuelva a convertirse en un monolito inmanejable), te pedimos que sigas estos lineamientos si vas a tocar el código.

## 1. Configuración del Entorno Local

Recomendamos fuertemente **no programar directamente en el editor web de Google Apps Script** (IDE del navegador) a menos que sea un "hotfix" sumamente menor de 1 línea.

1. Instala [Node.js](https://nodejs.org/) en tu PC.
2. Instala `clasp` de manera global: `npm install -g @google/clasp`.
3. Inicia sesión en tu cuenta de Google con acceso al script tipeando: `clasp login`.
4. Utiliza `clasp pull` para bajar el código y `clasp push` para subir tus cambios a la nube. ¡Nunca edites código local sin hacer `pull` primero, podrías sobreescribir el trabajo de un compañero!

## 2. Convenciones de Código

* **Nombres de funciones y variables:** Usa formato `camelCase` (ejemplo: `procesarAlarmas`).
* **Funciones y Métodos Privados:** Cualquier función auxiliar que deba ser llamada SOLO por su propio módulo debe llevar un guión bajo inicial `_` por convención (ejemplo: `_formatearAlarma()`).
* **Respetar SOLID:** Antes de agregar una función a un archivo, piensa si corresponde a la temática de ese módulo. Si estás conectando APIs web externas, va en los servicios. Si es transformar textos, va en `MessageFormatter`. **No mezcles lógica de extracción con lógica de presentación.**

## 3. Control de Versiones

* Al final del día o luego de introducir una nueva mejora que impacta en producción, documenta brevemente tus cambios en el archivo `CHANGELOG.md` siguiendo el formato que allí existe y sube (incrementa) la versión semántica.

## 4. Alterar o Agregar Tipos de Alarma

1. Asegúrate de siempre mapear tus tipos nuevos de alarmas en la planilla de Google Sheets **Tipos de Alarmas** y mantenerla prolija (sin redundancias).
2. Si la alarma requiere una limpieza especial de texto o extracción de variables profundas, implementa la regla dentro del diccionario de **`AlarmFormatters.js`**. Bajo ningún contexto intentes modificar la capa de presentación (`MessageFormatter.js`) para "atajar" casos especiales; eso rompería la escalabilidad del sistema.
3. **Peligro Regex:** Cualquier modificación mal implementada en las expresiones regulares de `AlarmProcessor.js` puede hacer que de repente cientos de alarmas devuelvan *Alarma desconocida*. Si vas a agregar una Regex en los Interceptores, asegúrate de utilizar selectores que soporten basura anterior y posterior, y pruébala primero.
