const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

// Middleware pour authentification
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentification requise' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    req.user = decoded; // Stocke l'utilisateur décodé
    next();
  } catch (err) {
    res.status(403).json({ message: 'Token invalide' });
  }
};

// Middleware pour rôle admin
const authorizeRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role) ) return res.status(403).json({ message: 'Accès interdit' });
  next();
};

// GET /api/users - Liste des utilisateurs (pour admin)
router.get('/', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, nom, email, role FROM utilisateurs');
    res.json(rows);
  } catch (err) {
    console.error('Erreur fetch utilisateurs:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// PUT /api/users/:id - Modifier un utilisateur (pour admin)
router.put(
  '/:id',
  authenticateToken,
  authorizeRole(['admin']),
  [
    body('nom').trim().notEmpty().withMessage('Nom requis'),
    body('email').isEmail().withMessage('Email invalide'),
    body('role').isIn(['admin', 'agent']).withMessage('Rôle invalide')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation échouée', errors: errors.array() });

    const { nom, email, role } = req.body;
    const { id } = req.params;

    try {
      const [rows] = await db.query('SELECT id FROM utilisateurs WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ message: 'Utilisateur non trouvé' });

      await db.query('UPDATE utilisateurs SET nom = ?, email = ?, role = ? WHERE id = ?', [nom, email, role, id]);
      res.json({ message: 'Utilisateur modifié avec succès' });
    } catch (err) {
      console.error('Erreur modification utilisateur:', err);
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  }
);

// PUT /api/auth/password - Changer le mot de passe (pour l'utilisateur connecté)
router.put(
  '/password',
  authenticateToken,
  [
    body('oldPassword').notEmpty().withMessage('Ancien mot de passe requis'),
    body('newPassword').notEmpty().withMessage('Nouveau mot de passe requis')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation échouée', errors: errors.array() });

    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    try {
      const [rows] = await db.query('SELECT mot_de_passe FROM utilisateurs WHERE id = ?', [userId]);
      if (rows.length === 0) return res.status(404).json({ message: 'Utilisateur non trouvé' });

      const match = await bcrypt.compare(oldPassword, rows[0].mot_de_passe);
      if (!match) return res.status(400).json({ message: 'Ancien mot de passe incorrect' });

      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await db.query('UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?', [hashedNewPassword, userId]);
      res.json({ message: 'Mot de passe modifié avec succès' });
    } catch (err) {
      console.error('Erreur modification mot de passe:', err);
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  }
);

module.exports = router;