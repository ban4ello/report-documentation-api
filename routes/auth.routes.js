const Router = require('express')
const router = new Router()
const authController = require('../controller/auth.controller')
const authMiddleware = require('../middleware/auth')

router.post('/signup', authController.signupUser)
router.post('/login', authController.loginUser)
router.post('/logout', authMiddleware, authController.logoutUser)
// router.get('/users', authController.getAllUsers)

module.exports = router