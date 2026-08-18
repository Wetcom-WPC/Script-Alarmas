/**
 * Verifica `Fechas.interpretarVencimiento`, la función que reemplazó al bloque duplicado
 * en DataRepository y Tools (ver AUDITORIA.md, punto 4). Es una función pura, así que se
 * prueba en el sandbox de parseo, sin necesidad de mockear Sheets.
 *
 * Los argumentos Date se construyen y se evalúan CON `vm.runInContext`, dentro del mismo
 * sandbox que carga `Fechas`: el código hace `instanceof Date`, y un Date fabricado en el
 * Node de afuera pertenece a otro realm, así que ese chequeo daría (falsamente) negativo.
 * En Apps Script real esto no aplica: todo el proyecto corre en un único contexto.
 */
const vm = require('vm');
const { crearSandbox } = require('./harness');

/** Ejecuta `interpretarVencimiento(fechaExpr, horaExpr)` enteramente dentro del sandbox. */
function interpretarExpr(fechaExpr, horaExpr) {
  const { contexto, obtener } = crearSandbox();
  if (!obtener('Fechas')) throw new Error('No se pudo cargar Fechas en el sandbox.');
  return vm.runInContext(`Fechas.interpretarVencimiento(${fechaExpr}, ${horaExpr})`, contexto);
}

const CASOS = [
  {
    nombre: 'Sin fecha: no vence nunca (null)',
    correr: () => {
      const r = interpretarExpr("''", "''");
      if (r !== null) return `esperaba null, obtuvo ${r}`;
      return null;
    }
  },
  {
    nombre: 'Fecha sin hora: vence al final del día (23:59:59.999)',
    correr: () => {
      const r = interpretarExpr("new Date('2026-08-20T00:00:00')", "''");
      if (!r) return 'no devolvió fecha';
      if (r.getHours() !== 23 || r.getMinutes() !== 59 || r.getSeconds() !== 59) {
        return `esperaba 23:59:59, obtuvo ${r.getHours()}:${r.getMinutes()}:${r.getSeconds()}`;
      }
      return null;
    }
  },
  {
    nombre: 'Fecha + hora como objeto Date: combina ambas',
    correr: () => {
      const r = interpretarExpr("new Date('2026-08-20T00:00:00')", "new Date('1899-12-30T14:30:00')");
      if (!r) return 'no devolvió fecha';
      if (r.getDate() !== 20 || r.getHours() !== 14 || r.getMinutes() !== 30) {
        return `esperaba 20 a las 14:30, obtuvo ${r.getDate()} a las ${r.getHours()}:${r.getMinutes()}`;
      }
      return null;
    }
  },
  {
    nombre: 'Fecha + hora como string "HH:mm": combina ambas',
    correr: () => {
      const r = interpretarExpr("new Date('2026-08-20T00:00:00')", "'08:15'");
      if (!r) return 'no devolvió fecha';
      if (r.getHours() !== 8 || r.getMinutes() !== 15) {
        return `esperaba 08:15, obtuvo ${r.getHours()}:${r.getMinutes()}`;
      }
      return null;
    }
  },
  {
    nombre: 'Fecha como texto "DD/MM/YYYY" (celda no tipada como fecha en Sheets): se interpreta igual que un Date',
    correr: () => {
      const r = interpretarExpr("'14/08/2026'", "'18:00'");
      if (!r) return 'no devolvió fecha';
      if (r.getFullYear() !== 2026 || r.getMonth() !== 7 || r.getDate() !== 14 || r.getHours() !== 18) {
        return `esperaba 14/08/2026 18:00, obtuvo ${r.getDate()}/${r.getMonth() + 1}/${r.getFullYear()} ${r.getHours()}:${r.getMinutes()}`;
      }
      return null;
    }
  },
  {
    nombre: 'Regresión Tempora_Macro: fecha vencida como texto "DD/MM/YYYY" se detecta como vencida (antes caía a "hoy")',
    correr: () => {
      const r = interpretarExpr("'14/08/2026'", "'18:00'");
      if (!r) return 'no devolvió fecha';
      const ahora = new Date(2026, 7, 18, 14, 47); // 18/08/2026 14:47, mismo escenario del incidente
      if (!(r < ahora)) return `esperaba que ${r} ya estuviera vencida respecto de ${ahora}`;
      return null;
    }
  },
  {
    nombre: 'Fecha como texto ilegible: fail-closed, se trata como ya vencida (no como "no vence nunca")',
    correr: () => {
      const r = interpretarExpr("'no es una fecha'", "''");
      if (!r) return 'debería devolver una fecha (vencida), no null';
      if (r.getTime() !== 0) return `esperaba epoch (fail-closed), obtuvo ${r}`;
      return null;
    }
  },
  {
    nombre: 'Fecha como texto imposible ("31/02/2026"): fail-closed, se trata como ya vencida',
    correr: () => {
      const r = interpretarExpr("'31/02/2026'", "''");
      if (!r) return 'debería devolver una fecha (vencida), no null';
      if (r.getTime() !== 0) return `esperaba epoch (fail-closed), obtuvo ${r}`;
      return null;
    }
  },
  {
    nombre: 'No muta el objeto Date de fecha recibido',
    correr: () => {
      const { contexto } = crearSandbox();
      const noMutado = vm.runInContext(`
        (function() {
          const original = new Date('2026-08-20T00:00:00');
          const msOriginal = original.getTime();
          Fechas.interpretarVencimiento(original, '08:15');
          return original.getTime() === msOriginal;
        })()
      `, contexto);
      if (!noMutado) return 'el Date original quedó modificado';
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
