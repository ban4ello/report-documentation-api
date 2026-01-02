const Router = require('express')
const router = new Router()
const multer = require('multer')
const calculationController = require('../controller/calculation.controller')
const authMiddleware = require('../middleware/auth')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
})

// Middleware для исправления кодировки имен файлов с русскими символами
const fixFileNameEncoding = (req, res, next) => {
  if (req.files && Array.isArray(req.files)) {
    req.files.forEach((file) => {
      if (file.originalname) {
        try {
          // Multer иногда неправильно интерпретирует UTF-8 как latin1
          // Пробуем декодировать из latin1 в utf8
          let decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8')
          
          // Если имя содержит не-ASCII символы и выглядит как мусор, пробуем другие методы
          if (/[^\x00-\x7F]/.test(decodedName) && /[ÑÐ]/.test(file.originalname)) {
            // Это явно неправильная кодировка, используем декодированное имя
            file.originalname = decodedName
          } else if (decodedName !== file.originalname) {
            // Имя изменилось при декодировании, используем декодированное
            file.originalname = decodedName
          }
          
          // Дополнительная проверка: если имя содержит типичные символы неправильной кодировки
          if (/Ñ|Ð|Ñ|Ð/.test(file.originalname)) {
            decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8')
            if (!/[ÑÐ]/.test(decodedName)) {
              file.originalname = decodedName
            }
          }
        } catch (error) {
          console.warn('Could not decode filename:', file.originalname, error)
        }
      }
    })
  }
  next()
}

router.post('/calculation', authMiddleware, calculationController.createCalculation)
router.get('/calculations', authMiddleware, calculationController.getCalculations)
router.get('/calculation/:id', authMiddleware, calculationController.getCalculation)
router.get('/calculation', authMiddleware, calculationController.getCalculationByParentId)
router.delete('/calculation/:id', authMiddleware, calculationController.deleteCalculation)
router.put('/calculation/:id', authMiddleware, calculationController.updCalculation)

router.delete('/workers-data-table/:id', authMiddleware, calculationController.deleteItemFromWorkersData)
router.delete('/itr-data-table/:id', authMiddleware, calculationController.deleteItemFromItrData)
router.delete('/specification-data-table/:id', authMiddleware, calculationController.deleteItemFromSpecificationData)

// Media files routes
router.post('/calculation/:id/media-files', authMiddleware, upload.array('files', 10), fixFileNameEncoding, calculationController.uploadMediaFiles)
router.get('/calculation/:id/media-files', authMiddleware, calculationController.getMediaFiles)
router.get('/calculation-media-file/:id', authMiddleware, calculationController.downloadMediaFile)
router.delete('/calculation-media-file/:id', authMiddleware, calculationController.deleteMediaFile)

module.exports = router