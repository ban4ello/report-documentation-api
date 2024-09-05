const Router = require('express')
const router = new Router()
const parentCalculationController = require('../controller/parent-calculation.controller')

router.post('/parent-calculation', parentCalculationController.createParentCalculation)
router.get('/parent-calculations', parentCalculationController.getParentCalculations)
// router.get('/parent-calculation/:id', parentCalculationController.getParentCalculation)
router.delete('/parent-calculation/:id', parentCalculationController.deleteParentCalculation)
// router.put('/Calculation', parentCalculationController.getCalculations)

module.exports = router