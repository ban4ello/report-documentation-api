const db = require('../db');
const dbManager = require('../dbManager');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// const camelize = (s) => s.replace(/_./g, (x) => x[1].toUpperCase());

class AuthController {
  async signupUser(req, res) {
    const { username, password, email, role = 'guest' } = req.body;

    console.log('🔐 Попытка регистрации пользователя:', { username, email, role });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log('✅ Пароль захеширован');

      const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      console.log('✅ Проверка существующего пользователя завершена');

      if (existingUser.rows.length > 0) {
        console.log('⚠️ Пользователь уже существует');
        return res.status(401).json({ message: 'Такой пользователь уже зарегистрирован' });
      }

      const result = await db.query(
        'INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, hashedPassword, email, role]
      );

      const userId = result.rows[0].id;
      console.log(`✅ Пользователь создан с ID: ${userId}`);

      // Создаем базу данных для нового пользователя
      try {
        console.log(`🔄 Создание БД для пользователя ${userId}...`);
        await dbManager.createUserDatabase(userId);
        console.log(`✅ База данных для пользователя ${userId} создана успешно`);
      } catch (dbError) {
        console.error('❌ Ошибка при создании БД пользователя:', dbError);
        // Удаляем пользователя, если не удалось создать БД
        await db.query('DELETE FROM users WHERE id = $1', [userId]);
        console.log(`🗑️ Пользователь ${userId} удален из-за ошибки создания БД`);
        return res.status(500).json({ message: 'Ошибка при создании пользователя' });
      }

      console.log('🎉 Регистрация завершена успешно');
      res.status(201).json({ id: userId, email, username, role });
    } catch (error) {
      console.error('❌ Ошибка при регистрации:', error);
      res.status(500).json({ message: 'Ошибка при регистрации' });
    }
  }

  async loginUser(req, res) {
    const { email, password } = req.body;

    try {
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);

      if (result.rows.length === 0) {
        return res.status(401).json({ message: 'Пользователь не найден' });
      }

      const user = result.rows[0];

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Неверный пароль' });
      }

      const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user: { id: user.id, username: user.username, role: user.role, email: user.email } });
    } catch (error) {
      console.error('Ошибка при входе:', error);
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
