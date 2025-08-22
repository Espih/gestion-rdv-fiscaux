const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { body, validationResult } = require('express-validator');

// GET /api/rendezvous/motifs
router.get('/motifs', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, libelle, agent_id FROM motifs');
    console.log('Motifs envoyés:', rows);
    res.json(rows);
  } catch (err) {
    console.error('Erreur fetch motifs:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// GET /api/rendezvous/agents
router.get('/agents', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, nom FROM utilisateurs WHERE role = ?', ['agent']);
    console.log('Agents envoyés:', rows);
    res.json(rows);
  } catch (err) {
    console.error('Erreur fetch agents:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// GET /api/rendezvous
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*, m.libelle as motif_libelle, u.nom as agent_nom
      FROM rendez_vous r
      LEFT JOIN motifs m ON r.motif_id = m.id
      LEFT JOIN utilisateurs u ON r.agent_id = u.id
    `);
    res.json(rows);
  } catch (err) {
    console.error('Erreur fetch rendez-vous:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// POST /api/rendezvous
router.post(
  '/',
  [
    body('contribuable_nom').trim().notEmpty().withMessage('Le nom complet est requis'),
    body('contribuable_email').isEmail().withMessage('Email invalide'),
    body('telephone').trim().notEmpty().withMessage('Le téléphone est requis'),
    body('motif_id').isInt().withMessage('Motif invalide'),
    body('agent_id').isInt().withMessage('Agent invalide'),
    body('date_rdv').isDate().withMessage('Date invalide'),
    body('heure_rdv').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Heure invalide'),
    body('statut').isIn(['en_attente']).withMessage('Statut invalide'),
    body('reference').notEmpty().withMessage('Référence requise')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Erreurs validation:', errors.array());
      return res.status(400).json({ message: 'Validation échouée', errors: errors.array() });
    }

    const { contribuable_nom, contribuable_email, telephone, motif_id, agent_id, date_rdv, heure_rdv, statut, reference } = req.body;
    console.log('Payload reçu:', req.body);

    try {
      const [motifRows] = await db.query('SELECT id, agent_id FROM motifs WHERE id = ?', [motif_id]);
      if (motifRows.length === 0) {
        console.log(`Motif ID ${motif_id} non trouvé`);
        return res.status(400).json({ message: 'Motif non trouvé' });
      }
      if (motifRows[0].agent_id !== agent_id) {
        console.log(`Agent ID ${agent_id} ne correspond pas à motif.agent_id ${motifRows[0].agent_id}`);
        return res.status(400).json({ message: 'Agent non associé à ce motif' });
      }

      const [agentRows] = await db.query('SELECT id FROM utilisateurs WHERE id = ? AND role = ?', [agent_id, 'agent']);
      if (agentRows.length === 0) {
        console.log(`Agent ID ${agent_id} non trouvé ou non agent`);
        return res.status(400).json({ message: 'Agent non trouvé' });
      }

      const selectedDate = new Date(date_rdv);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        console.log(`Date ${date_rdv} dans le passé`);
        return res.status(400).json({ message: 'La date doit être dans le futur' });
      }

      await db.query(
        'INSERT INTO rendez_vous (reference, contribuable_nom, contribuable_email, telephone, motif_id, agent_id, date_rdv, heure_rdv, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [reference, contribuable_nom, contribuable_email, telephone, motif_id, agent_id, date_rdv, heure_rdv.split(':').slice(0, 2).join(':'), statut]
      );
      console.log('Rendez-vous enregistré:', { reference, motif_id, agent_id });

      res.status(201).json({ message: 'Rendez-vous enregistré avec succès' });
    } catch (err) {
      console.error('Erreur enregistrement rendez-vous:', err);
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  }
);

// PUT /api/rendezvous/:id
router.put(
  '/:id',
  [
    body('date_rdv').isDate().withMessage('Date invalide'),
    body('heure_rdv').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Heure invalide'),
    body('agent_id').isInt().withMessage('Agent invalide'),
    body('statut').isIn(['en_attente', 'confirme', 'annule', 'modifie']).withMessage('Statut invalide')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Erreurs validation:', errors.array());
      return res.status(400).json({ message: 'Validation échouée', errors: errors.array() });
    }

    const { date_rdv, heure_rdv, agent_id, statut } = req.body;
    const { id } = req.params;

    try {
      const [rdvRows] = await db.query('SELECT id FROM rendez_vous WHERE id = ?', [id]);
      if (rdvRows.length === 0) {
        return res.status(404).json({ message: 'Rendez-vous non trouvé' });
      }

      const [agentRows] = await db.query('SELECT id FROM utilisateurs WHERE id = ? AND role = ?', [agent_id, 'agent']);
      if (agentRows.length === 0) {
        return res.status(400).json({ message: 'Agent non trouvé' });
      }

      const selectedDate = new Date(date_rdv);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        return res.status(400).json({ message: 'La date doit être dans le futur' });
      }

      await db.query(
        'UPDATE rendez_vous SET date_rdv = ?, heure_rdv = ?, agent_id = ?, statut = ? WHERE id = ?',
        [date_rdv, heure_rdv.split(':').slice(0, 2).join(':'), agent_id, statut, id]
      );
      console.log('Rendez-vous modifié:', { id, date_rdv, heure_rdv, agent_id, statut });
      res.json({ message: 'Rendez-vous modifié avec succès' });
    } catch (err) {
      console.error('Erreur modification rendez-vous:', err);
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  }
);

module.exports = router;