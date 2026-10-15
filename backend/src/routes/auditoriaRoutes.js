const express = require('express');
const router = express.Router();
const controller = require('../controllers/auditoriaController');
const { verificarToken } = require('../middlewares/authMiddleware');

router.use(verificarToken);
router.get('/', controller.obtenerEventos);

module.exports = router;
