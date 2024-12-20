const Router = require('express')
const router = new Router()
const workersController = require('../controller/workers.controller')

router.post('/worker', workersController.createWorker)
router.put('/worker', workersController.updateWorker)
// router.get('/worker/:id', workersController.getWorkerById)
router.delete('/worker/:id', workersController.deleteWorkerById)

router.get('/workers', workersController.getWorkers)
router.get('/workers-test', (req, res) => {
    console.log('Test route hit');
    return res.json({ "success": true });
})

module.exports = router