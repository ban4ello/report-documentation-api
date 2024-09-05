const Router = require('express')
const router = new Router()
const calculationController = require('../controller/calculation.controller')

router.post('/calculation', calculationController.createCalculation)
router.get('/calculations', calculationController.getCalculations)
router.get('/calculation/:id', calculationController.getCalculation)
router.get('/calculation', calculationController.getCalculationByParentId)
router.delete('/calculation/:id', calculationController.deleteCalculation)
router.put('/calculation/:id', calculationController.updCalculation)

module.exports = router