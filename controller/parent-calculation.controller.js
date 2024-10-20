const db = require('../db');
class ParentCalculationController {
  async createParentCalculation(req, res) {
    const { title } = req.body;
    const newParentCalculation = await db.query(`INSERT INTO parent_calculation (title) values ($1) RETURNING *`, [title]);

    res.json(newParentCalculation.rows[0]);
  }

  async getParentCalculation(req, res) {
    const id = req.params.id;
    const parent_calculation = await db.query('SELECT * FROM parent_calculation where id = $1', [id]);
    res.json(parent_calculation.rows[0]);
  }
  async deleteParentCalculation(req, res) {
    const id = req.params.id;
    const parent_calculation = await db.query('DELETE FROM parent_calculation where id = $1', [id]);
    res.json(parent_calculation.rows[0]);
  }

  async getParentCalculations(req, res) {
    const parent_calculations = await db.query('SELECT * FROM parent_calculation');
    res.json(parent_calculations.rows);
  }
}

module.exports = new ParentCalculationController();
