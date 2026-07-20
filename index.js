const express = require("express");
const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 📅 Configuración de Google Calendar (cuenta de servicio)
let calendarAuth = null;
try {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  calendarAuth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ["https://www.googleapis.com/auth/calendar"]
  );
} catch (err) {
  console.error("⚠️ No se pudo cargar GOOGLE_SERVICE_ACCOUNT_KEY:", err.message);
}
const calendar = google.calendar({ version: "v3", auth: calendarAuth });

// Crea un evento en el calendario de la clínica
async function crearEventoCalendar({ fecha, hora, nombre_paciente, motivo, telefono }) {
  const inicio = new Date(`${fecha}T${hora}:00-06:00`); // Zona horaria CDMX
  const fin = new Date(inicio.getTime() + 60 * 60 * 1000); // 1 hora de duración

  const evento = {
    summary: `Cita: ${nombre_paciente || "Paciente sin nombre"}`,
    description: `Motivo: ${motivo || "No especificado"}\nTeléfono: ${telefono}`,
    start: { dateTime: inicio.toISOString(), timeZone: "America/Mexico_City" },
    end: { dateTime: fin.toISOString(), timeZone: "America/Mexico_City" },
  };

  const result = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    resource: evento,
  });

  return result.data;
}

// 👋 Mensaje de bienvenida (se envía la primera vez que un número escribe)
const WELCOME_MESSAGE = "Hola, mi nombre es Adri, ¿en qué te puedo ayudar?";

// Nota: este set vive en memoria y se reinicia si el servidor se reinicia/redeploya.
// Para algo más permanente habría que guardar los números en una base de datos.
const usuariosConversando = new Set();

// 🧠 Historial de conversación por número (también en memoria, se reinicia con el servidor)
const historiales = new Map();
const MAX_HISTORIAL = 20; // últimos N mensajes por usuario, para no crecer sin control

// 📊 Registro simple de mensajes para el panel de monitoreo (también en memoria)
const registroConversaciones = new Map(); // from -> [{texto, hora, direccion}]

function registrarMensaje(from, texto, direccion) {
  if (!registroConversaciones.has(from)) registroConversaciones.set(from, []);
  registroConversaciones.get(from).push({ texto, hora: new Date(), direccion });
}

// 📋 Guion de preguntas y respuestas de la clínica (implantes dentales)
const SYSTEM_PROMPT = `Eres Adri, el asistente de WhatsApp de una clínica de implantes dentales. Respondes en español, de forma breve, cálida y profesional. Si te preguntan tu nombre, di que te llamas Adri.

IMPORTANTE: No uses asteriscos (*) ni ningún otro símbolo de formato tipo Markdown (como guiones bajos, numerales o corchetes) en tus respuestas. Escribe en texto plano, sin negritas, cursivas ni listas con símbolos. Si necesitas enumerar cosas, usa saltos de línea simples o palabras como "primero", "segundo", etc.

Usa EXACTAMENTE estas respuestas cuando la pregunta del paciente coincida con alguno de estos temas (puedes adaptar ligeramente la redacción para que suene natural, pero no cambies los datos, precios ni condiciones):

- ¿Duele el tratamiento?: El tratamiento se realiza mediante sedación. Por lo tanto, no duele.

- ¿De qué material es el implante dental?: El implante es de titanio y la corona de resina.

- ¿Cuáles son las formas de pago?: Contamos con 3, 6 y 9 Meses Sin Intereses pagando con tarjeta de crédito.

- ¿El tratamiento incluye anestesia?: Sí, incluye anestesia local.

- Implantes dentales (costo y qué incluye): El tratamiento tiene un costo de $7,999 e incluye: implante dental (por diente), corona (resina), seguimiento y cirugía de implantación.

- ¿Qué estudios necesito?: Contamos con un paquete de estudios necesarios para iniciar tu tratamiento de implantes dentales. Incluye: tomografía, radiografía panorámica y escaneo.

- ¿Qué tipo de implantes manejan?: Monoblock y bifásico.

- ¿Cuál es la marca de implantes que trabajan?: Trabajamos con implantes certificados y materiales diseñados para integrarse correctamente al hueso y durar muchos años.

- ¿Tiene costo la cita de valoración?: Nuestra cita de valoración NO TIENE COSTO.

- ¿Qué duración tiene el tratamiento?: El tratamiento tiene una duración de 4 a 6 meses.

- ¿Cuál es el plazo de garantía del implante dental?: Sí, en las coronas de zirconio 5 años, siempre y cuando acudan a sus revisiones y limpieza cada 6 meses.

- ¿La corona es provisional?: Sí, la corona que incluye el tratamiento es de resina.

- ¿Qué no incluye el tratamiento?: No incluye: extracción, estudios, regeneración ósea y otros tratamientos.

- ¿Ofrecen urgencias dentales?: Sí, para una urgencia dental comunícate al 5627707778.

- ¿Trabajan con materiales certificados?: Sí. Trabajamos con materiales certificados y con la más alta tecnología.

- ¿Qué métodos de pago aceptan?: Efectivo, transferencia, tarjeta de crédito o débito.

- ¿Cuentan con especialistas?: El tratamiento lo realiza un especialista en cirugía bucal e implantología con años de experiencia y formación avanzada.

- Si el paciente quiere agendar una cita: Pregunta primero "Con gusto, ¿qué día puedes asistir a una valoración? Nuestros horarios son de lunes a viernes de 10:00 a 19:00 horas y los sábados de 10:00 a 14:00". Cuando el paciente confirme un día y una hora específicos DENTRO de ese horario, usa la herramienta "crear_cita" para agendarlo. Si pide un horario fuera de esos días/horas, indícale amablemente que no está disponible y pide que elija otro. Si no te ha dado su nombre, pídeselo antes de agendar.

Si te preguntan algo que no está en esta lista, responde de forma amable y honesta, sin inventar datos, precios ni condiciones que no se te dieron. Si no sabes la respuesta, sugiere que un miembro del equipo de la clínica le dará seguimiento.

Hoy es ${new Date().toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Usa esta fecha como referencia para interpretar cosas como "mañana", "el próximo lunes", etc.`;

// 🔧 Definición de la herramienta para que Claude pueda agendar citas
const TOOLS = [
  {
    name: "crear_cita",
    description:
      "Crea una cita en el calendario de la clínica. Solo úsala cuando el paciente ya confirmó día y hora específicos dentro del horario de atención (lunes a viernes 10:00-19:00, sábados 10:00-14:00).",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "Fecha de la cita en formato YYYY-MM-DD" },
        hora: { type: "string", description: "Hora de la cita en formato HH:MM de 24 horas" },
        nombre_paciente: { type: "string", description: "Nombre del paciente" },
        motivo: { type: "string", description: "Motivo de la cita, ej. 'Valoración de implante dental'" },
      },
      required: ["fecha", "hora", "nombre_paciente"],
    },
  },
];

// ✅ Verificación del webhook (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("Webhook verificado ✅");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 📨 Recibir mensajes (POST)
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Responder de inmediato a Meta

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (!message || message.type !== "text") return;

    const from = message.from; // número del remitente
    const text = message.text.body;

    console.log(`Mensaje de ${from}: ${text}`);
    registrarMensaje(from, text, "entrante");

    // 👋 Si es la primera vez que este número escribe, mandar bienvenida primero
    if (!usuariosConversando.has(from)) {
      usuariosConversando.add(from);

      await axios.post(
        `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          type: "text",
          text: { body: WELCOME_MESSAGE },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`Bienvenida enviada a ${from}`);
      registrarMensaje(from, WELCOME_MESSAGE, "saliente");
    }

    // 🧠 Recuperar/crear historial de este usuario
    if (!historiales.has(from)) historiales.set(from, []);
    const historial = historiales.get(from);
    historial.push({ role: "user", content: text });

    // 🤖 Llamar a Claude (con la herramienta de agendado disponible)
    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: historial,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
    });

    // Si Claude decide usar la herramienta de crear_cita, la ejecutamos
    if (response.stop_reason === "tool_use") {
      historial.push({ role: "assistant", content: response.content });

      const toolUse = response.content.find((b) => b.type === "tool_use");
      let resultadoTool;

      try {
        const evento = await crearEventoCalendar({
          ...toolUse.input,
          telefono: from,
        });
        resultadoTool = `Cita creada correctamente para el ${toolUse.input.fecha} a las ${toolUse.input.hora}. Link del evento: ${evento.htmlLink}`;
      } catch (err) {
        console.error("Error creando evento en Calendar:", err.response?.data || err.message);
        resultadoTool = `Error al crear la cita: ${err.message}. Informa al paciente que hubo un problema técnico y que el equipo lo contactará para confirmar manualmente.`;
      }

      historial.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: resultadoTool,
          },
        ],
      });

      // Volvemos a llamar a Claude para que redacte la confirmación final al paciente
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: historial,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
      });
    }

    const bloqueTexto = response.content.find((b) => b.type === "text");
    const reply = bloqueTexto ? bloqueTexto.text : "Gracias por tu mensaje, en breve te contactamos.";

    historial.push({ role: "assistant", content: response.content });

    // Recortar historial si crece demasiado
    if (historial.length > MAX_HISTORIAL) {
      historiales.set(from, historial.slice(-MAX_HISTORIAL));
    }

    // 📤 Enviar respuesta por WhatsApp
    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        type: "text",
        text: { body: reply },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`Respuesta enviada a ${from}`);
    registrarMensaje(from, reply, "saliente");
  } catch (err) {
    if (err.response?.data) {
      console.error("Error:", JSON.stringify(err.response.data));
    } else {
      console.error("Error:", err.message);
    }
  }
});

// 🔒 Autenticación básica para el panel (usuario/contraseña por variable de entorno)
function requiereAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Panel FIM"');
    return res.status(401).send("Autenticación requerida");
  }

  const [usuario, password] = Buffer.from(authHeader.split(" ")[1], "base64")
    .toString()
    .split(":");

  if (usuario === process.env.DASHBOARD_USER && password === process.env.DASHBOARD_PASSWORD) {
    return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="Panel FIM"');
  return res.status(401).send("Credenciales incorrectas");
}

// 📊 API: lista de conversaciones (JSON)
app.get("/dashboard/api/conversaciones", requiereAuth, (req, res) => {
  const conversaciones = [...registroConversaciones.entries()].map(([numero, mensajes]) => {
    const ultimo = mensajes[mensajes.length - 1];
    return {
      numero,
      cantidad: mensajes.length,
      ultimoTexto: ultimo.texto,
      ultimaHora: ultimo.hora,
    };
  });

  conversaciones.sort((a, b) => new Date(b.ultimaHora) - new Date(a.ultimaHora));
  res.json(conversaciones);
});

// 📊 API: detalle de una conversación (JSON)
app.get("/dashboard/api/conversacion/:numero", requiereAuth, (req, res) => {
  const mensajes = registroConversaciones.get(req.params.numero) || [];
  res.json(mensajes);
});

// 📊 Panel de monitoreo: interfaz de dos columnas (contactos + chat)
app.get("/dashboard", requiereAuth, (req, res) => {
  res.send(`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Panel de conversaciones - FIM</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; height: 100vh; display: flex; flex-direction: column; }
          header { background: #1a73a8; color: white; padding: 14px 20px; display: flex; align-items: center; gap: 10px; }
          header .icono { font-size: 24px; }
          header h1 { font-size: 18px; margin: 0; }
          header p { font-size: 12px; margin: 2px 0 0; opacity: 0.9; }
          .layout { flex: 1; display: flex; overflow: hidden; }
          .sidebar { width: 320px; border-right: 1px solid #ddd; overflow-y: auto; background: white; }
          .contacto { padding: 12px 16px; border-bottom: 1px solid #eee; cursor: pointer; }
          .contacto:hover { background: #f5f5f5; }
          .contacto.activo { background: #e8f2fa; }
          .contacto .numero { color: #1a73a8; font-weight: 600; font-size: 14px; }
          .contacto .preview { font-size: 13px; color: #555; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .contacto .hora { font-size: 11px; color: #999; margin-top: 3px; }
          .chat { flex: 1; display: flex; flex-direction: column; background: #ECE5DD; }
          .chat-header { background: white; padding: 14px 20px; border-bottom: 1px solid #ddd; font-weight: 600; color: #222; }
          .chat-body { flex: 1; overflow-y: auto; padding: 20px; }
          .burbuja-fila { display: flex; margin: 8px 0; }
          .burbuja { max-width: 60%; padding: 10px 14px; border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
          .burbuja .texto { white-space: pre-wrap; }
          .burbuja .hora { font-size: 11px; color: #888; margin-top: 4px; }
          .vacio { padding: 40px; text-align: center; color: #888; }
        </style>
      </head>
      <body>
        <header>
          <span class="icono">🦷</span>
          <div>
            <h1>Panel de conversaciones</h1>
            <p id="contador">Cargando contactos…</p>
          </div>
        </header>
        <div class="layout">
          <div class="sidebar" id="sidebar"></div>
          <div class="chat">
            <div class="chat-header" id="chatHeader">Selecciona una conversación</div>
            <div class="chat-body" id="chatBody"><div class="vacio">Elige un contacto de la lista para ver los mensajes</div></div>
          </div>
        </div>

        <script>
          let numeroActivo = null;

          async function cargarContactos() {
            const res = await fetch('/dashboard/api/conversaciones');
            const conversaciones = await res.json();

            document.getElementById('contador').textContent = conversaciones.length + ' contacto' + (conversaciones.length === 1 ? '' : 's');

            const sidebar = document.getElementById('sidebar');
            sidebar.innerHTML = conversaciones.map(c => \`
              <div class="contacto \${c.numero === numeroActivo ? 'activo' : ''}" onclick="abrirConversacion('\${c.numero}')">
                <div class="numero">+\${c.numero}</div>
                <div class="preview">\${escapar(c.ultimoTexto).slice(0, 60)}</div>
                <div class="hora">\${new Date(c.ultimaHora).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</div>
              </div>
            \`).join('') || '<div class="vacio">Sin conversaciones todavía</div>';
          }

          async function abrirConversacion(numero) {
            numeroActivo = numero;
            cargarContactos();

            const res = await fetch('/dashboard/api/conversacion/' + encodeURIComponent(numero));
            const mensajes = await res.json();

            document.getElementById('chatHeader').textContent = '+' + numero + ' — ' + mensajes.length + ' mensaje' + (mensajes.length === 1 ? '' : 's');

            const body = document.getElementById('chatBody');
            body.innerHTML = mensajes.map(m => \`
              <div class="burbuja-fila" style="justify-content: \${m.direccion === 'saliente' ? 'flex-end' : 'flex-start'};">
                <div class="burbuja" style="background: \${m.direccion === 'saliente' ? '#DCF8C6' : '#FFFFFF'};">
                  <div class="texto">\${escapar(m.texto)}</div>
                  <div class="hora">\${new Date(m.hora).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</div>
                </div>
              </div>
            \`).join('') || '<div class="vacio">Sin mensajes</div>';

            body.scrollTop = body.scrollHeight;
          }

          function escapar(texto) {
            const div = document.createElement('div');
            div.textContent = texto || '';
            return div.innerHTML;
          }

          cargarContactos();
          setInterval(cargarContactos, 10000); // refrescar lista cada 10s
          setInterval(() => { if (numeroActivo) abrirConversacion(numeroActivo); }, 10000); // refrescar chat activo
        </script>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
