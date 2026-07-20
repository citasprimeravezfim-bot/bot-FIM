const express = require("express");
const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 👋 Mensaje de bienvenida (se envía la primera vez que un número escribe)
const WELCOME_MESSAGE = "Hola, mi nombre es Adri, ¿en qué te puedo ayudar?";

// Nota: este set vive en memoria y se reinicia si el servidor se reinicia/redeploya.
// Para algo más permanente habría que guardar los números en una base de datos.
const usuariosConversando = new Set();

// 📋 Guion de preguntas y respuestas de la clínica (implantes dentales)
const SYSTEM_PROMPT = `Eres Adri, el asistente de WhatsApp de una clínica de implantes dentales. Respondes en español, de forma breve, cálida y profesional. Si te preguntan tu nombre, di que te llamas Adri.

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

- Si el paciente quiere agendar una cita: Responde "Con gusto, ¿qué día puedes asistir a una valoración? Nuestros horarios son de lunes a viernes de 10:00 a 19:00 horas y los sábados de 10:00 a 14:00".

Si te preguntan algo que no está en esta lista, responde de forma amable y honesta, sin inventar datos, precios ni condiciones que no se te dieron. Si no sabes la respuesta, sugiere que un miembro del equipo de la clínica le dará seguimiento.`;

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
    }

    // 🤖 Llamar a Claude
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: text }],
      system: SYSTEM_PROMPT,
    });

    const reply = response.content[0].text;

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
  } catch (err) {
    if (err.response?.data) {
      console.error("Error:", JSON.stringify(err.response.data));
    } else {
      console.error("Error:", err.message);
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
