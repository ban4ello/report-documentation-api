const Router = require('express')
const router = new Router()
const calculationController = require('../controller/calculation.controller')

router.post('/calculation', calculationController.createCalculation)
router.get('/calculations', calculationController.getCalculations)
router.get('/calculation/:id', calculationController.getCalculation)
router.get('/calculation', calculationController.getCalculationByParentId)
router.delete('/calculation/:id', calculationController.deleteCalculation)
router.put('/calculation/:id', calculationController.updCalculation)

router.delete('/workers-data-table/:id', calculationController.deleteItemFromWorkersData)
router.delete('/itr-data-table/:id', calculationController.deleteItemFromItrData)
router.delete('/specification-data-table/:id', calculationController.deleteItemFromSpecificationData)

module.exports = router