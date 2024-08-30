const Router = require('express')
const router = new Router()
const userController = require('../controller/user.controller')

router.post('/user', userController.createUser)
router.get('/user/:id', userController.getUser)
router.put('/user', userController.updateUser)
router.delete('/user/:id', userController.deleteUser)
router.get('/users', userController.getUsers)

module.exports = router