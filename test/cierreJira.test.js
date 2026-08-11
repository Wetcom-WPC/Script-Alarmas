/**
 * Verifica el cierre automático en Jira de las alarmas silenciadas.
 *
 * Estos casos NO pasan por el sandbox de parseo: acá lo que se prueba es justamente la
 * conversación con la API (qué se llama, con qué payload y qué se hace ante cada respuesta),
 * así que se usa `crearSandboxServicios` con un doble de UrlFetchApp.
 *
 * La respuesta de transiciones replica el workflow real del proyecto: el ticket abierto
 * ofrece "Esperando respuesta del Cliente" y "Cerrar Alarma". Que nunca se elija la primera
 * es parte de lo que se está testeando.
 */
const { crearSandboxServicios } = require('./harness');

const TRANSICIONES_ABIERTA = {
  transitions: [
    { id: '21', name: 'Esperando respuesta del Cliente', to: { id: '10001', name: 'Esperando Respuesta del Cliente' } },
    { id: '31', name: 'Cerrar Alarma', to: { id: '10002', name: 'Cerrada' } }
  ]
};

/** Un ticket ya cerrado no vuelve a ofrecer el cierre. */
const TRANSICIONES_CERRADA = {
  transitions: [
    { id: '41', name: 'Reabrir', to: { id: '10000', name: 'Abierta' } }
  ]
};

const MOTIVO = 'Alarma silenciada por Excepción ID: *ID_Ejemplo* | Cliente: Banco Macro | Host: esxi031-lom.macro.com.ar';

/**
 * Arma un doble de la API. `opciones.transiciones` define qué devuelve el GET;
 * `opciones.codigoCierre`, `opciones.codigoServiceDesk` y `opciones.codigoComentarioV3`,
 * cómo responde cada POST. `opciones.comentarioSaleImagenPublica` simula el peor caso:
 * Service Desk acepta la llamada pero crea el comentario como público.
 */
function apiFalsa(opciones) {
  const o = opciones || {};
  return (url, options) => {
    const metodo = (options.method || 'get').toLowerCase();

    if (url.indexOf('/transitions') !== -1 && metodo === 'get') {
      return { code: o.codigoTransiciones || 200, body: JSON.stringify(o.transiciones || TRANSICIONES_ABIERTA) };
    }
    if (url.indexOf('/transitions') !== -1 && metodo === 'post') {
      return { code: o.codigoCierre || 204, body: '' };
    }
    if (url.indexOf('/servicedeskapi/') !== -1) {
      const publico = !!o.comentarioSaleComoPublico;
      return { code: o.codigoServiceDesk || 201, body: JSON.stringify({ id: '10500', public: publico }) };
    }
    if (url.indexOf('/comment') !== -1) {
      return { code: o.codigoComentarioV3 || 201, body: '{}' };
    }
    throw new Error(`El test no esperaba una llamada a ${metodo.toUpperCase()} ${url}`);
  };
}

/** Ejecuta cerrarTicket contra la API falsa y devuelve el resultado junto con las llamadas hechas. */
function cerrar(opciones, ticketKey) {
  const { obtener, llamadas, logs } = crearSandboxServicios(apiFalsa(opciones));
  const JiraService = obtener('JiraService');
  if (!JiraService) throw new Error('No se pudo cargar JiraService en el sandbox.');

  const resultado = JiraService.cerrarTicket(ticketKey || 'SBM-26397', MOTIVO);
  return { resultado, llamadas, logs, JiraService };
}

/** Elige la transición sin salir a la red (la selección es una función pura). */
function elegir(transiciones) {
  const { obtener } = crearSandboxServicios(() => ({ code: 200, body: '{}' }));
  return obtener('JiraService')._elegirTransicionDeCierre(transiciones);
}

const CASOS = [
  {
    nombre: 'Elige "Cerrar Alarma" y no la transición a "Esperando Respuesta del Cliente"',
    correr: () => {
      const t = elegir(TRANSICIONES_ABIERTA.transitions);
      if (!t) return 'no eligió ninguna transición';
      if (t.id !== '31') return `esperaba la transición 31, eligió la ${t.id} (${t.name})`;
      return null;
    }
  },
  {
    nombre: 'Si renombran la transición, la encuentra igual por el estado destino',
    correr: () => {
      const t = elegir([{ id: '31', name: 'Cerrar Ticket de Alarma', to: { name: 'Cerrada' } }]);
      if (!t || t.id !== '31') return 'no la encontró por estado destino';
      return null;
    }
  },
  {
    nombre: 'Si renombran el estado destino, la encuentra igual por el nombre de la transición',
    correr: () => {
      const t = elegir([{ id: '31', name: 'Cerrar Alarma', to: { name: 'Finalizada' } }]);
      if (!t || t.id !== '31') return 'no la encontró por nombre de transición';
      return null;
    }
  },
  {
    nombre: 'Un ticket ya cerrado no se intenta cerrar de nuevo ni rompe',
    correr: () => {
      const { resultado, llamadas } = cerrar({ transiciones: TRANSICIONES_CERRADA });
      if (resultado.cerrado) return 'lo dio por cerrado sin poder cerrarlo';
      if (llamadas.length !== 1) return `esperaba sólo el GET de transiciones, hubo ${llamadas.length} llamadas`;
      if (resultado.detalle.indexOf('Reabrir') === -1) return 'el detalle debería listar las transiciones ofrecidas';
      return null;
    }
  },
  {
    nombre: 'Cierre exitoso: transiciona con el id correcto y deja el comentario',
    correr: () => {
      const { resultado, llamadas } = cerrar({});
      if (!resultado.cerrado) return `no cerró: ${resultado.detalle}`;
      if (llamadas.length !== 3) return `esperaba GET + POST + comentario, hubo ${llamadas.length} llamadas`;

      const post = llamadas[1];
      if (post.url.indexOf('/rest/api/3/issue/SBM-26397/transitions') === -1) return `URL de cierre inesperada: ${post.url}`;
      const payload = JSON.parse(post.options.payload);
      if (!payload.transition || payload.transition.id !== '31') return `payload de cierre inesperado: ${post.options.payload}`;

      const comentario = llamadas[2];
      if (comentario.url.indexOf('/comment') === -1) return 'no comentó el ticket';
      const texto = JSON.stringify(JSON.parse(comentario.options.payload).body);
      if (texto.indexOf('ID_Ejemplo') === -1) return 'el comentario no menciona la excepción que la silenció';
      if (texto.indexOf('*') !== -1) return 'el comentario arrastró los asteriscos de negrita de Slack';
      return null;
    }
  },
  {
    nombre: 'El comentario se crea como NOTA INTERNA, nunca visible para el cliente',
    correr: () => {
      const { llamadas } = cerrar({});
      const comentario = llamadas[2];
      if (comentario.url.indexOf('/rest/servicedeskapi/request/SBM-26397/comment') === -1) {
        return `debería comentar por la API de Service Desk, fue a: ${comentario.url}`;
      }
      const payload = JSON.parse(comentario.options.payload);
      if (payload.public !== false) return `el comentario no se marcó como privado: public=${payload.public}`;
      return null;
    }
  },
  {
    nombre: 'Si Service Desk no está disponible, el respaldo por API v3 también va interno',
    correr: () => {
      const { resultado, llamadas } = cerrar({ codigoServiceDesk: 404 });
      if (!resultado.cerrado) return `no cerró: ${resultado.detalle}`;
      if (llamadas.length !== 4) return `esperaba GET + cierre + Service Desk + respaldo, hubo ${llamadas.length}`;

      const respaldo = llamadas[3];
      if (respaldo.url.indexOf('/rest/api/3/issue/SBM-26397/comment') === -1) return `URL de respaldo inesperada: ${respaldo.url}`;
      const props = JSON.parse(respaldo.options.payload).properties || [];
      const interna = props.filter(p => p.key === 'sd.public.comment')[0];
      if (!interna || interna.value.internal !== true) return 'el respaldo no marcó el comentario como interno';
      return null;
    }
  },
  {
    nombre: 'Si Jira crea el comentario como público, se avisa y NO se comenta de nuevo',
    correr: () => {
      const { resultado, llamadas, logs } = cerrar({ comentarioSaleComoPublico: true });
      // El ticket igual quedó cerrado; lo que no puede pasar es un segundo comentario.
      if (!resultado.cerrado) return 'el problema del comentario no debería invalidar el cierre';
      if (llamadas.length !== 3) return `no debería reintentar el comentario, hubo ${llamadas.length} llamadas`;
      if (!logs.some(l => l.indexOf('PÚBLICO') !== -1)) return 'debería quedar logueado que salió público';
      return null;
    }
  },
  {
    nombre: 'Si Jira rechaza el cierre, se informa y no se comenta el ticket',
    correr: () => {
      const { resultado, llamadas } = cerrar({ codigoCierre: 403 });
      if (resultado.cerrado) return 'dio por cerrado un ticket que Jira rechazó';
      if (resultado.detalle.indexOf('403') === -1) return `el detalle debería incluir el código: ${resultado.detalle}`;
      if (llamadas.length !== 2) return `no debería haber comentado, hubo ${llamadas.length} llamadas`;
      return null;
    }
  },
  {
    nombre: 'Si fallan las dos vías del comentario, el cierre sigue valiendo',
    correr: () => {
      const { resultado, logs } = cerrar({ codigoServiceDesk: 500, codigoComentarioV3: 400 });
      if (!resultado.cerrado) return 'un comentario fallido invalidó el cierre';
      if (!logs.some(l => l.indexOf('No se pudo comentar') !== -1)) return 'el fallo del comentario debería quedar logueado';
      return null;
    }
  },
  {
    nombre: 'Si el GET de transiciones falla, devuelve el error en lugar de lanzarlo',
    correr: () => {
      const { resultado, llamadas } = cerrar({ codigoTransiciones: 401 });
      if (resultado.cerrado) return 'dio por cerrado un ticket que nunca pudo consultar';
      if (resultado.detalle.indexOf('401') === -1) return `el detalle debería incluir el código: ${resultado.detalle}`;
      if (llamadas.length !== 1) return `no debería haber seguido, hubo ${llamadas.length} llamadas`;
      return null;
    }
  },
  {
    nombre: 'Un ticket sin key no dispara ninguna llamada a Jira',
    correr: () => {
      const { obtener, llamadas } = crearSandboxServicios(apiFalsa({}));
      const resultado = obtener('JiraService').cerrarTicket(null, MOTIVO);
      if (resultado.cerrado) return 'dio por cerrado un ticket sin key';
      if (llamadas.length !== 0) return `no debería llamar a Jira, hubo ${llamadas.length} llamadas`;
      return null;
    }
  }
];

function correr() {
  let fallos = 0;

  CASOS.forEach(caso => {
    let error;
    try {
      error = caso.correr();
    } catch (e) {
      error = `excepción inesperada: ${e.message}`;
    }

    if (!error) {
      console.log(`  ok    ${caso.nombre}`);
    } else {
      fallos++;
      console.log(`  FALLA ${caso.nombre}`);
      console.log(`        ${error}`);
    }
  });

  return { total: CASOS.length, fallos };
}

module.exports = { correr };
