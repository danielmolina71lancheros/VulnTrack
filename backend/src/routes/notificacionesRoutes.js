const express = require('express');
const router = express.Router();
const controller = require('../controllers/notificacionesController');
const { verificarToken } = require('../middlewares/authMiddleware');

router.use(verificarToken);

// Todos pueden ver sus notificaciones y marcarlas como leídas
router.get('/', controller.obtenerNotificaciones);
router.put('/:id/leida', controller.marcarLeida);
router.put('/leidas', controller.marcarTodasLeidas);

module.exports = router;
