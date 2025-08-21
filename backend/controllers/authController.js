const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const login = async (req, res, next) => {
    const { email, mot_de_passe } = req.body;

    try {
        // Vérifie si email est fourni
        if (!email || !mot_de_passe) {
            return res.status(400).json({ message: "Email et mot de passe requis" });
        }

        // Chercher utilisateur
        const [rows] = await db.query('SELECT * FROM utilisateurs WHERE email = ?', [email]);
        if (rows.length === 0) {
            console.warn(`⚠️ Tentative de connexion avec email inexistant : ${email}`);
            return res.status(400).json({ message: 'Utilisateur non trouvé' });
        }

        const user = rows[0];

        // Vérifier le mot de passe (hashé en base)
        const match = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
        if (!match) {
            console.warn(`⚠️ Mot de passe incorrect pour l'utilisateur : ${email}`);
            return res.status(400).json({ message: 'Mot de passe incorrect' });
        }

        // Vérification supplémentaire du rôle (optionnel, pour robustesse)
        if (!['admin', 'agent'].includes(user.role)) {
            console.warn(`⚠️ Rôle invalide pour l'utilisateur : ${email}`);
            return res.status(400).json({ message: 'Rôle invalide' });
        }

        // Génération du token
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET || "secret123",  // en cas d'oubli dans .env
            { expiresIn: '1d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                nom: user.nom,
                role: user.role,
                email: user.email
            }
        });
    } catch (err) {
        console.error("🔥 ERREUR DANS LOGIN :", err.message);
        console.error("📌 Stack :", err.stack);
        console.error("📌 Détails supplémentaires :", err); // Logging plus détaillé
        next(err); // envoie vers middleware d'erreur du server.js
    }
};

module.exports = { login };