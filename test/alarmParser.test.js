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
