// const camelize = (s) => s.replace(/_./g, (x) => x[1].toUpperCase());

class WorkersController {
  async createWorker(req, res) {
    const { name, lastname, position } = req.body;

    const newWorkerRes = await req.userDb.query(
      `INSERT INTO workers (name, lastname, position) values ($1, $2, $3) RETURNING *`, [name, lastname, position]
    );

    res.json(newWorkerRes.rows[0]);
  }

  async updateWorker(req, res) {
    const id = req.params.id;
    const { name, lastname, position } = req.body;

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

    res.json(updatedWorkerRes.rows[0]);
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
