const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

console.log('Tentative d\'importation de transporter...');
const { transporter } = require('../config/email'); // Changement : importation depuis config/email.js
console.log('Transporteur importé dans rendezvous.js:', transporter); // Débogage

if (!transporter || !transporter.sendMail) {
  console.error('Transporteur non valide ou non importé:', transporter);
}

// Nouvel endpoint pour supprimer les rendez-vous passés
router.delete('/past', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [result] = await db.query(
      'DELETE FROM rendez_vous WHERE date_rdv < ?',
      [today]
    );
    console.log(`Rendez-vous passés supprimés : ${result.affectedRows} lignes affectées`);
    res.json({ message: 'Rendez-vous passés supprimés avec succès', deletedCount: result.affectedRows });
  } catch (err) {
    console.error('Erreur suppression rendez-vous passés:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

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
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Authentification requise' });

    console.log('JWT_SECRET from env:', process.env.JWT_SECRET);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'aModifierApres');
    console.log('Utilisateur extrait du token:', { id: decoded.id, role: decoded.role });

    // Supprimer les rendez-vous passés uniquement pour les agents (optionnel, peut être retiré si le DELETE /past est utilisé)
    const today = new Date().toISOString().split('T')[0];
    if (decoded.role === 'agent') {
      await db.query(
        'DELETE FROM rendez_vous WHERE agent_id = ? AND date_rdv < ?',
        [decoded.id, today]
      );
      console.log(`Rendez-vous passés supprimés pour agent_id ${decoded.id} avant ${today}`);
    }

    // Récupérer les rendez-vous selon le rôle
    let query = 'SELECT r.*, u.nom AS agent_nom, u.email AS agent_email FROM rendez_vous r LEFT JOIN utilisateurs u ON r.agent_id = u.id';
    let params = [];

    if (decoded.role === 'agent') {
      query += ' WHERE r.agent_id = ?';
      params = [decoded.id];
    }

    const [rows] = await db.query(query, params);

    // Vérifier et envoyer des rappels 24h avant (pour agents)
    if (decoded.role === 'agent') {
      const now = new Date();
      rows.forEach(async (rdv) => {
        const rdvDate = new Date(rdv.date_rdv + 'T' + rdv.heure_rdv);
        const timeDiff = rdvDate - now;
        const twentyFourHours = 24 * 60 * 60 * 1000;

        if (timeDiff > 0 && timeDiff <= twentyFourHours && !rdv.reminderSent) {
          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: rdv.agent_email,
            subject: 'Rappel de rendez-vous',
            text: `Bonjour ${rdv.agent_nom},\n\nVous avez un rendez-vous demain à ${rdv.heure_rdv} avec ${rdv.contribuable_nom}. Référence : ${rdv.reference}.\n\nCordialement,\nL'équipe Gestion des RDV Fiscaux`,
          };

          try {
            if (transporter && transporter.sendMail) {
              await transporter.sendMail(mailOptions);
              console.log(`Rappel envoyé à ${rdv.agent_email} pour rendez-vous ${rdv.reference}`);
            } else {
              console.error('Transporteur non configuré correctement dans rappel:', transporter);
            }
          } catch (err) {
            console.error('Erreur envoi rappel:', err);
          }
        }
      });
    }

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
      // Vérifier si un rendez-vous existe déjà avec les mêmes date, heure, motif et agent
      const [existingRdv] = await db.query(
        'SELECT id FROM rendez_vous WHERE date_rdv = ? AND heure_rdv = ? AND motif_id = ? AND agent_id = ?',
        [date_rdv, heure_rdv.split(':').slice(0, 2).join(':'), motif_id, agent_id]
      );

      if (existingRdv.length > 0) {
        return res.status(400).json({
          message: 'Un rendez-vous existe déjà à cette date, heure, motif et avec cet agent. Veuillez choisir une autre date ou heure , merci!',
        });
      }

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
      const [rdvRows] = await db.query('SELECT id, contribuable_email FROM rendez_vous WHERE id = ?', [id]);
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

      // Envoyer email de confirmation au contribuable
      if (rdvRows[0] && transporter && transporter.sendMail) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: rdvRows[0].contribuable_email,
          subject: `Mise à jour du statut de votre rendez-vous - ${statut}`,
          text: `Bonjour ${rdvRows[0].contribuable_nom},\n\nLe statut de votre rendez-vous (Référence: ${id}) a été mis à jour à "${statut}".\n\nDétails :\n- Date : ${date_rdv}\n- Heure : ${heure_rdv}\n- Agent : ${agent_id}\n\nCordialement,\nL'équipe Gestion des RDV Fiscaux`,
        };

        try {
          await transporter.sendMail(mailOptions);
          console.log(`Email de confirmation envoyé à ${rdvRows[0].contribuable_email} pour rendez-vous ${id}`);
        } catch (err) {
          console.error('Erreur envoi email de confirmation:', err);
        }
      } else {
        console.error('Impossible d\'envoyer l\'email : transporter ou rdvRows[0] non défini', { transporter, rdvRows });
      }

      res.json({ message: 'Rendez-vous modifié avec succès' });
    } catch (err) {
      console.error('Erreur modification rendez-vous:', err);
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  }
);

module.exports = router;