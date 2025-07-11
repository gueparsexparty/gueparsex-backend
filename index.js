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

// Registrar ambas fuentes
registerFont(path.join(__dirname, 'DroidSans-Bold.ttf'), { family: 'DroidSansBold' });
registerFont(path.join(__dirname, 'DroidSans.ttf'), { family: 'DroidSans' });

async function generarBoletaVisual(nombre, cedula, tipoEntrada, idQR) {
  const ancho = 1080;
  const alto = 1920;

  const canvas = createCanvas(ancho, alto);
  const ctx = canvas.getContext('2d');

  const fondo = await loadImage(path.join(__dirname, 'boleta_base.jpg'));
  ctx.drawImage(fondo, 0, 0, ancho, alto);

  // Configurar estilos comunes
  ctx.fillStyle = '#ffffff';
  const titulos = ['Nombre:', 'Cédula:', 'Tipo:'];
  const datos = [nombre, cedula, tipoEntrada];

  const leftX = 300;
  const rightX = 750;
  let yBase = 730;
  const lineHeight = 70;

  for (let i = 0; i < titulos.length; i++) {
    ctx.font = '48px DroidSansBold';
    ctx.textAlign = 'center';
    ctx.fillText(titulos[i], leftX, yBase + i * lineHeight);

    ctx.font = '48px DroidSans';
    ctx.fillText(datos[i], rightX, yBase + i * lineHeight);
  }

  // Generar QR
  const qrDataUrl = await QRCode.toDataURL(idQR);
  const qrImage = await loadImage(qrDataUrl);

  const qrX = 290;
  const qrY = 1200; // posición más abajo
  ctx.drawImage(qrImage, qrX, qrY, 500, 500);

  return canvas.toBuffer();
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

// No marcamos como usada aún
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

app.post('/marcar-usada', async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).send({ success: false, error: 'ID no proporcionado' });
  }

  try {
    await compradoresRef.doc(id).update({ usado: true });
    res.send({ success: true });
  } catch (error) {
    console.error('Error marcando boleta como usada:', error);
    res.status(500).send({ success: false, error: 'Error al actualizar' });
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

app.post('/admin-login', async (req, res) => {
  const { usuario, password } = req.body;
  
  console.log("🔍 Login recibido:", { usuario, password });


  if (!usuario || !password) {
    return res.status(400).send({ error: 'Faltan campos requeridos' });
  }

  try {
    const adminsRef = db.collection('admins');
    const snapshot = await adminsRef
      .where('usuario', '==', usuario)
      .where('password', '==', password)
      .get();

	snapshot.forEach(doc => {
  console.log("📄 Documento encontrado:", doc.data());
});

    if (snapshot.empty) {
      return res.status(401).send({ error: 'Credenciales incorrectas' });
    }

    res.status(200).send({ autenticado: true });
	
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Error al verificar el login' });
  }
});
// NUEVA RUTA PARA REGISTRAR VENTA CON MULTIPLES BOLETAS
app.post('/registrar-venta', async (req, res) => {
  const { correo, boletas, valor, vendedor } = req.body;

  if (!correo || !boletas || !valor || !vendedor || !Array.isArray(boletas)) {
    return res.status(400).send({ error: 'Faltan campos requeridos o boletas inválidas' });
  }

  try {
    const ventaRef = await db.collection('ventas').add({
      correo,
      valor,
      vendedor,
      fecha: new Date().toISOString(),
      cantidad: boletas.length
    });

    const buffers = [];

    for (const b of boletas) {
      const nuevoDoc = await compradoresRef.add({
        nombre: b.nombre,
        cedula: b.cedula,
        tipoEntrada: b.tipo,
        correo,
        usado: false,
        ventaId: ventaRef.id,
        creado: new Date().toISOString()
      });

      const imagen = await generarBoletaVisual(b.nombre, b.cedula, b.tipo, nuevoDoc.id);

      buffers.push({
        filename: `entrada-${b.nombre}.png`,
        content: imagen,
        cid: `qr-${nuevoDoc.id}`
      });
    }

    const mailOptions = {
      from: 'gueparsexparty@gmail.com',
      to: correo,
      subject: 'Tus entradas para la Gueparsex Party 🎟️',
      html: `
        <h2>¡Hola!</h2>
        <p>Adjuntamos tus boletas digitales. Preséntalas en la entrada del evento.</p>
        <p>¡Nos vemos pronto! 😉</p>
      `,
      attachments: buffers
    };

    await transporter.sendMail(mailOptions);

    res.status(200).send({ mensaje: 'Venta registrada y boletas enviadas' });
  } catch (error) {
    console.error('❌ Error registrando venta:', error);
    res.status(500).send({ error: 'Error en el registro de la venta' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
