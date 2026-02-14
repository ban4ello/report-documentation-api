const Router = require('express');
const router = new Router();
const workersController = require('../controller/workers.controller');
const authMiddleware = require('../middleware/auth');

/**
 * @openapi
 * /api/worker:
 *   post:
 *     tags: [Workers]
 *     summary: Создать работника
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               position: { type: string }
 *               other: { type: object }
 *     responses:
 *       201: { description: Работник создан }
 *       401: { description: Не авторизован }
 */
router.post('/worker', authMiddleware, workersController.createWorker);

/**
 * @openapi
 * /api/worker/{id}:
 *   put:
 *     tags: [Workers]
 *     summary: Обновить работника
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
router.put('/worker/:id', authMiddleware, workersController.updateWorker);

/**
 * @openapi
 * /api/worker/{id}:
 *   delete:
 *     tags: [Workers]
 *     summary: Удалить работника
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
router.delete('/worker/:id', authMiddleware, workersController.deleteWorkerById);

/**
 * @openapi
 * /api/workers:
 *   get:
 *     tags: [Workers]
 *     summary: Список работников
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Массив работников }
 *       401: { description: Не авторизован }
 */
router.get('/workers', authMiddleware, workersController.getWorkers);

/**
 * @openapi
 * /api/workers-test:
 *   get:
 *     tags: [Workers]
 *     summary: Тестовый эндпоинт
 *     security: []
 *     responses:
 *       200: { description: OK }
 */
router.get('/workers-test', (req, res) => {
  console.log('Test route hit');
  return res.json({ success: true });
});

module.exports = router;
