const Router = require('express');
const router = new Router();
const templateController = require('../controller/template.controller');
const authMiddleware = require('../middleware/auth');

/**
 * @openapi
 * /api/template:
 *   post:
 *     tags: [Templates]
 *     summary: Создать шаблон
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, description: Название шаблона }
 *               templateType: { type: string, enum: [workers, itr], description: Тип шаблона }
 *               workersData: { type: array, description: Данные для шаблона "Зарплата - Цех" }
 *               itrData: { type: array, description: Данные для шаблона "Зарплата - ИТР" }
 *     responses:
 *       201: { description: Шаблон создан }
 *       400: { description: Ошибка валидации }
 *       401: { description: Не авторизован }
 */
router.post('/template', authMiddleware, templateController.createTemplate);

/**
 * @openapi
 * /api/templates:
 *   get:
 *     tags: [Templates]
 *     summary: Список всех шаблонов
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Массив шаблонов }
 *       401: { description: Не авторизован }
 */
router.get('/templates', authMiddleware, templateController.getTemplates);

/**
 * @openapi
 * /api/template/{id}:
 *   get:
 *     tags: [Templates]
 *     summary: Получить шаблон по ID
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Шаблон найден }
 *       404: { description: Шаблон не найден }
 *       401: { description: Не авторизован }
 */
router.get('/template/:id', authMiddleware, templateController.getTemplate);

/**
 * @openapi
 * /api/template/{id}:
 *   put:
 *     tags: [Templates]
 *     summary: Обновить шаблон
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               templateType: { type: string, enum: [workers, itr] }
 *               workersData: { type: array }
 *               itrData: { type: array }
 *     responses:
 *       200: { description: Шаблон обновлен }
 *       400: { description: Ошибка валидации }
 *       404: { description: Шаблон не найден }
 *       401: { description: Не авторизован }
 */
router.put('/template/:id', authMiddleware, templateController.updateTemplate);

/**
 * @openapi
 * /api/template/{id}:
 *   delete:
 *     tags: [Templates]
 *     summary: Удалить шаблон
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Шаблон удален }
 *       404: { description: Шаблон не найден }
 *       401: { description: Не авторизован }
 */
router.delete('/template/:id', authMiddleware, templateController.deleteTemplate);

module.exports = router;
