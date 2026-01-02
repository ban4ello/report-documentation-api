// const camelize = (s) => s.replace(/_./g, (x) => x[1].toUpperCase());

class WorkersController {
  async createWorker(req, res) {
    const { name, lastname, position } = req.body;

    try {
      // Проверка на дубликаты имен (без учета регистра)
      const existingWorker = await req.userDb.query(
        `SELECT * FROM workers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
        [name]
      );

      if (existingWorker.rows.length > 0) {
        return res.status(400).json({
          message: 'Сотрудник с таким именем уже существует',
          code: 'DUPLICATE_WORKER_NAME'
        });
      }

      const newWorkerRes = await req.userDb.query(
        `INSERT INTO workers (name, lastname, position) values ($1, $2, $3) RETURNING *`,
        [name, lastname, position]
      );

      res.json(newWorkerRes.rows[0]);
    } catch (error) {
      console.error('Ошибка при создании сотрудника:', error);
      res.status(500).json({ message: 'Ошибка при создании сотрудника' });
    }
  }

  async updateWorker(req, res) {
    const id = req.params.id;
    const { name, lastname, position } = req.body;

    try {
      // Проверка на дубликаты имен (без учета регистра, исключая текущего сотрудника)
      const existingWorker = await req.userDb.query(
        `SELECT * FROM workers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND id != $2`,
        [name, id]
      );

      if (existingWorker.rows.length > 0) {
        return res.status(400).json({
          message: 'Сотрудник с таким именем уже существует',
          code: 'DUPLICATE_WORKER_NAME'
        });
      }

      const updatedWorkerRes = await req.userDb.query(
        `UPDATE workers set 
				name = $1,
				lastname = $2,
				position = $3
				where id = $4 RETURNING *`,
        [
          name,
          lastname,
          position,
          id
        ]
      );

      if (updatedWorkerRes.rows.length === 0) {
        return res.status(404).json({
          message: 'Сотрудник не найден',
          code: 'WORKER_NOT_FOUND'
        });
      }

      res.json(updatedWorkerRes.rows[0]);
    } catch (error) {
      console.error('Ошибка при обновлении сотрудника:', error);
      res.status(500).json({ message: 'Ошибка при обновлении сотрудника' });
    }
  }

  async deleteWorkerById(req, res) {
    const id = req.params.id;
    const deletedWorkerRes = await req.userDb.query('DELETE FROM workers where id = $1', [id]);
    res.json(deletedWorkerRes.rows[0]);
  }

  async getWorkers(req, res) {
    const allWorkersRes = await req.userDb.query('SELECT * FROM workers');
    res.json(allWorkersRes.rows);
  }
}

module.exports = new WorkersController();
