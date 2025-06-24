const QRCode = require('qrcode');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'gueparsexparty@gmail.com',       // tu correo
    pass: 'attusczytqhcgnsi'          // no es tu contraseña normal, es una "contraseña de aplicación"
  }
});

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

// Registra la fuente para los textos
registerFont(path.join(__dirname, 'DroidSans-Bold.ttf'), { family: 'DroidSans' });

// Función para generar la boleta con fondo, texto y QR
async function generarBoletaVisual(nombre, cedula, tipoEntrada, idQR) {
  const ancho = 1080;
  const alto = 1920;

  const canvas = createCanvas(ancho, alto);
  const ctx = canvas.getContext('2d');

  // Fondo
  const fondo = await loadImage(path.join(__dirname, 'boleta_base.jpg'));
  ctx.drawImage(fondo, 0, 0, ancho, alto);

  // Texto: nombre, cédula, tipo
  ctx.font = 'bold 48px DroidSans';
  ctx.fillStyle = '#ffffff';

  ctx.fillText(`Nombre: ${nombre}`, 100, 730);
  ctx.fillText(`Cédula: ${cedula}`, 100, 800);
  ctx.fillText(`Tipo: ${tipoEntrada}`, 100, 870);

  // Generar QR como imagen
  const qrDataUrl = await QRCode.toDataURL(idQR);
  const qrImage = await loadImage(qrDataUrl);
  ctx.drawImage(qrImage, 290, 970, 500, 500); // posición centrada

  return canvas.toBuffer(); // devolvemos el PNG en buffer
}


const app = express();
app.use(cors());
app.use(express.json());

// Inicializar Firebase con la clave
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const db = admin.firestore();
const compradoresRef = db.collection('compradores');

app.get('/verificar/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const doc = await compradoresRef.doc(id).get();

    if (!doc.exists) {
      return res.status(404).send({ error: 'Entrada no válida' });
    }

    const data = doc.data();

    if (data.usado) {
      return res.status(200).send({
        valido: false,
        mensaje: 'Esta entrada ya fue utilizada',
        ...data
      });
    }

    // Marcar como usada
    await compradoresRef.doc(id).update({ usado: true });

    res.status(200).send({
      valido: true,
      mensaje: 'Entrada válida, acceso permitido',
      ...data
    });

  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Error al verificar la entrada' });
  }
});


app.post('/verificar', async (req, res) => {
  const { qrData } = req.body;

  if (!qrData) {
    return res.status(400).send({ valido: false, mensaje: 'No se recibió QR' });
  }

  try {
    const doc = await compradoresRef.doc(qrData).get();

    if (!doc.exists) {
      return res.status(404).send({ valido: false, mensaje: 'Entrada no válida' });
    }

    const data = doc.data();

    if (data.usado) {
      return res.status(200).send({
        valido: false,
        mensaje: 'Esta entrada ya fue utilizada',
        ...data
      });
    }

    await compradoresRef.doc(qrData).update({ usado: true });

    res.status(200).send({
      valido: true,
      mensaje: 'Entrada válida, acceso permitido',
      ...data
    });

  } catch (error) {
    console.error(error);
    res.status(500).send({ valido: false, mensaje: 'Error al verificar' });
  }
});


// Ruta para registrar un nuevo comprador
app.post('/registrar', async (req, res) => {
  const { nombre, cedula, correo, tipoEntrada } = req.body;

  if (!nombre || !cedula || !correo || !tipoEntrada) {
    return res.status(400).send({ error: 'Faltan campos requeridos' });
  }

  try {
    // Crear documento en Firestore
    const nuevoDoc = await compradoresRef.add({
      nombre,
      cedula,
      correo,
      tipoEntrada,
      creado: new Date().toISOString(),
	  usado: false
    });

    const compradorId = nuevoDoc.id;

// Generar la imagen personalizada con fondo, texto y QR
const imagenBoleta = await generarBoletaVisual(nombre, cedula, tipoEntrada, compradorId);
console.log('✅ Imagen generada correctamente');

const mailOptions = {
  from: 'gueparsexparty@gmail.com',
  to: correo,
  subject: 'Tu entrada para la Gueparsex Party 🎟️',
  html: `
    <h2>¡Hola ${nombre}!</h2>
    <p>Adjuntamos tu boleta en formato digital. Preséntala en la entrada del evento.</p>
    <p>¡Nos vemos pronto! 😉</p>
  `,
attachments: [
  {
    filename: 'entrada.png',
    content: imagenBoleta,
    cid: 'qrimage'
  }
]

};


    // Enviar el correo
    await transporter.sendMail(mailOptions);

    res.status(200).send({
      mensaje: 'Comprador registrado y correo enviado',
      id: compradorId
    });

  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Error en el registro o envío del correo' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
