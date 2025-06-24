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

    // Generar el código QR (codificamos el ID del documento)
    const qrDataURL = await QRCode.toDataURL(compradorId);

    // Crear contenido del correo
    const mailOptions = {
      from: 'TU_CORREO@gmail.com',
      to: correo,
      subject: 'Tu entrada para el evento 🎟️',
      html: `
        <h2>¡Hola ${nombre}!</h2>
        <p>Gracias por comprar tu entrada para la Gueparsex Party.</p>
        <p><strong>Tipo de entrada:</strong> ${tipoEntrada}</p>
        <p><strong>Cédula:</strong> ${cedula}</p>
        <p>Presenta este código QR en la entrada:</p>
        <img src="cid:qrimage" alt="QR Code" style="width:200px;" />
        <p>Nos vemos pronto 😉</p>
      `,
	  attachments: [
  {
    filename: 'entrada.png',
    content: qrDataURL.split("base64,")[1],
    encoding: 'base64',
    cid: 'qrimage' // Esto enlaza la imagen con el <img src="cid:qrimage" />
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
