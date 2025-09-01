// config/email.js
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

console.log('Transporteur configuré dans email.js:', transporter);

// Vérifier la connexion SMTP
transporter.verify((error, success) => {
  if (error) {
    console.error('Erreur de connexion SMTP dans email.js:', error);
  } else {
    console.log('Serveur email prêt dans email.js:', success);
  }
});

module.exports = { transporter };