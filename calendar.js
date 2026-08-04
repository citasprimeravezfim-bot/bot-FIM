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

// Claude manda fechas "ingenuas" (sin zona horaria) como "2026-08-05T11:00:00",
// que representan hora de Ciudad de México. Si las convertimos con `new Date(...)`,
// Node.js las interpreta con la zona horaria del SERVIDOR (Railway corre en UTC),
// no con la de México, y la cita se guarda desfasada. Ciudad de México usa horario
// fijo UTC-6 todo el año (ya no tiene horario de verano desde 2022), así que basta
// con agregarle el offset "-06:00" directamente, sin pasar por new Date().
function conOffsetMexico(fechaHoraStr) {
  const yaTieneZona = /[Zz]$/.test(fechaHoraStr) || /[+-]\d{2}:\d{2}$/.test(fechaHoraStr);
  return yaTieneZona ? fechaHoraStr : `${fechaHoraStr}-06:00`;
}

// ============ VERIFICAR DISPONIBILIDAD ============
async function verificarDisponibilidad(fechaHoraInicio, fechaHoraFin) {
  const calendar = getCalendarClient();

  const respuesta = await calendar.freebusy.query({
    requestBody: {
      timeMin: conOffsetMexico(fechaHoraInicio),
      timeMax: conOffsetMexico(fechaHoraFin),
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
      start: { dateTime: conOffsetMexico(fechaHoraInicio), timeZone: TIMEZONE },
      end: { dateTime: conOffsetMexico(fechaHoraFin), timeZone: TIMEZONE },
    },
  });

  return { ocupado: false, id: evento.data.id };
}

// ============ BUSCAR EVENTO ============
async function buscarEventoCalendar(nombre, fechaHora) {
  const calendar = getCalendarClient();

  const fecha = new Date(conOffsetMexico(fechaHora));
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
      start: { dateTime: conOffsetMexico(nuevaFechaHoraInicio), timeZone: TIMEZONE },
      end: { dateTime: conOffsetMexico(nuevaFechaHoraFin), timeZone: TIMEZONE },
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
