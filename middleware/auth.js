const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    // Получаем токен из заголовка Authorization
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ message: 'Токен доступа отсутствует' });
    }

    // Проверяем формат Bearer token
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Неверный формат токена' });
    }

    // Извлекаем токен
    const token = authHeader.substring(7); // Убираем "Bearer "

    if (!token) {
      return res.status(401).json({ message: 'Токен доступа отсутствует' });
    }

    // Проверяем токен
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Добавляем информацию о пользователе в запрос
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Токен истек' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Неверный токен' });
    } else {
      console.error('Ошибка при проверке токена:', error);
      return res.status(500).json({ message: 'Ошибка сервера при проверке токена' });
    }
  }
};

module.exports = authMiddleware;
