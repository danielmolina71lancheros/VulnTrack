const express = require('express');
const router = express.Router();
const controller = require('../controllers/hallazgosController');
const { verificarToken } = require('../middlewares/authMiddleware');
const { autorizarRoles } = require('../middlewares/roleMiddleware');

router.use(verificarToken);
// Solo Administrador y Auditor pueden registrar o eliminar hallazgos
router.post('/', autorizarRoles('ADMINISTRADOR', 'AUDITOR'), controller.crearHallazgo);
router.delete('/:id', autorizarRoles('ADMINISTRADOR', 'AUDITOR'), controller.eliminarHallazgo);
// Todos pueden leer hallazgos y consultar NVD
router.get('/', controller.obtenerHallazgos);
router.get('/:id', controller.obtenerHallazgoPorId);
router.get('/nvd/:cve', controller.consultarNVD);

module.exports = router;
