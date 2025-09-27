const Router = require('express')
const router = new Router()
const parentCalculationController = require('../controller/parent-calculation.controller')
const authMiddleware = require('../middleware/auth')

router.post('/parent-calculation', authMiddleware, parentCalculationController.createParentCalculation)
router.get('/parent-calculations', authMiddleware, parentCalculationController.getParentCalculations)
// router.get('/parent-calculation/:id', parentCalculationController.getParentCalculation)
router.delete('/parent-calculation/:id', authMiddleware, parentCalculationController.deleteParentCalculation)
// router.put('/Calculation', parentCalculationController.getCalculations)

module.exports = router