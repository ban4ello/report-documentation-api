const Router = require('express')
const router = new Router()
const workersController = require('../controller/workers.controller')
const authMiddleware = require('../middleware/auth')

router.post('/worker', authMiddleware, workersController.createWorker)
router.put('/worker', authMiddleware, workersController.updateWorker)
// router.get('/worker/:id', workersController.getWorkerById)
router.delete('/worker/:id', authMiddleware, workersController.deleteWorkerById)

router.get('/workers', authMiddleware, workersController.getWorkers)
router.get('/workers-test', (req, res) => {
    console.log('Test route hit');
    return res.json({ "success": true });
})

module.exports = router