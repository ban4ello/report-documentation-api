class ParentCalculationController {
  async createParentCalculation(req, res) {
    const { title } = req.body;
    const newParentCalculation = await req.userDb.query(`INSERT INTO parent_calculation (title) values ($1) RETURNING *`, [title]);

    res.json(newParentCalculation.rows[0]);
  }

  async getParentCalculation(req, res) {
    const id = req.params.id;
    const parent_calculation = await req.userDb.query('SELECT * FROM parent_calculation where id = $1', [id]);
    res.json(parent_calculation.rows[0]);
  }
  async deleteParentCalculation(req, res) {
    const id = req.params.id;
    const parent_calculation = await req.userDb.query('DELETE FROM parent_calculation where id = $1', [id]);
    res.json(parent_calculation.rows[0]);
  }

  async getParentCalculations(req, res) {
    const parent_calculations = await req.userDb.query('SELECT * FROM parent_calculation ORDER BY id');
    
    // Получаем связанные расчеты для каждого родительского расчета
    const parentCalculationsWithChildren = await Promise.all(
      parent_calculations.rows.map(async (parent) => {
        const calculations = await req.userDb.query(
          'SELECT id, title, calculation_type, total, date_of_creation FROM calculation WHERE parent_calculation_id = $1 ORDER BY id',
          [parent.id]
        );
        
        return {
          ...parent,
          calculations: calculations.rows
        };
      })
    );
    
    res.json(parentCalculationsWithChildren);
  }
}

module.exports = new ParentCalculationController();
