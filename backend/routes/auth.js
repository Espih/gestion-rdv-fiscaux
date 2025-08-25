const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');
const rateLimit = require('express-rate-limit');

// Limitation des tentatives anti-brute force
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Trop de tentatives de connexion. Essayez à nouveau après 15 minutes.',
  standardHeaders: true, // Retourne les en-têtes RateLimit
  legacyHeaders: false, // Désactive les en-têtes legacy
  handler: (req, res) => {
    res.status(429).json({ message: 'Trop de tentatives. Veuillez réessayer plus tard.' });
  },
});

// Appliquer le limiteur à la route de login
router.use('/login', limiter);

router.post('/login', login);

module.exports = router;