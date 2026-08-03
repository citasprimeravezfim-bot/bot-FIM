const { google } = require('googleapis');

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const TIMEZONE = 'America/Mexico_City';

function getAuthClient() {
  // GOOGLE_SERVICE_ACCOUNT_KEY debe contener el JSON completo de la cuenta de servicio
  // (el archivo que descargas de Google Cloud), pegado tal cual como valor de la variable.
  let credenciales;
  try {
    credenciales = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch (err) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY no es un JSON válido. Verifica que la variable de entorno tenga el contenido completo del archivo JSON de la cuenta de servicio de Google.'
    );
  }

  return new google.auth.JWT({
    email: credenciales.client_email,
    key: credenciales.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

function getCalendarClient() {
  return google.calendar({ version: 'v3', auth: getAuthClient() });
}

// ============ VERIFICAR DISPONIBILIDAD ============
async function verificarDisponibilidad(fechaHoraInicio, fechaHoraFin) {
  const calendar = getCalendarClient();

  const respuesta = await calendar.freebusy.query({
    requestBody: {
      timeMin: new Date(fechaHoraInicio).toISOString(),
      timeMax: new Date(fechaHoraFin).toISOString(),
      timeZone: TIMEZONE,
      items: [{ id: CALENDAR_ID }],
    },
  });

  const ocupados = respuesta.data.calendars[CALENDAR_ID]?.busy || [];
  return ocupados.length === 0; // true = disponible
}

// ============ CREAR CITA ============
async function crearCita({ paciente, telefono, motivo, fechaHoraInicio, fechaHoraFin }) {
  const disponible = await verificarDisponibilidad(fechaHoraInicio, fechaHoraFin);

  if (!disponible) {
    return { ocupado: true };
  }

  const calendar = getCalendarClient();

  const evento = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: `${motivo} - ${paciente}`,
      description: `Paciente: ${paciente}\nTeléfono: ${telefono}\nMotivo: ${motivo}`,
      start: { dateTime: new Date(fechaHoraInicio).toISOString(), timeZone: TIMEZONE },
      end: { dateTime: new Date(fechaHoraFin).toISOString(), timeZone: TIMEZONE },
    },
  });

  return { ocupado: false, id: evento.data.id };
}

// ============ BUSCAR EVENTO ============
async function buscarEventoCalendar(nombre, fechaHora) {
  const calendar = getCalendarClient();

  const fecha = new Date(fechaHora);
  const inicioRango = new Date(fecha);
  inicioRango.setDate(inicioRango.getDate() - 3);
  const finRango = new Date(fecha);
  finRango.setDate(finRango.getDate() + 3);

  const respuesta = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: inicioRango.toISOString(),
    timeMax: finRango.toISOString(),
    q: nombre,
    singleEvents: true,
  });

  const eventos = respuesta.data.items || [];
  return eventos[0] || null;
}

// ============ CANCELAR EVENTO ============
async function cancelarEventoCalendar(eventoId) {
  const calendar = getCalendarClient();
  await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: eventoId });
}

// ============ REAGENDAR EVENTO ============
async function reagendarEventoCalendar(eventoId, nuevaFechaHoraInicio, nuevaFechaHoraFin) {
  const calendar = getCalendarClient();

  await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId: eventoId,
    requestBody: {
      start: { dateTime: new Date(nuevaFechaHoraInicio).toISOString(), timeZone: TIMEZONE },
      end: { dateTime: new Date(nuevaFechaHoraFin).toISOString(), timeZone: TIMEZONE },
    },
  });
}

module.exports = {
  crearCita,
  verificarDisponibilidad,
  cancelarEventoCalendar,
  buscarEventoCalendar,
  reagendarEventoCalendar,
};
