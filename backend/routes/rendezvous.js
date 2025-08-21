const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { body, validationResult } = require('express-validator');

// GET /api/rendezvous/motifs - Récupérer la liste des motifs depuis la base de données
router.get('/motifs', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, libelle, agent_id FROM motifs');
    res.json(rows);
  } catch (err) {
    console.error('Erreur fetch motifs:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// GET /api/rendezvous/agents - Récupérer la liste des agents depuis la base de données
router.get('/agents', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, nom FROM utilisateurs WHERE role = ?', ['agent']);
    res.json(rows);
  } catch (err) {
    console.error('Erreur fetch agents:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// POST /api/rendezvous - Enregistrer un rendez-vous dans la base de données
router.post(
  '/',
  [
    body('contribuable_nom').trim().notEmpty().withMessage('Le nom complet est requis'),
    body('contribuable_email').isEmail().withMessage('Email invalide'),
    body('telephone').trim().notEmpty().withMessage('Le téléphone est requis'),
    body('motif_id').isInt().withMessage('Motif invalide'),
    body('agent_id').isInt().withMessage('Agent invalide'),
    body('date_rdv').isDate().withMessage('Date invalide'),
    body('heure_rdv').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Heure invalide'),
    body('statut').isIn(['en_attente']).withMessage('Statut invalide'),
    body('reference').notEmpty().withMessage('Référence requise')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation échouée', errors: errors.array() });
    }

    const { contribuable_nom, contribuable_email, telephone, motif_id, agent_id, date_rdv, heure_rdv, statut, reference } = req.body;

    try {
      // Vérifier si le motif existe et que l'agent correspond
      const [motifRows] = await db.query('SELECT id, agent_id FROM motifs WHERE id = ?', [motif_id]);
      if (motifRows.length === 0) {
        return res.status(400).json({ message: 'Motif non trouvé' });
      }
      if (motifRows[0].agent_id !== agent_id) {
        return res.status(400).json({ message: 'Agent non associé à ce motif' });
      }

      // Vérifier si l'agent existe
      const [agentRows] = await db.query('SELECT id FROM utilisateurs WHERE id = ? AND role = ?', [agent_id, 'agent']);
      if (agentRows.length === 0) {
        return res.status(400).json({ message: 'Agent non trouvé' });
      }

      // Vérifier date future
      const selectedDate = new Date(date_rdv);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        return res.status(400).json({ message: 'La date doit être dans le futur' });
      }

      // Insérer dans la base de données
      await db.query(
        'INSERT INTO rendez_vous (reference, contribuable_nom, contribuable_email, telephone, motif_id, agent_id, date_rdv, heure_rdv, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [reference, contribuable_nom, contribuable_email, telephone, motif_id, agent_id, date_rdv, heure_rdv, statut]
      );

      res.status(201).json({ message: 'Rendez-vous enregistré avec succès' });
    } catch (err) {
      console.error('Erreur enregistrement rendez-vous:', err);
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  }
);

module.exports = router;