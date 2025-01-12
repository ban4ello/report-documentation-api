const Router = require('express')
const router = new Router()
const authController = require('../controller/auth.controller')

router.post('/signup', authController.signupUser)
router.post('/login', authController.loginUser)
// router.get('/users', authController.getAllUsers)

module.exports = router