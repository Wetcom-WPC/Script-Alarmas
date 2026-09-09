/**
 * Verifica `AlarmParser.extraerOrigen`, en particular el fix del punto 21 de AUDITORIA.md:
 * la etiqueta "Target:" se buscaba sin delimitador de palabra, así que "SubTarget:" (una
 * etiqueta DISTINTA) matcheaba igual y su valor se tomaba como si fuera el target real.
 */
const { crearSandbox } = require('./harness');

function extraerOrigen(description, summary) {
  const { obtener } = crearSandbox();
  const AlarmParser = obtener('AlarmParser');
  if (!AlarmParser) throw new Error('No se pudo cargar AlarmParser en el sandbox.');
  return AlarmParser.extraerOrigen(description, summary || null);
}

function extraerNombreYResumen(summary, mapaAlarmas) {
  const { obtener } = crearSandbox();
  const AlarmParser = obtener('AlarmParser');
  if (!AlarmParser) throw new Error('No se pudo cargar AlarmParser en el sandbox.');
  return AlarmParser.extraerNombreYResumenAlarma(summary, mapaAlarmas || {}, []);
}

const CASOS = [
  {
    nombre: '"SubTarget:" ya no se confunde con la etiqueta real "Target:"',
    correr: () => {
      const origen = extraerOrigen('SubTarget: valor-incorrecto\nPrevious Status: Green');
      if (origen.target === 'valor-incorrecto') return 'matcheó "SubTarget:" como si fuera la etiqueta "Target:"';
      if (origen.target !== 'Target no encontrado') return `esperaba el default sin match real, obtuvo: ${origen.target}`;
      return null;
    }
  },
  {
    nombre: 'La etiqueta real "Target:" sigue matcheando (no regresión)',
    correr: () => {
      const origen = extraerOrigen('Target: esxi031-lom.macro.com.ar\nPrevious Status: Unset');
      if (origen.target !== 'esxi031-lom.macro.com.ar') return `esperaba extraer el target real, obtuvo: ${origen.target}`;
      return null;
    }
  },
  {
    nombre: 'Con "SubTarget:" Y la etiqueta real más adelante, se usa la real',
    correr: () => {
      const origen = extraerOrigen('SubTarget: ruido\nTarget: esxi-real.cliente.com.ar\nPrevious Status: Unset');
      if (origen.target !== 'esxi-real.cliente.com.ar') return `debería matchear la etiqueta real y no "SubTarget:", obtuvo: ${origen.target}`;
      return null;
    }
  },
  {
    nombre: 'SOPFALABEL-26796: "<target> - [alarm.X]" resuelve X, no "[alarm"',
    correr: () => {
      // Summary real del ticket. Dos defectos se cruzaban acá:
      //  1. el normalizador le metía un segundo punto ("[alarm..CertificateStatusAlarm]"), y
      //  2. el patrón genérico "<target> - <texto>" cortaba en ese punto y devolvía
      //     "[alarm" como nombre, con lo que toda alarma de esta forma colapsaba al mismo
      //     nombre. En producción se publicó como alarma de licencia siendo de certificado.
      const summary = "Datacenters - [alarm.CertificateStatusAlarm] Certificate 'O=f099srtec350.falabella.com,L=Palo Alto,ST=California,C=US,CN=F099SRTEC350.falabella.com' from 'MACHINE_SSL_CERT' expires on 2026-10-02 19:14:46.000";
      const mapa = { 'CertificateStatusAlarm': 'Alarma de estado de Certificado' };
      const { alarma, summaryResto } = extraerNombreYResumen(summary, mapa);

      if (alarma !== 'Alarma de estado de Certificado') {
        return `esperaba que cruzara contra la fila "CertificateStatusAlarm", obtuvo: "${alarma}"`;
      }
      if (summaryResto.indexOf('Certificate ') !== 0) {
        return `el detalle debería arrancar en el texto real, obtuvo: "${summaryResto.substring(0, 45)}"`;
      }
      if (summaryResto.indexOf('Datacenters') !== -1) {
        return 'el detalle repite el target, que ya se publica en su propia fila';
      }
      if (summaryResto.indexOf(']') !== -1) return 'quedó el corchete huérfano en el detalle';
      if (summaryResto.indexOf('  ') !== -1) return 'quedó un espacio doble en el detalle';
      return null;
    }
  },
  {
    nombre: 'Toda alarma "<target> - [alarm.X]" resuelve su propio X (no colapsan a uno solo)',
    correr: () => {
      const mapa = {
        'CertificateStatusAlarm': 'Alarma de estado de Certificado',
        'HostConnectivityAlarm': 'Desconexión de Host'
      };
      const a = extraerNombreYResumen("Datacenters - [alarm.CertificateStatusAlarm] Certificate expires", mapa);
      const b = extraerNombreYResumen("esxi07.cliente.com - [alarm.HostConnectivityAlarm] Host has lost connection", mapa);

      if (a.alarma === b.alarma) return `dos alarmas distintas colapsaron al mismo nombre: "${a.alarma}"`;
      if (a.alarma !== 'Alarma de estado de Certificado') return `la primera resolvió mal: "${a.alarma}"`;
      if (b.alarma !== 'Desconexión de Host') return `la segunda resolvió mal: "${b.alarma}"`;
      if (b.summaryResto !== 'Host has lost connection') return `detalle inesperado: "${b.summaryResto}"`;
      return null;
    }
  },
  {
    nombre: 'Las formas NO canónicas se siguen normalizando a "[alarm.X]" (no regresión)',
    correr: () => {
      // Éstas son las que el normalizador existe para arreglar: sin él, el nombre no cruza
      // contra la hoja "Tipos de Alarmas".
      const casos = [
        '[Alarm HostConnectivityAlarm] Host dejó de responder',
        '[[alarm] HostConnectivityAlarm] Host dejó de responder'
      ];

      for (let i = 0; i < casos.length; i++) {
        const { alarma } = extraerNombreYResumen(casos[i]);
        if (alarma.indexOf('HostConnectivityAlarm') === -1) {
          return `el caso #${i + 1} no normalizó a "[alarm.X]", obtuvo: "${alarma}"`;
        }
        if (alarma.indexOf('.HostConnectivityAlarm') !== -1) {
          return `el caso #${i + 1} dejó un punto de más, obtuvo: "${alarma}"`;
        }
      }
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
