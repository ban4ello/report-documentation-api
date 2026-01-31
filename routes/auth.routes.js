const Router = require('express');
const router = new Router();
const authController = require('../controller/auth.controller');
const authMiddleware = require('../middleware/auth');

/**
 * @openapi
 * /api/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Регистрация пользователя
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 6 }
 *     responses:
 *       201: { description: Пользователь создан }
 *       400: { description: Ошибка валидации }
 */
router.post('/signup', authController.signupUser);

/**
 * @openapi
 * /api/login:
 *   post:
 *     tags: [Auth]
 *     summary: Вход в систему
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Успешный вход, установлена cookie token }
 *       401: { description: Неверные данные }
 */
router.post('/login', authController.loginUser);

/**
 * @openapi
 * /api/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Выход из системы
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Cookie очищена }
 *       401: { description: Не авторизован }
 */
router.post('/logout', authMiddleware, authController.logoutUser);
// router.get('/users', authController.getAllUsers)

module.exports = router;
