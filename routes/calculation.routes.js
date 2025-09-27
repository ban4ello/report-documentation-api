const Router = require('express')
const router = new Router()
const calculationController = require('../controller/calculation.controller')
const authMiddleware = require('../middleware/auth')

router.post('/calculation', authMiddleware, calculationController.createCalculation)
router.get('/calculations', authMiddleware, calculationController.getCalculations)
router.get('/calculation/:id', authMiddleware, calculationController.getCalculation)
router.get('/calculation', authMiddleware, calculationController.getCalculationByParentId)
router.delete('/calculation/:id', authMiddleware, calculationController.deleteCalculation)
router.put('/calculation/:id', authMiddleware, calculationController.updCalculation)

router.delete('/workers-data-table/:id', authMiddleware, calculationController.deleteItemFromWorkersData)
router.delete('/itr-data-table/:id', authMiddleware, calculationController.deleteItemFromItrData)
router.delete('/specification-data-table/:id', authMiddleware, calculationController.deleteItemFromSpecificationData)

module.exports = router