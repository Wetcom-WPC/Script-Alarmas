/**
 * Verifica `Http.conReintento` y `Http.fetchConReintento` (ver AUDITORIA.md, punto 13).
 *
 * Deliberadamente NO se testea contra un POST que muta estado: ninguna de las dos
 * funciones se usa ahí (ver el comentario en utils/Http.js).
 */
const { crearSandbox } = require('./harness');

function conHttp() {
  const { obtener, logs } = crearSandbox();
  const Http = obtener('Http');
  if (!Http) throw new Error('No se pudo cargar Http en el sandbox.');
  return { Http, logs };
}

/** Fabrica una respuesta falsa al estilo UrlFetchApp (con muteHttpExceptions: true). */
const respuesta = (codigo) => ({ getResponseCode: () => codigo });

const CASOS = [
  {
    nombre: 'conReintento: éxito en el primer intento, no llama de nuevo',
    correr: () => {
      const { Http } = conHttp();
      let llamadas = 0;
      const r = Http.conReintento(() => { llamadas++; return 'ok'; });
      if (r !== 'ok') return `esperaba "ok", obtuvo ${r}`;
      if (llamadas !== 1) return `esperaba 1 llamada, hubo ${llamadas}`;
      return null;
    }
  },
  {
    nombre: 'conReintento: falla una vez y se recupera en el reintento',
    correr: () => {
      const { Http } = conHttp();
      let llamadas = 0;
      const r = Http.conReintento(() => {
        llamadas++;
        if (llamadas === 1) throw new Error('falla momentánea');
        return 'ok';
      });
      if (r !== 'ok') return `esperaba "ok", obtuvo ${r}`;
      if (llamadas !== 2) return `esperaba 2 llamadas, hubo ${llamadas}`;
      return null;
    }
  },
  {
    nombre: 'conReintento: si fallan todos los intentos, relanza el último error',
    correr: () => {
      const { Http } = conHttp();
      let llamadas = 0;
      try {
        Http.conReintento(() => { llamadas++; throw new Error(`falla ${llamadas}`); });
        return 'debería haber lanzado';
      } catch (e) {
        if (llamadas !== 2) return `esperaba 2 intentos, hubo ${llamadas}`;
        if (e.message !== 'falla 2') return `debería relanzar el ÚLTIMO error, relanzó: ${e.message}`;
        return null;
      }
    }
  },
  {
    nombre: 'conReintento: respeta el número de intentos pedido',
    correr: () => {
      const { Http } = conHttp();
      let llamadas = 0;
      try {
        Http.conReintento(() => { llamadas++; throw new Error('nunca funciona'); }, 3);
        return 'debería haber lanzado';
      } catch (e) {
        if (llamadas !== 3) return `esperaba 3 intentos, hubo ${llamadas}`;
        return null;
      }
    }
  },
  {
    nombre: 'fetchConReintento: HTTP 200 en el primer intento, no reintenta',
    correr: () => {
      const { Http } = conHttp();
      let llamadas = 0;
      const r = Http.fetchConReintento(() => { llamadas++; return respuesta(200); });
      if (r.getResponseCode() !== 200) return 'no devolvió la respuesta esperada';
      if (llamadas !== 1) return `esperaba 1 llamada, hubo ${llamadas}`;
      return null;
    }
  },
  {
    nombre: 'fetchConReintento: un 401 NO se reintenta (es determinístico)',
    correr: () => {
      const { Http } = conHttp();
      let llamadas = 0;
      const r = Http.fetchConReintento(() => { llamadas++; return respuesta(401); });
      if (r.getResponseCode() !== 401) return 'debería devolver el 401 tal cual';
      if (llamadas !== 1) return `un 4xx no debería reintentarse, hubo ${llamadas} llamadas`;
      return null;
    }
  },
  {
    nombre: 'fetchConReintento: un 503 SÍ se reintenta (transitorio)',
    correr: () => {
      const { Http } = conHttp();
      let llamadas = 0;
      const r = Http.fetchConReintento(() => {
        llamadas++;
        return respuesta(llamadas === 1 ? 503 : 200);
      });
      if (r.getResponseCode() !== 200) return 'debería haberse recuperado en el reintento';
      if (llamadas !== 2) return `esperaba 2 llamadas, hubo ${llamadas}`;
      return null;
    }
  },
  {
    nombre: 'fetchConReintento: un 429 (rate limit) también se reintenta',
    correr: () => {
      const { Http } = conHttp();
      let llamadas = 0;
      const r = Http.fetchConReintento(() => {
        llamadas++;
        return respuesta(llamadas === 1 ? 429 : 200);
      });
      if (r.getResponseCode() !== 200) return 'debería haberse recuperado en el reintento';
      if (llamadas !== 2) return `esperaba 2 llamadas, hubo ${llamadas}`;
      return null;
    }
  },
  {
    nombre: 'fetchConReintento: si los 5xx persisten, devuelve la ÚLTIMA respuesta (no lanza)',
    correr: () => {
      const { Http } = conHttp();
      const r = Http.fetchConReintento(() => respuesta(502));
      if (r.getResponseCode() !== 502) return `esperaba conservar el último 502, obtuvo ${r.getResponseCode()}`;
      return null;
    }
  },
  {
    nombre: 'fetchConReintento: excepción de red en ambos intentos, relanza',
    correr: () => {
      const { Http } = conHttp();
      let llamadas = 0;
      try {
        Http.fetchConReintento(() => { llamadas++; throw new Error('sin conexión'); });
        return 'debería haber lanzado';
      } catch (e) {
        if (llamadas !== 2) return `esperaba 2 intentos, hubo ${llamadas}`;
        if (e.message !== 'sin conexión') return `error inesperado: ${e.message}`;
        return null;
      }
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
