const express = require('express');
const router = express.Router();
const controller = require('../controllers/importacionController');
const { verificarToken } = require('../middlewares/authMiddleware');
const { autorizarRoles } = require('../middlewares/roleMiddleware');
const multer = require('multer');

// Configuración de multer en memoria
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // Límite de 10 MB
});

router.use(verificarToken);

// Descargar plantilla (cualquier rol autenticado, o limitarlo si se desea)
router.get('/plantilla', controller.descargarPlantilla);

// Solo Administradores pueden importar
router.post('/excel', autorizarRoles('ADMINISTRADOR'), upload.single('file'), controller.importar);

module.exports = router;
