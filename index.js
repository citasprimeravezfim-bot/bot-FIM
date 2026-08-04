const express = require('express');
const { crearCita, verificarDisponibilidad, cancelarEventoCalendar, buscarEventoCalendar, reagendarEventoCalendar } = require('./calendar');
const { inicializarDB, guardarMensaje, obtenerTodosLosMensajes, guardarCita, obtenerCitaPorTelefono, cancelarCitaDB, reagendarCitaDB } = require('./db');
const { procesarRecordatorios } = require('./recordatorios');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT_BASE = `Eres Adriana, la asistente virtual de Fundación Implantológica de México, una clínica dental.

TONO: Amable, cordial, cálido y mexicano. Cercano pero profesional. Respuestas breves (máximo 4-5 líneas), claras y fáciles de leer en WhatsApp. Puedes usar emojis con moderación (🦷😊) pero sin exagerar.

SERVICIOS QUE OFRECEMOS:
- Implantes dentales
- Brackets (metálicos, estéticos, invisaling, etc.)
- Extracciones
- Cirugías de terceros molares
- Blanqueamientos
- Limpieza dental

Si preguntan por nuestros servicios en general, responde:
"Contamos con diferentes servicios como:
- Implantes dentales
- Brackets metálicos, estéticos, invisaling, etc.
- Extracciones
- Cirugías de terceros molares
- Blanqueamientos
- Limpieza dental
¿Sobre cuál te gustaría que te dé más información?"

Si preguntan por IMPLANTES DENTALES o su precio, responde:
"El tratamiento tiene un costo de $7,999 incluye:
- Implante dental (por diente)
- Corona (resina)
- Seguimiento
- Cirugía de implantación"

Si preguntan si la CITA DE VALORACIÓN tiene costo, responde:
"Nuestra cita de valoración NO TIENE COSTO."

Si preguntan si EL TRATAMIENTO DUELE, responde:
"El tratamiento se realiza mediante sedación. Por lo tanto, no duele."

Si preguntan si EL TRATAMIENTO INCLUYE ANESTESIA, responde:
"Sí, incluye anestesia local."

Si preguntan de qué MATERIAL ES EL IMPLANTE, responde:
"El implante es de titanio y la corona de resina."

Si preguntan qué TIPO DE IMPLANTES manejan, responde:
"Monoblock y bifásico."

Si preguntan por la MARCA de implantes, responde:
"Trabajamos con implantes certificados y materiales diseñados para integrarse correctamente al hueso y durar muchos años."

Si preguntan si trabajan con MATERIALES CERTIFICADOS, responde:
"Sí. Trabajamos con materiales certificados y con la más alta tecnología."

Si preguntan qué ESTUDIOS necesitan, responde:
"Contamos con un paquete de estudios necesarios para iniciar tu tratamiento de implantes dentales. Incluye: tomografía, radiografía panorámica y escaneo."

Si preguntan la DURACIÓN del tratamiento, responde:
"El tratamiento tiene una duración de 4 a 6 meses."

Si preguntan por la GARANTÍA del implante, responde:
"Sí, en las coronas zirconio 5 años siempre y cuando acudan a sus revisiones y limpieza cada 6 meses."

Si preguntan si la CORONA ES PROVISIONAL, responde:
"Sí, la corona que incluye es de resina."

Si preguntan CUÁL DE LOS DOS MATERIALES ES MEJOR (resina/PMMA vs zirconio), responde:
"Los dos son buenos, depende del cuidado del paciente. La corona de PMMA es de plástico resistente y la corona de zirconio es de un mineral. Pero sí, el cuidado del paciente es fundamental."

Si preguntan qué NO INCLUYE el tratamiento, responde:
"No incluye:
- Extracción
- Estudios
- Regeneración ósea
- Y otros tratamientos"

Si preguntan por FORMAS DE PAGO, responde:
"Contamos con 3, 6 y 9 Meses Sin Intereses pagando con tarjeta de crédito."

Si preguntan qué MÉTODOS DE PAGO aceptan, responde:
"Efectivo, transferencia, tarjeta de crédito o débito."

Si preguntan si CUENTAN CON ESPECIALISTAS, responde:
"El tratamiento lo realiza un especialista en cirugía bucal e implantología con años de experiencia y formación avanzada."

Si preguntan por URGENCIAS DENTALES, responde:
"Sí, para una urgencia dental comunícate a 5627707778."

Si preguntan por nuestros HORARIOS, responde:
"Nuestros horarios son:
- Lunes a viernes de 09:00 a 19:00 horas
- Sábados de 09:00 a 15:00 horas"

Si preguntan por la PROMOCIÓN DE BRACKETS, responde:
"El costo de nuestra promoción de brackets metálicos es la siguiente:
- Mensualidades desde $699 MXN
- Colocación sin costo
Solo pagarías tus estudios básicos de ortodoncia, pues son necesarios para asegurar la efectividad de tu tratamiento."

Si preguntan por BLANQUEAMIENTO o LIMPIEZA DENTAL, responde:
"Contamos con una promoción de 2x1. Puede aplicar en pareja o combinada: puedes elegir un blanqueamiento y una limpieza para una sola persona, o un tratamiento individual para 2 personas."

Si preguntan por la UBICACIÓN o DIRECCIÓN, responde:
"Con gusto. Nos encontramos en Avenida División del Norte 1354 Piso 2, Consultorio 202, Colonia Letrán Valle, Benito Juárez. A un costado del Parque de los Venados.

¿Te gustaría agendar una cita de valoración SIN COSTO?"

AGENDAR CITAS:
Por el momento SOLO agendamos citas de VALORACIÓN DE PRIMERA VEZ, y únicamente para:
- Implantes dentales

HORARIOS PARA VALORACIONES DE PRIMERA VEZ (distintos a los horarios generales de la clínica):
- Lunes a viernes de 10:00 a 19:00 horas
- Sábados de 10:00 a 14:00 horas
Nunca ofrezcas ni agendes una valoración fuera de este horario, aunque el paciente lo pida.

Si el paciente dice que quiere agendar una cita (todavía sin dar día ni hora), responde exactamente:
"Con gusto, ¿qué día puedes asistir a una valoración? Nuestros horarios son de lunes a viernes de 10:00 a 19:00 horas y los sábados de 10:00 a 14:00"
Después de esto, continúa con el flujo normal de abajo (pedir nombre, tratamiento, confirmar horario, etc.).

IMPORTANTE sobre horarios: Cuando el paciente diga una hora, sigue estas reglas:
- Si dice "1", "2", "3", "4", "5", "6", "7" (sin AM/PM ni "de la mañana") → interpreta siempre como tarde: 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00.
- Si dice "10", "11", "12" → interpreta como mañana: 10:00, 11:00, 12:00.
- Si dice "8" o "9" → pregunta amablemente "¿Sería a las 8 de la mañana o de la tarde?" antes de proceder.
- Si dice "de la mañana" o "AM" → usa la hora exacta que dijo.
- Si dice "de la tarde" o "PM" → convierte a formato 24 horas (ej. 3 de la tarde = 15:00).
- Nunca interpretes ninguna hora como madrugada a menos que el paciente lo diga explícitamente.
- Siempre confirma la hora en el resumen antes de agendar (ej. "a las 14:00 hrs").

Si el paciente pide agendar cualquier otro tipo de cita (limpieza, blanqueamiento, ortodoncia, revisión de tratamiento en curso, urgencias, etc.), NO la agendes. En su lugar, dile amablemente que por ahora solo agendamos valoraciones de primera vez para implantes, y ofrece conectarlo con el equipo: "Por ahora solo puedo agendar valoraciones de primera vez para implantes dentales. Para otro tipo de cita, mejor te conecto con alguien de nuestro equipo, ¿te parece? 😊"

Si el paciente pide una valoración de implantes (y es su primera vez, no un seguimiento):
1. Pregunta su nombre completo (si no lo sabes ya).
2. Pregunta qué día y hora prefiere, dentro del horario de valoraciones (Lunes a viernes 10:00-19:00, Sábados 10:00-14:00). Si pide un horario fuera de este rango, explícale el horario correcto y pide que elija otro.
3. SIEMPRE usa la herramienta "verificar_disponibilidad" antes de agendar, sin excepción, incluso si crees que el horario está libre. NUNCA llames a "agendar_cita" sin haber llamado primero a "verificar_disponibilidad" en el mismo intercambio.
4. Si el horario está disponible, antes de agendar, MUESTRA un resumen al paciente y pide confirmación explícita. Ejemplo: "Perfecto, ¿confirmas tu cita de valoración de implantes para el [día] [fecha] a las [hora], a nombre de [nombre]? 😊" y espera su respuesta (sí/no) en el siguiente mensaje. NO llames a "agendar_cita" en este mismo turno.
5. Solo cuando el paciente confirme explícitamente (ej. "sí", "confirmo", "está bien"), usa la herramienta "agendar_cita" para crearla (el motivo debe ser exactamente "Valoración de implantes").
6. Si "agendar_cita" tiene éxito, manda un mensaje de confirmación final con esta plantilla exacta, reemplazando el nombre, día y hora con los datos reales: "[nombre], tu cita de valoración de implantes ha quedado agendada! 🦷 Queda confirmada para el [día] a las [hora] hrs. Te esperamos en Avenida División del Norte 1354 Piso 2, Consultorio 202, Colonia Letrán Valle, Benito Juárez. ¡Hasta entonces! 😊"
7. Si el paciente dice que no confirma, o pide cambiar algo, vuelve a preguntar el dato correcto y repite el resumen antes de agendar.
8. Si al intentar agendar el horario resulta ocupado (puede pasar si alguien más lo tomó mientras conversaban), avísale amablemente y pide que elija otro horario. No intentes agendar igual.
9. Si el resultado de "agendar_cita" indica que el paciente ya tenía una cita activa (yaExistia: true), NO lo trates como error ni te disculpes — simplemente confirma con naturalidad que su cita ya ha quedado agendada, con los datos que te dé la herramienta.
10. Si ocurre un ERROR TÉCNICO al usar "agendar_cita", "verificar_disponibilidad", "cancelar_cita" o "reagendar_cita" (distinto a que el horario esté ocupado o a que la cita ya existiera), discúlpate brevemente y recomienda comunicarse directamente al 5638078177 para que le ayuden a agendar. Ejemplo: "Ups, parece que hubo un problema al agendar tu cita en el sistema. Te pido una disculpa. Te recomiendo comunicarte directamente con nuestro equipo al 5638078177 para que puedan agendarte sin problema. ¡Estamos para ayudarte! 🦷"
- Siempre usa el año 2026 si el paciente no especifica año.
- Nunca agendes fuera del horario de valoraciones (Lunes a viernes 10:00-19:00, Sábados 10:00-14:00).
- Nunca agendes algo que no sea una valoración de primera vez de implantes.
- Nunca llames a "agendar_cita" sin que el paciente haya confirmado explícitamente el resumen primero.
- NUNCA le preguntes al paciente su número de teléfono. El sistema ya lo identifica automáticamente por el número desde el que te escribe por WhatsApp; las herramientas de citas no necesitan ni reciben ese dato de ti.
- Una vez que le confirmes al paciente que su cita quedó agendada exitosamente, esa conversación de agendado terminó. NO vuelvas a intentar agendar, verificar disponibilidad, ni pedir datos de nuevo por mensajes posteriores del mismo paciente (como "gracias", "ok", saludos, u otras preguntas), aunque el tema de citas haya sido lo último que se habló. Solo retoma el flujo de agendar si el paciente lo pide explícitamente de nuevo (por ejemplo, para agendar otra cita, cancelar o reagendar).

CANCELAR O REAGENDAR CITAS:
Si el paciente quiere cancelar su cita:
1. Confirma que quiere cancelar preguntando: "¿Confirmas que deseas cancelar tu cita? Esta acción no se puede deshacer 😊"
2. Solo si confirma, usa la herramienta "cancelar_cita"
3. Confirma con un mensaje cálido: "Tu cita ha sido cancelada. Si en algún momento quieres reagendar, aquí estamos 🦷"

Si el paciente quiere reagendar su cita:
1. Pregunta la nueva fecha y hora que prefiere (dentro del horario de valoraciones)
2. Usa "verificar_disponibilidad" para confirmar que el nuevo horario está libre
3. Muestra un resumen y pide confirmación antes de reagendar
4. Solo si confirma, usa "reagendar_cita"
5. Confirma con un mensaje cálido incluyendo la nueva fecha y hora

REGLAS:
- Siempre responde en español, con el tono mexicano descrito arriba.
- No uses asteriscos ni ningún otro formato de negritas/markdown en tus respuestas. Escribe todo en texto plano.
- Si preguntan algo que no está en esta información (por ejemplo dudas médicas específicas), sé honesta y ofrece conectar con alguien del equipo, por ejemplo: "Esa información mejor te la confirma alguien de nuestro equipo, ¿quieres que te conecte? 😊"
- Nunca inventes precios, servicios o promociones que no estén aquí.`;

function getSystemPrompt() {
  const fechaHoy = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Mexico_City'
  });
  const ahora = new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Mexico_City'
  });
  return `La fecha de hoy en Ciudad de México es: ${fechaHoy}, hora actual: ${ahora}. Usa esta fecha y hora como referencia para interpretar correctamente cuando el paciente diga "mañana", "el lunes", "la próxima semana", "hoy", etc. Nunca sugieras ni agendes fechas que ya pasaron. Si el paciente pide una cita para "hoy" verifica que la hora solicitada no haya pasado ya.\n\n` + SYSTEM_PROMPT_BASE;
}

const TOOLS = [
  {
    name: 'verificar_disponibilidad',
    description: 'Verifica si un horario específico está disponible en el calendario de citas antes de agendar.',
    input_schema: {
      type: 'object',
      properties: {
        fechaHoraInicio: { type: 'string', description: 'Fecha y hora de inicio en formato ISO, ej: 2026-06-25T10:00:00' },
        fechaHoraFin: { type: 'string', description: 'Fecha y hora de fin en formato ISO, ej: 2026-06-25T11:00:00 (asume 1 hora de duración si no se especifica)' },
      },
      required: ['fechaHoraInicio', 'fechaHoraFin'],
    },
  },
  {
    name: 'agendar_cita',
    description: 'Crea una cita de VALORACIÓN DE PRIMERA VEZ en el calendario, solo para implantes dentales, una vez confirmada la disponibilidad y todos los datos del paciente. El teléfono del paciente se toma automáticamente del número de WhatsApp desde el que escribe; nunca se lo pidas ni lo incluyas.',
    input_schema: {
      type: 'object',
      properties: {
        paciente: { type: 'string', description: 'Nombre completo del paciente' },
        motivo: { type: 'string', description: 'Debe ser exactamente "Valoración de implantes"' },
        fechaHoraInicio: { type: 'string', description: 'Fecha y hora de inicio en formato ISO' },
        fechaHoraFin: { type: 'string', description: 'Fecha y hora de fin en formato ISO' },
      },
      required: ['paciente', 'motivo', 'fechaHoraInicio', 'fechaHoraFin'],
    },
  },
  {
    name: 'cancelar_cita',
    description: 'Cancela la cita activa del paciente en Google Calendar y en la base de datos. Úsala solo cuando el paciente confirme explícitamente que quiere cancelar. El paciente se identifica automáticamente por su número de WhatsApp.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'reagendar_cita',
    description: 'Reagenda la cita activa del paciente a una nueva fecha y hora. Verifica disponibilidad primero con verificar_disponibilidad antes de llamar esta herramienta. El paciente se identifica automáticamente por su número de WhatsApp.',
    input_schema: {
      type: 'object',
      properties: {
        nuevaFechaHoraInicio: { type: 'string', description: 'Nueva fecha y hora de inicio en formato ISO' },
        nuevaFechaHoraFin: { type: 'string', description: 'Nueva fecha y hora de fin en formato ISO' },
      },
      required: ['nuevaFechaHoraInicio', 'nuevaFechaHoraFin'],
    },
  },
];

const conversationHistory = {};

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado correctamente');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Guarda los IDs de mensajes de WhatsApp ya procesados, para ignorar reintentos
// que a veces manda Meta si no detecta la respuesta a tiempo (esto evita, por
// ejemplo, que una cita se intente agendar dos veces por el mismo mensaje).
const mensajesProcesados = new Set();
const LIMITE_MENSAJES_PROCESADOS = 500;

// Cola de procesamiento por número de teléfono: garantiza que los mensajes de
// un mismo paciente se procesen uno a la vez, nunca en paralelo. Esto evita
// condiciones de carrera (por ejemplo, dos mensajes casi simultáneos del mismo
// número —por un reenvío del celular— que terminaban creando o intentando
// crear la misma cita dos veces antes de que la primera terminara de guardarse).
const colasPorTelefono = new Map();

function encolarPorTelefono(telefono, tarea) {
  const anterior = colasPorTelefono.get(telefono) || Promise.resolve();
  const actual = anterior.then(tarea, tarea);
  colasPorTelefono.set(telefono, actual.catch(() => {}));
  return actual;
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const entry = req.body.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];

  if (!message) return;

  const from = message.from;

  // Todo el procesamiento de este mensaje pasa a la cola de este número,
  // así nunca se procesan dos mensajes del mismo paciente al mismo tiempo.
  encolarPorTelefono(from, () => procesarMensajeEntrante(message, from));
});

async function procesarMensajeEntrante(message, from) {
  try {
    // Ignorar si ya procesamos este mensaje antes (reintento de Meta)
    if (message.id) {
      if (mensajesProcesados.has(message.id)) {
        console.log(`Mensaje duplicado ignorado: ${message.id}`);
        return;
      }
      mensajesProcesados.add(message.id);
      if (mensajesProcesados.size > LIMITE_MENSAJES_PROCESADOS) {
        const primero = mensajesProcesados.values().next().value;
        mensajesProcesados.delete(primero);
      }
    }

    if (message.type === 'audio') {
      const avisoVoz = 'No puedo escuchar mensajes de voz. Por favor, escribe tu petición y con gusto la atenderé 😊';
      await sendWhatsAppMessage(from, avisoVoz);
      await guardarMensaje(from, 'user', '[nota de voz recibida]');
      await guardarMensaje(from, 'assistant', avisoVoz);
      return;
    }

    const userText = message.text?.body;

    if (!userText) return;

    console.log(`Mensaje de ${from}: ${userText}`);
    await guardarMensaje(from, 'user', userText);

    // Si es la primera vez que este número escribe Y su mensaje es solo un
    // saludo simple (sin ninguna petición), mandamos el saludo fijo y
    // esperamos su siguiente mensaje (evita que Claude genere un segundo
    // saludo). Si en cambio ya viene con una petición concreta (ej. "quiero
    // agendar una cita"), la dejamos pasar directo a Claude para que la
    // atienda de una vez, sin hacerlo esperar un segundo mensaje.
    const esPrimeraVez = !conversationHistory[from];
    const esSoloUnSaludo = /^[¡!¿?\s]*(hola+|hi|hey+|buenas|buenos\s*d[íi]as|buenas\s*tardes|buenas\s*noches|qu[ée]\s*tal|holi+)[¡!.\s]*$/i.test(userText.trim());
    if (esPrimeraVez && esSoloUnSaludo) {
      const bienvenida = 'Hola, soy Adriana de Fundación Implantológica de México, ¿en qué te puedo ayudar?';
      await sendWhatsAppMessage(from, bienvenida);
      await guardarMensaje(from, 'assistant', bienvenida);
      conversationHistory[from] = [];
      return;
    }

    const lower = userText.toLowerCase().trim();
    if (lower === 'humano' || lower === 'agente') {
      const respuestaFija = 'Te voy a conectar con una persona de nuestro equipo, en breve te contactan 🙌';
      await sendWhatsAppMessage(from, respuestaFija);
      await guardarMensaje(from, 'assistant', respuestaFija);
      return;
    }

    if (!conversationHistory[from]) conversationHistory[from] = [];
    conversationHistory[from].push({ role: 'user', content: userText });
    // Ventana más amplia: el flujo de agendar cita (nombre, tratamiento, día/hora,
    // resumen, confirmación) puede tomar varios mensajes; con una ventana corta
    // se perdía el dato de fecha/hora antes de llegar a la confirmación.
    conversationHistory[from] = conversationHistory[from].slice(-20);

    const claudeReply = await askClaude(conversationHistory[from], from);

    conversationHistory[from].push({ role: 'assistant', content: claudeReply });

    await sendWhatsAppMessage(from, claudeReply);
    await guardarMensaje(from, 'assistant', claudeReply);
  } catch (err) {
    console.error('Error procesando mensaje:', err);
  }
}

// ============ LLAMAR A CLAUDE (con soporte de tools) ============
async function askClaude(messages, telefonoUsuario) {
  let currentMessages = [...messages];

  for (let i = 0; i < 4; i++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: getSystemPrompt(),
        messages: currentMessages,
        tools: TOOLS,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('Error de Claude API:', data.error);
      return 'Disculpa, tuve un problema técnico. ¿Puedes intentar de nuevo en un momento?';
    }

    if (data.stop_reason === 'tool_use') {
      // Claude puede pedir VARIAS herramientas en la misma respuesta.
      // Hay que ejecutar TODAS y devolver un tool_result por cada una,
      // o la API rechaza la conversación (esta era la causa del error original).
      const toolUseBlocks = data.content.filter((b) => b.type === 'tool_use');

      currentMessages.push({ role: 'assistant', content: data.content });

      const toolResultsContent = [];
      for (const toolUseBlock of toolUseBlocks) {
        const toolResult = await ejecutarHerramienta(toolUseBlock, telefonoUsuario);
        toolResultsContent.push({
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(toolResult),
        });
      }

      currentMessages.push({ role: 'user', content: toolResultsContent });
      continue;
    }

    const textBlock = data.content.find((b) => b.type === 'text');
    return textBlock ? textBlock.text : 'Disculpa, no entendí bien tu mensaje. ¿Puedes repetirlo?';
  }

  return 'Disculpa, tuve un problema procesando tu solicitud. ¿Puedes intentar de nuevo?';
}

// Guarda las citas en la base de datos usando explícitamente el offset de
// Ciudad de México (UTC-6 fijo, sin horario de verano), para que coincida
// con lo que se guarda en Google Calendar y no se desfasen los recordatorios.
function conOffsetMexico(fechaHoraStr) {
  const yaTieneZona = /[Zz]$/.test(fechaHoraStr) || /[+-]\d{2}:\d{2}$/.test(fechaHoraStr);
  return yaTieneZona ? fechaHoraStr : `${fechaHoraStr}-06:00`;
}

async function ejecutarHerramienta(toolUseBlock, telefonoUsuario) {
  const { name, input } = toolUseBlock;

  try {
    if (name === 'verificar_disponibilidad') {
      const disponible = await verificarDisponibilidad(input.fechaHoraInicio, input.fechaHoraFin);
      return { disponible };
    }

    if (name === 'agendar_cita') {
      // Protección extra: si este número ya tiene una cita activa (por ejemplo
      // porque el mensaje de confirmación se procesó dos veces por un reenvío
      // del teléfono del paciente), no crear una segunda cita.
      // Siempre se identifica al paciente por su número real de WhatsApp
      // (telefonoUsuario), nunca por algo que Claude haya podido inventar o
      // transcribir mal si llegó a preguntarlo.
      const citaExistente = await obtenerCitaPorTelefono(telefonoUsuario);
      if (citaExistente) {
        return {
          exito: true,
          yaExistia: true,
          mensaje: `Ya existe una cita activa para este paciente (${citaExistente.motivo} el ${citaExistente.fecha_hora}). No se creó una cita nueva; informa al paciente que su cita ya estaba confirmada.`,
        };
      }

      const evento = await crearCita({
        paciente: input.paciente,
        telefono: telefonoUsuario,
        motivo: input.motivo,
        fechaHoraInicio: input.fechaHoraInicio,
        fechaHoraFin: input.fechaHoraFin,
      });

      if (evento.ocupado) {
        return { exito: false, ocupado: true, mensaje: 'Ese horario ya está ocupado, no se creó la cita. Pide al paciente otro horario.' };
      }

      await guardarCita(
        telefonoUsuario,
        input.paciente,
        input.motivo,
        conOffsetMexico(input.fechaHoraInicio)
      );

      return { exito: true, eventoId: evento.id };
    }

    if (name === 'cancelar_cita') {
      const cita = await obtenerCitaPorTelefono(telefonoUsuario);
      if (!cita) return { exito: false, mensaje: 'No se encontró ninguna cita activa para este número.' };
      const evento = await buscarEventoCalendar(cita.nombre, cita.fecha_hora);
      if (evento) await cancelarEventoCalendar(evento.id);
      await cancelarCitaDB(cita.id);
      return { exito: true, mensaje: `Cita de ${cita.nombre} cancelada exitosamente.` };
    }

    if (name === 'reagendar_cita') {
      const cita = await obtenerCitaPorTelefono(telefonoUsuario);
      if (!cita) return { exito: false, mensaje: 'No se encontró ninguna cita activa para este número.' };
      const evento = await buscarEventoCalendar(cita.nombre, cita.fecha_hora);
      if (evento) {
        await reagendarEventoCalendar(evento.id, input.nuevaFechaHoraInicio, input.nuevaFechaHoraFin);
      }
      await reagendarCitaDB(cita.id, conOffsetMexico(input.nuevaFechaHoraInicio));
      return { exito: true, mensaje: `Cita reagendada exitosamente para ${input.nuevaFechaHoraInicio}.` };
    }

    return { error: 'Herramienta no reconocida' };
  } catch (err) {
    console.error(`Error ejecutando herramienta ${name}:`, err);
    return { error: 'No se pudo completar la acción en el calendario' };
  }
}

async function sendWhatsAppMessage(to, text) {
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
        to: to,
        text: { body: text },
      }),
    }
  );

  const data = await response.json();
  if (data.error) {
    console.error('Error enviando mensaje de WhatsApp:', data.error);
  }
  return data;
}

app.get('/', (req, res) => {
  res.send('Bot de WhatsApp con Claude funcionando ✅');
});

app.get('/conversaciones', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const [tipo, credenciales] = authHeader.split(' ');

  let usuarioOk = false;
  if (tipo === 'Basic' && credenciales) {
    const [usuario, password] = Buffer.from(credenciales, 'base64').toString('utf8').split(':');
    usuarioOk = usuario === process.env.DASHBOARD_USER && password === process.env.DASHBOARD_PASSWORD;
  }

  if (!usuarioOk) {
    res.set('WWW-Authenticate', 'Basic realm="Panel de conversaciones"');
    return res.status(401).send('Acceso no autorizado.');
  }

  try {
    const mensajes = await obtenerTodosLosMensajes();

    const conversaciones = {};
    for (const msg of mensajes) {
      if (!conversaciones[msg.telefono]) conversaciones[msg.telefono] = [];
      conversaciones[msg.telefono].push(msg);
    }

    const telefonos = Object.keys(conversaciones);

    let html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conversaciones — Bot FDS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #f0f2f5; color: #111; }
    header { background: #1a6fa8; color: white; padding: 1rem 1.5rem; display: flex; align-items: center; gap: 0.75rem; }
    header h1 { font-size: 1.1rem; font-weight: 600; }
    header span { font-size: 0.85rem; opacity: 0.8; }
    .layout { display: flex; height: calc(100vh - 56px); }
    .sidebar { width: 300px; min-width: 300px; background: white; border-right: 1px solid #e0e0e0; overflow-y: auto; }
    .contacto { padding: 0.9rem 1rem; border-bottom: 1px solid #f0f0f0; cursor: pointer; transition: background 0.15s; }
    .contacto:hover, .contacto.activo { background: #e8f4fd; }
    .contacto .num { font-size: 0.85rem; font-weight: 600; color: #1a6fa8; }
    .contacto .preview { font-size: 0.78rem; color: #666; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .contacto .fecha { font-size: 0.72rem; color: #999; margin-top: 2px; }
    .chat { flex: 1; display: flex; flex-direction: column; }
    .chat-header { padding: 0.85rem 1.2rem; background: white; border-bottom: 1px solid #e0e0e0; font-size: 0.9rem; font-weight: 600; color: #1a6fa8; }
    .mensajes { flex: 1; overflow-y: auto; padding: 1.2rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .burbuja { max-width: 70%; padding: 0.55rem 0.85rem; border-radius: 12px; font-size: 0.88rem; line-height: 1.45; }
    .burbuja.user { background: white; border: 1px solid #e0e0e0; align-self: flex-start; border-bottom-left-radius: 3px; }
    .burbuja.assistant { background: #d9f7be; align-self: flex-end; border-bottom-right-radius: 3px; }
    .burbuja .hora { font-size: 0.7rem; color: #999; margin-top: 3px; text-align: right; }
    .placeholder { flex: 1; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 0.9rem; }
    .vacio { padding: 2rem; text-align: center; color: #aaa; font-size: 0.85rem; }
  </style>
</head>
<body>
<header>
  <div>🦷</div>
  <div>
    <h1>Panel de conversaciones</h1>
    <span>${telefonos.length} contacto${telefonos.length !== 1 ? 's' : ''}</span>
  </div>
</header>
<div class="layout">
  <div class="sidebar" id="sidebar">`;

    if (telefonos.length === 0) {
      html += `<div class="vacio">Aún no hay mensajes registrados.</div>`;
    }

    for (const tel of telefonos) {
      const msgs = conversaciones[tel];
      const ultimo = msgs[msgs.length - 1];
      const preview = ultimo.contenido.length > 50 ? ultimo.contenido.substring(0, 50) + '…' : ultimo.contenido;
      const fecha = new Date(ultimo.creado_en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
      html += `<div class="contacto" onclick="verChat('${tel}')" id="c-${tel}">
        <div class="num">+${tel}</div>
        <div class="preview">${preview}</div>
        <div class="fecha">${fecha}</div>
      </div>`;
    }

    for (const tel of Object.keys(conversaciones)) {
      conversaciones[tel] = conversaciones[tel].map(m => ({
        ...m,
        hora_fmt: new Date(m.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }),
        fecha_fmt: new Date(m.creado_en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'America/Mexico_City' }),
      }));
    }

    html += `</div>
  <div class="chat" id="chat-area">
    <div class="placeholder">← Selecciona una conversación</div>
  </div>
</div>

<script>
const data = ${JSON.stringify(conversaciones)};

function verChat(tel) {
  document.querySelectorAll('.contacto').forEach(el => el.classList.remove('activo'));
  const item = document.getElementById('c-' + tel);
  if (item) item.classList.add('activo');

  const msgs = data[tel] || [];
  let html = '<div class="chat-header">+' + tel + ' — ' + msgs.length + ' mensajes</div><div class="mensajes" id="msgs">';
  for (const m of msgs) {
    html += '<div class="burbuja ' + m.rol + '"><div>' + m.contenido.replace(/</g,'&lt;') + '</div><div class="hora">' + m.fecha_fmt + ' ' + m.hora_fmt + '</div></div>';
  }
  html += '</div>';
  document.getElementById('chat-area').innerHTML = html;
  const msgsDiv = document.getElementById('msgs');
  if (msgsDiv) msgsDiv.scrollTop = msgsDiv.scrollHeight;
}
</script>
</body></html>`;

    res.send(html);
  } catch (err) {
    console.error('Error cargando conversaciones:', err);
    res.status(500).send('<h2 style="font-family:sans-serif;padding:2rem">Error cargando conversaciones. Verifica que la base de datos esté conectada.</h2>');
  }
});

app.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  try {
    await inicializarDB();
  } catch (err) {
    console.error('Error inicializando la base de datos:', err);
  }

  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const proximasDecena = new Date(ahora);
  proximasDecena.setHours(10, 0, 0, 0);
  if (proximasDecena <= ahora) proximasDecena.setDate(proximasDecena.getDate() + 1);

  const msHastaLas10 = proximasDecena - ahora;
  console.log(`Próximo envío de recordatorios en ${Math.round(msHastaLas10 / 1000 / 60)} minutos`);

  setTimeout(() => {
    procesarRecordatorios();
    setInterval(procesarRecordatorios, 24 * 60 * 60 * 1000);
  }, msHastaLas10);
});
