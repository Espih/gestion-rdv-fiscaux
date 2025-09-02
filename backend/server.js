// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
// Supprimez l'importation de nodemailer et la configuration de transporter ici
const { transporter } = require('./config/email'); // Importation de transporter

const app = express();
const PORT = process.env.PORT || 5000;
const usersRoutes = require('./routes/users');

// Middleware
app.use(cors({
  origin: 'http://localhost:3000', // autorise ton frontend React
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// Import des routes
const rendezvousRoutes = require('./routes/rendezvous');
const authRoutes = require('./routes/auth');

app.use('/api/rendezvous', rendezvousRoutes);
app.use('/api/auth', authRoutes);  // ✅ ajout login

// Middleware d'erreur (logs détaillés)
app.use((err, req, res, next) => {
  console.error("🔥 ERREUR BACKEND :", err.message);
  console.error("📌 Stack :", err.stack);
  res.status(500).json({ error: "Erreur interne du serveur", details: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur backend lancé sur http://localhost:${PORT}`);
});

app.use('/api/users', usersRoutes);
