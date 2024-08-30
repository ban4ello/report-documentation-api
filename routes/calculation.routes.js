const Router = require('express')
const router = new Router()
const calculationController = require('../controller/calculation.controller')

router.post('/calculation', calculationController.createCalculation)
router.get('/calculations', calculationController.getCalculations)
router.get('/calculation/:id', calculationController.getCalculation)
// router.delete('/Calculation/:id', calculationController.deleteCalculation)
// router.put('/Calculation', calculationController.getCalculations)

module.exports = router