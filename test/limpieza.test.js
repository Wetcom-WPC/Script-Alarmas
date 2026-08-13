/**
 * Verifica `Tools.limpiarExcepcionesVencidas`: el trigger que BORRA filas de las hojas
 * "Excepciones <POD>" cuando la excepción ya venció. Es la función más riesgosa de las que
 * quedaban sin cobertura (ver AUDITORIA.md, punto 16) — el error no se deshace solo, así que
 * conviene verificar que borra exactamente lo que tiene que borrar, ni una fila de más.
 */
const { crearSandboxHojas } = require('./harness');

const ENCABEZADO = ['ID', 'Cliente', 'Tipo', 'Campo', 'Condición', 'Valor', 'Fecha hasta', 'Hora hasta'];
const fila = (id, fechaVal, horaVal) => [id, 'TODOS', 'TODAS', 'CUALQUIERA', 'Contiene', '', fechaVal || '', horaVal || ''];

const VENCIDA = new Date('2020-01-01T00:00:00');
const VIGENTE = new Date('2099-01-01T00:00:00');

function ejecutar(hojasDef) {
  const { obtener, hojas, logs } = crearSandboxHojas(hojasDef);
  const Tools = obtener('Tools');
  if (!Tools) throw new Error('No se pudo cargar Tools en el sandbox.');
  Tools.limpiarExcepcionesVencidas();
  return { hojas, logs };
}

/** IDs que sobreviven en una hoja, en orden, sin la fila de encabezado. */
const idsRestantes = (hoja) => hoja._filasActuales().slice(1).map(f => f[0]);

const CASOS = [
  {
    nombre: 'Borra la regla vencida y conserva la vigente',
    correr: () => {
      const { hojas } = ejecutar([{
        nombre: 'Excepciones WPC',
        filas: [ENCABEZADO, fila('EXC-VENCIDA', VENCIDA), fila('EXC-VIGENTE', VIGENTE)]
      }]);
      const restantes = idsRestantes(hojas[0]);
      if (restantes.length !== 1) return `esperaba 1 fila restante, quedaron ${restantes.length}: ${restantes}`;
      if (restantes[0] !== 'EXC-VIGENTE') return `esperaba que sobreviva EXC-VIGENTE, quedó ${restantes}`;
      return null;
    }
  },
  {
    nombre: 'Una regla sin fecha (nunca vence) nunca se borra',
    correr: () => {
      const { hojas } = ejecutar([{
        nombre: 'Excepciones WPC',
        filas: [ENCABEZADO, fila('EXC-SIN-FECHA')]
      }]);
      const restantes = idsRestantes(hojas[0]);
      if (restantes.length !== 1 || restantes[0] !== 'EXC-SIN-FECHA') return `no debería haberse borrado, quedó ${restantes}`;
      return null;
    }
  },
  {
    nombre: 'Varias vencidas intercaladas: se borran todas y sólo ésas, sin saltear ninguna por el corrimiento de índices',
    correr: () => {
      const { hojas } = ejecutar([{
        nombre: 'Excepciones WPC',
        filas: [
          ENCABEZADO,
          fila('EXC-1-VENCIDA', VENCIDA),
          fila('EXC-2-VIGENTE', VIGENTE),
          fila('EXC-3-VENCIDA', VENCIDA),
          fila('EXC-4-VIGENTE', VIGENTE),
          fila('EXC-5-VENCIDA', VENCIDA)
        ]
      }]);
      const restantes = idsRestantes(hojas[0]);
      if (restantes.join(',') !== 'EXC-2-VIGENTE,EXC-4-VIGENTE') {
        return `esperaba que sobrevivan sólo las vigentes en orden, quedó: ${restantes.join(',')}`;
      }
      return null;
    }
  },
  {
    nombre: 'La hoja "Excepciones" (sin POD, la vieja) se ignora por completo',
    correr: () => {
      const { hojas } = ejecutar([{
        nombre: 'Excepciones',
        filas: [ENCABEZADO, fila('EXC-VIEJA-VENCIDA', VENCIDA)]
      }]);
      const restantes = idsRestantes(hojas[0]);
      if (restantes.length !== 1) return 'la hoja "Excepciones" sin sufijo de POD no debería tocarse';
      return null;
    }
  },
  {
    nombre: 'Una hoja de excepciones sin ninguna fila de datos no rompe nada',
    correr: () => {
      const { hojas, logs } = ejecutar([{ nombre: 'Excepciones WPC', filas: [ENCABEZADO] }]);
      if (idsRestantes(hojas[0]).length !== 0) return 'no debería haber filas restantes';
      if (!logs.some(l => l.indexOf('Se eliminaron 0 excepciones') !== -1)) return 'debería loguear 0 eliminadas';
      return null;
    }
  },
  {
    nombre: 'Varias hojas de POD distintos se procesan de forma independiente',
    correr: () => {
      const { hojas } = ejecutar([
        { nombre: 'Excepciones WPC', filas: [ENCABEZADO, fila('WPC-VENCIDA', VENCIDA)] },
        { nombre: 'Excepciones POD 5', filas: [ENCABEZADO, fila('POD5-VIGENTE', VIGENTE)] }
      ]);
      if (idsRestantes(hojas[0]).length !== 0) return 'debería haber borrado la vencida de WPC';
      if (idsRestantes(hojas[1]).join(',') !== 'POD5-VIGENTE') return 'no debería haber tocado la de POD 5';
      return null;
    }
  },
  {
    nombre: 'Loguea el total eliminado en todas las hojas juntas',
    correr: () => {
      const { logs } = ejecutar([
        { nombre: 'Excepciones WPC', filas: [ENCABEZADO, fila('A', VENCIDA)] },
        { nombre: 'Excepciones POD 5', filas: [ENCABEZADO, fila('B', VENCIDA), fila('C', VENCIDA)] }
      ]);
      if (!logs.some(l => l.indexOf('Se eliminaron 3 excepciones caducadas en total') !== -1)) {
        return `no encontró el log del total (3), logs: ${JSON.stringify(logs)}`;
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
