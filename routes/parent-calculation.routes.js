const Router = require('express');
const router = new Router();
const parentCalculationController = require('../controller/parent-calculation.controller');
const authMiddleware = require('../middleware/auth');

/**
 * @openapi
 * /api/parent-calculation:
 *   post:
 *     tags: [Parent Calculation]
 *     summary: Создать родительский расчёт
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *     responses:
 *       201: { description: Родительский расчёт создан }
 *       401: { description: Не авторизован }
 */
router.post('/parent-calculation', authMiddleware, parentCalculationController.createParentCalculation);

/**
 * @openapi
 * /api/parent-calculations:
 *   get:
 *     tags: [Parent Calculation]
 *     summary: Список родительских расчётов
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Массив родительских расчётов }
 *       401: { description: Не авторизован }
 */
router.get('/parent-calculations', authMiddleware, parentCalculationController.getParentCalculations);

/**
 * @openapi
 * /api/parent-calculation/{id}:
 *   put:
 *     tags: [Parent Calculation]
 *     summary: Обновить родительский расчёт
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
 *             properties:
 *               title: { type: string }
 *     responses:
 *       200: { description: Родительский расчёт обновлён }
 *       401: { description: Не авторизован }
 *       404: { description: Не найдено }
 */
router.put('/parent-calculation/:id', authMiddleware, parentCalculationController.updateParentCalculation);

/**
 * @openapi
 * /api/parent-calculation/{id}/clone:
 *   post:
 *     tags: [Parent Calculation]
 *     summary: Клонировать родительский расчёт
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Клон создан }
 *       401: { description: Не авторизован }
 */
router.post('/parent-calculation/:id/clone', authMiddleware, parentCalculationController.cloneParentCalculation);

/**
 * @openapi
 * /api/parent-calculation/{id}:
 *   delete:
 *     tags: [Parent Calculation]
 *     summary: Удалить родительский расчёт
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
router.delete('/parent-calculation/:id', authMiddleware, parentCalculationController.deleteParentCalculation);

module.exports = router;
