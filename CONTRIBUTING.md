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

## 4. Tests (corrélos SIEMPRE antes de un `clasp push`)

El parseo de alarmas está cubierto por tests de regresión que corren localmente con Node, sin necesidad de conectarse a Jira ni a Google Sheets:

```bash
npm test
```

* Los casos `legacy-*` **congelan la salida exacta del formato viejo**. Si uno falla después de un cambio tuyo, es una regresión: arreglala, no actualices el golden.
* Si un cambio de salida es intencional, revisá el diff con cuidado y recién ahí corré `npm run test:update`.
* `npm run preview` imprime el mensaje de Slack completo que generarían los fixtures, útil para revisar la estética a ojo.

Los fixtures viven en `test/fixtures.js`. **Si tocás el parseo, agregá el caso que motivó el cambio.**

> La carpeta `test/` está excluida en `.claspignore` porque usa `require`/`module.exports`, que Apps Script no soporta. No la borres de ahí.

## 5. Agregar Soporte para un Formato de Alarma Nuevo

Si un equipo empieza a mandar alarmas con una estructura distinta, **no toques `AlarmParser.js` ni `AlarmProcessor.js`**. Creá un parser propio:

1. Creá `core/parsers/MiFormatoParser.js` exponiendo este contrato:
   * `nombre` — string, para logs.
   * `prioridad` — número. Mayor se evalúa primero. El legacy es `0` y acepta todo.
   * `puedeParsear(ticket)` — booleano. **Discriminá por la estructura de la `description`, no por prefijos del summary**: los prefijos cambian y romperían el ruteo.
   * `parsear(ticket, mappings, warnings)` — devuelve el modelo canónico documentado en `AlarmParserRegistry.js`.
2. Sumalo al array de `AlarmParserRegistry._estrategias()`.
3. Para resolver el nombre de la alarma usá `AlarmParser.resolverNombreAlarma()`, así el cruce con la planilla es consistente entre formatos.
4. Definí siempre `origen.etiquetaTarget` en tu parser. Ese valor es el que matchean las reglas de la hoja de **Excepciones**: si lo rotulás mal, las alarmas que un cliente pidió silenciar van a sonar igual.
5. Agregá fixtures y un caso en `test/excepciones.test.js`.

> **Por qué existe esto:** conviven dos ejes de variabilidad distintos. El *formato del mensaje* se resuelve en `core/parsers/`; el *tipo de alarma concreta dentro del formato viejo* se resuelve en `AlarmFormatters.js`. No los mezcles: apilar ambos en la misma tabla genera una explosión combinatoria de casos.

## 6. Alterar o Agregar Tipos de Alarma

1. Asegúrate de siempre mapear tus tipos nuevos de alarmas en la planilla de Google Sheets **Tipos de Alarmas** y mantenerla prolija (sin redundancias).
2. Si la alarma requiere una limpieza especial de texto o extracción de variables profundas, implementa la regla dentro del diccionario de **`AlarmFormatters.js`**. Bajo ningún contexto intentes modificar la capa de presentación (`MessageFormatter.js`) para "atajar" casos especiales; eso rompería la escalabilidad del sistema.
3. **Peligro Regex:** Cualquier modificación mal implementada en las expresiones regulares de `AlarmProcessor.js` puede hacer que de repente cientos de alarmas devuelvan *Alarma desconocida*. Si vas a agregar una Regex en los Interceptores, asegúrate de utilizar selectores que soporten basura anterior y posterior, y pruébala primero.
