const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// const camelize = (s) => s.replace(/_./g, (x) => x[1].toUpperCase());

class AuthController {
  async signupUser(req, res) {
    const { username, password, email, role = 'guest' } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);

      if (existingUser.rows.length > 0) {
        return res.status(401).json({ message: 'Такой пользователь уже зарегистрирован' });
      }

      const result = await db.query(
        'INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, hashedPassword, email, role]
      );

      res.status(201).json({ id: result.rows[0].id, email, username, role });
    } catch (error) {
      console.error('Ошибка при регистрации:', error);
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

      const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user: { id: user.id, username: user.username, role: user.role, email: user.email } });
    } catch (error) {
      console.error('Ошибка при входе:', error);
      res.status(500).json({ message: 'Ошибка при входе' });
    }
  }
}

module.exports = new AuthController();
