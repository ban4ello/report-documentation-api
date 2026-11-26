const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class AuthController {
  async signupUser(req, res) {
    // Публичная регистрация отключена — пользователей добавляет только админ.
    return res.status(403).json({
      message: 'Регистрация недоступна. Обратитесь к администратору.',
      code: 'SIGNUP_DISABLED'
    });
  }

  async loginUser(req, res) {
    const { email, password } = req.body;
  
    try {
      // Проверка rate limiting
      try {
        const loginAttempts = await db.query(
          'SELECT COUNT(*) FROM login_attempts WHERE email = $1 AND created_at > NOW() - INTERVAL \'15 minutes\'',
          [email]
        );
  
        if (parseInt(loginAttempts.rows[0].count) >= 5) {
          console.log(`🚫 Rate limit exceeded for email: ${email}`);
          return res.status(429).json({ 
            message: 'Слишком много попыток входа. Попробуйте позже.',
            retryAfter: 900
          });
        }
      } catch (rateLimitError) {
        // Если таблицы login_attempts еще нет, просто продолжаем
        console.log('⚠️ Таблица login_attempts не существует, пропускаем rate limiting');
      }
  
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  
      // Записываем попытку входа (независимо от результата)
      try {
        await db.query(
          'INSERT INTO login_attempts (email, success, ip_address) VALUES ($1, $2, $3)',
          [email, false, req.ip || req.connection.remoteAddress]
        );
      } catch (attemptsError) {
        // Игнорируем ошибку если таблицы нет
        console.log('⚠️ Не удалось записать попытку входа в таблицу');
      }
  
      if (result.rows.length === 0) {
        console.log(`⚠️ Попытка входа с несуществующим email: ${email}`);
        return res.status(401).json({ 
          message: 'Неверные учетные данные',
          code: 'INVALID_CREDENTIALS'
        });
      }
  
      const user = result.rows[0];
      const isMatch = await bcrypt.compare(password, user.password);
      
      if (!isMatch) {
        console.log(`⚠️ Неверный пароль для email: ${email}`);
        return res.status(401).json({ 
          message: 'Неверные учетные данные',
          code: 'INVALID_CREDENTIALS'
        });
      }
  
      // Успешный вход - обновляем запись о попытке
      try {
        await db.query(
          'UPDATE login_attempts SET success = true WHERE email = $1 AND created_at > NOW() - INTERVAL \'1 minute\'',
          [email]
        );
      } catch (updateError) {
        console.log('⚠️ Не удалось обновить запись о попытке входа');
      }
  
      const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
      
      console.log(`✅ Успешный вход пользователя: ${email}`);
      res.json({ 
        token, 
        user: { id: user.id, username: user.username, role: user.role, email: user.email } 
      });
    } catch (error) {
      console.error('❌ Ошибка при входе:', error);
      res.status(500).json({ message: 'Ошибка при входе' });
    }
  }

  async logoutUser(req, res) {
    try {
      // В JWT токенах logout обычно происходит на клиенте путем удаления токена
      // Но мы можем добавить логику для blacklist токенов если нужно
      res.json({ message: 'Успешный выход из системы' });
    } catch (error) {
      console.error('Ошибка при выходе:', error);
      res.status(500).json({ message: 'Ошибка при выходе' });
    }
  }
}

module.exports = new AuthController();
