const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
const controller = require('../controllers/remediacionController');
const { verificarToken } = require('../middlewares/authMiddleware');
const { autorizarRoles } = require('../middlewares/roleMiddleware');

router.use(verificarToken);
router.post('/', autorizarRoles('ADMINISTRADOR', 'ANALISTA_SEGURIDAD', 'AUDITOR'), controller.crearPlan);
router.get('/', controller.obtenerPlanes);
router.get('/:id', controller.obtenerPlanPorId);
router.put('/:id', autorizarRoles('ADMINISTRADOR', 'ANALISTA_SEGURIDAD', 'REMEDIADOR'), controller.actualizarPlan);
router.patch('/:id/estado', autorizarRoles('ADMINISTRADOR', 'ANALISTA_SEGURIDAD', 'REMEDIADOR'), controller.cambiarEstadoPlan);
router.post('/:id/evidencias', autorizarRoles('ADMINISTRADOR', 'ANALISTA_SEGURIDAD', 'REMEDIADOR'), upload.single('archivo'), controller.agregarEvidencia);
router.get('/evidencia/:idEvidencia', controller.descargarEvidencia);
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'El archivo no puede superar 10 MB.' });
    }
    return next(error);
});
module.exports = router;
