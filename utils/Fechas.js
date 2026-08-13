/**
 * Utilidades puras de fechas.
 *
 * `interpretarVencimiento` vivía duplicada, casi al carácter, en DataRepository (decide si
 * una regla de Excepción sigue vigente) y en Tools (decide si la fila se borra de la
 * planilla). Dos copias del mismo criterio pueden divergir: un fix aplicado en una sola
 * dejaría a la otra tomando una decisión distinta sobre la misma regla.
 */
const Fechas = {
  /**
   * Interpreta las columnas "Fecha hasta" / "Hora hasta" de una fila de Excepciones.
   * Devuelve el instante en que la regla deja de tener efecto, o null si no vence nunca.
   * Sin hora explícita, la regla vence al final del día (23:59:59.999).
   */
  interpretarVencimiento: function(fechaVal, horaVal) {
    if (!fechaVal || fechaVal === "") return null;

    let fechaBase = new Date();
    if (fechaVal instanceof Date) {
      fechaBase = new Date(fechaVal.getTime());
    } else {
      const f = new Date(fechaVal);
      if (!isNaN(f.getTime())) fechaBase = f;
    }

    if (horaVal && horaVal !== "") {
      if (horaVal instanceof Date) {
        fechaBase.setHours(horaVal.getHours(), horaVal.getMinutes(), 0, 0);
      } else if (typeof horaVal === 'string') {
        const partes = horaVal.split(':');
        if (partes.length >= 2) {
          fechaBase.setHours(parseInt(partes[0], 10), parseInt(partes[1], 10), 0, 0);
        }
      }
    } else {
      fechaBase.setHours(23, 59, 59, 999);
    }

    return fechaBase;
  }
};
