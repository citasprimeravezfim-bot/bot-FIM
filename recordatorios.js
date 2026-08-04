const { obtenerCitasParaManana, marcarRecordatorioEnviado } = require('./db');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

async function enviarMensajeRecordatorio(to, texto) {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        text: { body: texto },
      }),
    }
  );

  const data = await response.json();
  if (data.error) {
    console.error('Error enviando recordatorio de WhatsApp:', data.error);
  }
  return data;
}

async function procesarRecordatorios() {
  console.log('Procesando recordatorios...');

  try {
    const citas = await obtenerCitasParaManana();
    console.log(`Citas encontradas para mañana: ${citas.length}`);

    for (const cita of citas) {
      const hora = new Date(cita.fecha_hora).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Mexico_City',
      });

      const mensaje = `¡Hola ${cita.nombre}! 👋 Te recordamos tu cita de ${cita.motivo} mañana a las ${hora} hrs en Fundación Implantológica de México. Te esperamos 🦷😊`;

      await enviarMensajeRecordatorio(cita.telefono, mensaje);
      await marcarRecordatorioEnviado(cita.id);

      console.log(`Recordatorio enviado a ${cita.nombre} (${cita.telefono})`);
    }

    console.log('Recordatorios procesados.');
  } catch (err) {
    console.error('Error procesando recordatorios:', err);
  }
}

module.exports = { procesarRecordatorios };
