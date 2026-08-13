/**
 * WebApp HTTP Listener para Generación Interactiva de Borradores de Correo
 */

/**
 * Un GET debe ser seguro de repetir (un prefetch del navegador, una recarga de pestaña no
 * deberían generar un borrador de más). Acá NO se crea nada: sólo se re-envía el id como
 * POST, vía un form que se autoenvía apenas carga la página. La creación real vive en
 * doPost / _generarBorrador.
 */
function doGet(e) {
  const borradorId = e.parameter.id;

  if (!borradorId) {
    return HtmlService.createHtmlOutput('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h2 style="color: #d9534f;">⚠️ Enlace Inválido</h2><p>Falta el identificador de la alarma.</p></div>');
  }

  return HtmlService.createHtmlOutput(`
    <html>
      <body onload="document.forms[0].submit()">
        <form method="post" action="${ScriptApp.getService().getUrl()}">
          <input type="hidden" name="id" value="${MessageFormatter._escapeHTML(borradorId)}">
        </form>
        <p style="font-family: sans-serif; text-align: center; margin-top: 50px; color: #666;">Generando borrador…</p>
      </body>
    </html>
  `);
}

function doPost(e) {
  return _generarBorrador(e);
}

function _generarBorrador(e) {
  try {
    const borradorId = e.parameter.id;

    if (!borradorId) {
      return HtmlService.createHtmlOutput('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h2 style="color: #d9534f;">⚠️ Enlace Inválido</h2><p>Falta el identificador de la alarma.</p></div>');
    }

    let dataGuardada = null;

    // 1. Intentar buscar en Google Drive
    try {
      const file = DriveApp.getFileById(borradorId);
      dataGuardada = file.getBlob().getDataAsString();
    } catch(err) {
      // 2. Fallback a la caché si no es un ID de archivo válido o fue borrado
      dataGuardada = CacheService.getScriptCache().get(`draft_${borradorId}`);
    }

    if (!dataGuardada) {
      return HtmlService.createHtmlOutput('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h2 style="color: #d9534f;">⚠️ Código expirado o procesado</h2><p>Este borrador ya caducó (pasaron más de 6 horas) o no existe.</p></div>');
    }

    let payloadBorrador;
    try {
      payloadBorrador = JSON.parse(dataGuardada);
    } catch (err) {
      payloadBorrador = null;
    }

    // El id puede apuntar a CUALQUIER archivo que el usuario tenga permiso de leer en su
    // Drive (executeAs: USER_ACCESSING lo acota a su propio Drive, pero no a esta app). Si
    // el contenido no tiene la forma esperada, no se usa: mejor un error claro que intentar
    // armar un correo con datos ajenos.
    if (!_esPayloadBorradorValido(payloadBorrador)) {
      return HtmlService.createHtmlOutput('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h2 style="color: #d9534f;">⚠️ Contenido inválido</h2><p>El identificador no corresponde a un borrador generado por esta aplicación.</p></div>');
    }

    // Obtener destinatarios desde DataRepository
    const repositorios = DataRepository.obtenerMapeos();
    const mapaCorreos = repositorios.mapaCorreos || {};
    const dest = mapaCorreos[payloadBorrador.cliente] || "";

    const tz = Session.getScriptTimeZone() || "America/Argentina/Buenos_Aires";
    const fechaAsunto = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");

    // El asunto contendrá la alarma principal y el nombre del cliente
    const asuntoCorreo = `${payloadBorrador.alarmaPricipal} - WETCOM - ${payloadBorrador.cliente} - ${fechaAsunto}`;

    // Armar el cuerpo corporativo
    // Nota: Dejamos el espacio final libre para que el operador pueda insertar su firma corporativa de Gmail.
    // payloadBorrador.html no se escapa: es markup generado por MessageFormatter, no texto libre.
    const cuerpoFinal = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; font-size: 14px; max-width: 800px; text-align: left;">
        <p style="margin-bottom: 20px;">Estimados, ¿cómo están? Me comunico para informarles que recibimos las siguientes alarmas:</p>

        ${payloadBorrador.html}

        <p style="margin-top: 20px; margin-bottom: 30px;">Ante esto les consulto: ¿Están al tanto de las anomalías? ¿Desean que generemos un ticket para analizar la anomalía en profundidad?</p>
      </div>`;

    // Construir lista de CC dinámicamente
    let correosCC = "wpc@wetcom.com";
    if (payloadBorrador.pod) {
      const p = payloadBorrador.pod.toString().toLowerCase().replace(/\s+/g, '');
      if (p !== "wpc" && !p.includes("desconocido")) {
        const podEmail = p.startsWith("pod") ? `${p}@wetcom.com` : `pod${p}@wetcom.com`;
        correosCC += `, ${podEmail}`;
      }
    }

    GmailApp.createDraft(dest, asuntoCorreo, "Por favor, active HTML para ver el formato.", {
      htmlBody: cuerpoFinal,
      name: "Soporte Wetcom",
      cc: correosCC
    });

    return HtmlService.createHtmlOutput(`
      <div style="font-family: 'Segoe UI', Tahoma, sans-serif; text-align: center; margin-top: 60px; padding: 20px;">
        <h1 style="color: #008a3b; font-size: 28px;">✅ Borrador Listo</h1>
        <p style="font-size: 16px; color: #444;">El borrador para <b>${MessageFormatter._escapeHTML(payloadBorrador.cliente)}</b> ya está en tu Gmail.</p>
        <p style="font-size: 14px; background-color: #f1f3f4; padding: 15px; border-radius: 8px; display: inline-block;">
          👉 Ve a la carpeta <b>Borradores</b> de tu Gmail. Los destinatarios preconfigurados fueron cargados.
        </p>
        <br><br><p style="color: #888; font-size: 12px;">Ya puedes cerrar esta pestaña y volver a Slack.</p>
      </div>
    `);

  } catch (err) {
    return HtmlService.createHtmlOutput(`<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h2 style="color: #d9534f;">❌ Ocurrió un error crítico:</h2><p>${MessageFormatter._escapeHTML(err.message)}</p></div>`);
  }
}

/**
 * Forma mínima que debe tener el JSON de un borrador para confiar en él: los campos que
 * MessageFormatter.generarMensaje efectivamente escribe al crearlo (ver payloadBorrador ahí).
 */
function _esPayloadBorradorValido(payload) {
  return !!payload
    && typeof payload === 'object'
    && typeof payload.cliente === 'string' && payload.cliente !== ''
    && typeof payload.html === 'string';
}
