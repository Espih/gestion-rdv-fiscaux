const db = require('../config/db');
const bcrypt = require('bcrypt');

// Lister tous les agents (admin)
const getAgents = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, nom, email, role FROM utilisateurs WHERE role = 'agent'");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Créer un agent (admin)
const createAgent = async (req, res) => {
    const { nom, email, mot_de_passe } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(mot_de_passe, 10);
        await db.query(
            "INSERT INTO utilisateurs (nom, email, mot_de_passe, role) VALUES (?, ?, ?, 'agent')",
            [nom, email, hashedPassword]
        );
        res.status(201).json({ message: 'Agent créé avec succès' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = { getAgents, createAgent };
