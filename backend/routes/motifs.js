const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');
const { getMotifs, createMotif } = require('../controllers/motifsController');

router.get('/', authenticateToken, getMotifs);
router.post('/', authenticateToken, authorizeRole(['admin']), createMotif);

module.exports = router;
