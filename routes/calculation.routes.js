const Router = require('express');
const router = new Router();
const multer = require('multer');
const calculationController = require('../controller/calculation.controller');
const authMiddleware = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Middleware для исправления кодировки имен файлов с русскими символами
const fixFileNameEncoding = (req, res, next) => {
  if (req.files && Array.isArray(req.files)) {
    req.files.forEach((file) => {
      if (file.originalname) {
        try {
          // Multer иногда неправильно интерпретирует UTF-8 как latin1
          // Пробуем декодировать из latin1 в utf8
          let decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');

          // Если имя содержит не-ASCII символы и выглядит как мусор, пробуем другие методы
          if (/[^\x00-\x7F]/.test(decodedName) && /[ÑÐ]/.test(file.originalname)) {
            // Это явно неправильная кодировка, используем декодированное имя
            file.originalname = decodedName;
          } else if (decodedName !== file.originalname) {
            // Имя изменилось при декодировании, используем декодированное
            file.originalname = decodedName;
          }

          // Дополнительная проверка: если имя содержит типичные символы неправильной кодировки
          if (/Ñ|Ð|Ñ|Ð/.test(file.originalname)) {
            decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
            if (!/[ÑÐ]/.test(decodedName)) {
              file.originalname = decodedName;
            }
          }
        } catch (error) {
          console.warn('Could not decode filename:', file.originalname, error);
        }
      }
    });
  }
  next();
};

/**
 * @openapi
 * /api/calculation:
 *   post:
 *     tags: [Calculation]
 *     summary: Создать расчёт
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201: { description: Расчёт создан }
 *       401: { description: Не авторизован }
 */
router.post('/calculation', authMiddleware, calculationController.createCalculation);

/**
 * @openapi
 * /api/calculations:
 *   get:
 *     tags: [Calculation]
 *     summary: Список расчётов
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Массив расчётов }
 *       401: { description: Не авторизован }
 */
router.get('/calculations', authMiddleware, calculationController.getCalculations);

/**
 * @openapi
 * /api/calculation/{id}:
 *   get:
 *     tags: [Calculation]
 *     summary: Получить расчёт по id
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Расчёт }
 *       401: { description: Не авторизован }
 */
router.get('/calculation/:id', authMiddleware, calculationController.getCalculation);

/**
 * @openapi
 * /api/calculation:
 *   get:
 *     tags: [Calculation]
 *     summary: Получить расчёт по parentId (query)
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: parentId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Расчёт или массив }
 *       401: { description: Не авторизован }
 */
router.get('/calculation', authMiddleware, calculationController.getCalculationByParentId);

/**
 * @openapi
 * /api/calculation/{id}:
 *   delete:
 *     tags: [Calculation]
 *     summary: Удалить расчёт
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Удалено }
 *       401: { description: Не авторизован }
 */
router.delete('/calculation/:id', authMiddleware, calculationController.deleteCalculation);

/**
 * @openapi
 * /api/calculation/{id}:
 *   put:
 *     tags: [Calculation]
 *     summary: Обновить расчёт
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200: { description: Обновлено }
 *       401: { description: Не авторизован }
 */
router.put('/calculation/:id', authMiddleware, calculationController.updCalculation);

/**
 * @openapi
 * /api/workers-data-table/{id}:
 *   delete:
 *     tags: [Calculation]
 *     summary: Удалить запись из таблицы работников расчёта
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Удалено }
 *       401: { description: Не авторизован }
 */
router.delete('/workers-data-table/:id', authMiddleware, calculationController.deleteItemFromWorkersData);

/**
 * @openapi
 * /api/itr-data-table/{id}:
 *   delete:
 *     tags: [Calculation]
 *     summary: Удалить запись из таблицы ИТР расчёта
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Удалено }
 *       401: { description: Не авторизован }
 */
router.delete('/itr-data-table/:id', authMiddleware, calculationController.deleteItemFromItrData);

/**
 * @openapi
 * /api/specification-data-table/{id}:
 *   delete:
 *     tags: [Calculation]
 *     summary: Удалить запись из таблицы спецификации расчёта
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Удалено }
 *       401: { description: Не авторизован }
 */
router.delete('/specification-data-table/:id', authMiddleware, calculationController.deleteItemFromSpecificationData);

/**
 * @openapi
 * /api/calculation/{id}/media-files:
 *   post:
 *     tags: [Calculation]
 *     summary: Загрузить медиафайлы к расчёту
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201: { description: Файлы загружены }
 *       401: { description: Не авторизован }
 */
router.post(
  '/calculation/:id/media-files',
  authMiddleware,
  upload.array('files', 10),
  fixFileNameEncoding,
  calculationController.uploadMediaFiles
);

/**
 * @openapi
 * /api/calculation/{id}/media-files:
 *   get:
 *     tags: [Calculation]
 *     summary: Список медиафайлов расчёта
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Массив медиафайлов }
 *       401: { description: Не авторизован }
 */
router.get('/calculation/:id/media-files', authMiddleware, calculationController.getMediaFiles);

/**
 * @openapi
 * /api/calculation-media-file/{id}:
 *   get:
 *     tags: [Calculation]
 *     summary: Скачать медиафайл
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Файл }
 *       401: { description: Не авторизован }
 */
router.get('/calculation-media-file/:id', authMiddleware, calculationController.downloadMediaFile);

/**
 * @openapi
 * /api/calculation-media-file/{id}:
 *   delete:
 *     tags: [Calculation]
 *     summary: Удалить медиафайл
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Удалено }
 *       401: { description: Не авторизован }
 */
router.delete('/calculation-media-file/:id', authMiddleware, calculationController.deleteMediaFile);

module.exports = router;
