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

  async updateParentCalculation(req, res) {
    const id = req.params.id;
    const { title } = req.body;
    const result = await req.userDb.query('UPDATE parent_calculation SET title = $1 WHERE id = $2 RETURNING *', [title, id]);
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({
        message: 'Родительская калькуляция не найдена',
        code: 'PARENT_CALCULATION_NOT_FOUND'
      });
    }
    res.json(result.rows[0]);
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

  async cloneParentCalculation(req, res) {
    const sourceParentId = req.params.id;

    try {
      const parentResult = await req.userDb.query('SELECT * FROM parent_calculation WHERE id = $1', [sourceParentId]);
      if (!parentResult.rows || parentResult.rows.length === 0) {
        return res.status(404).json({
          message: 'Родительская калькуляция не найдена',
          code: 'PARENT_CALCULATION_NOT_FOUND'
        });
      }

      const sourceParent = parentResult.rows[0];
      const newTitle = (sourceParent.title || '') + ' копия';

      const newParentResult = await req.userDb.query('INSERT INTO parent_calculation (title) VALUES ($1) RETURNING *', [newTitle]);
      const newParent = newParentResult.rows[0];

      const calculationsResult = await req.userDb.query('SELECT * FROM calculation WHERE parent_calculation_id = $1 ORDER BY id', [
        sourceParentId
      ]);
      const calculations = calculationsResult.rows;

      for (const calc of calculations) {
        const consumablesData =
          calc.consumables_data != null
            ? typeof calc.consumables_data === 'string'
              ? calc.consumables_data
              : JSON.stringify(calc.consumables_data)
            : null;
        const hardwareData =
          calc.hardware_data != null
            ? typeof calc.hardware_data === 'string'
              ? calc.hardware_data
              : JSON.stringify(calc.hardware_data)
            : null;
        const metalData =
          calc.metal_data != null ? (typeof calc.metal_data === 'string' ? calc.metal_data : JSON.stringify(calc.metal_data)) : null;

        const newCalcResult = await req.userDb.query(
          `INSERT INTO calculation (
            itr_worked_days, coeficient_of_nds, cost_of_electricity_per_day, galvanized_value,
            number_of_days_per_shift, number_of_hours_per_shift, rental_cost_per_day, profitability_coeficient,
            title, transport_value, date_of_creation, last_edit_date, parent_calculation_id, calculation_type,
            consumables_data, hardware_data, metal_data, total_metal_per_item, total_processing_per_item,
            total_profitability_per_item, total, is_metal_enabled, is_hardware_enabled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING *`,
          [
            calc.itr_worked_days,
            calc.coeficient_of_nds,
            calc.cost_of_electricity_per_day,
            calc.galvanized_value,
            calc.number_of_days_per_shift,
            calc.number_of_hours_per_shift,
            calc.rental_cost_per_day,
            calc.profitability_coeficient,
            calc.title,
            calc.transport_value,
            calc.date_of_creation,
            calc.last_edit_date,
            newParent.id,
            calc.calculation_type,
            consumablesData,
            hardwareData,
            metalData,
            calc.total_metal_per_item,
            calc.total_processing_per_item,
            calc.total_profitability_per_item,
            calc.total,
            calc.is_metal_enabled ?? false,
            calc.is_hardware_enabled ?? false
          ]
        );
        const newCalculationId = newCalcResult.rows[0].id;

        const specData = await req.userDb.query('SELECT * FROM specification_data WHERE calculation_id = $1', [calc.id]);
        if (specData.rows.length > 0) {
          const specInsert = await req.userDb.query('INSERT INTO specification_data (notes, calculation_id) VALUES ($1, $2) RETURNING *', [
            specData.rows[0].notes,
            newCalculationId
          ]);
          const newSpecId = specInsert.rows[0].id;
          const specTable = await req.userDb.query('SELECT * FROM specification_data_table WHERE specification_data_id = $1', [
            specData.rows[0].id
          ]);
          for (const row of specTable.rows) {
            await req.userDb.query(
              'INSERT INTO specification_data_table (name, quantity, value_per_unit, unit_of_measurement, total_weight, specification_data_id) VALUES ($1, $2, $3, $4, $5, $6)',
              [row.name, row.quantity, row.value_per_unit, row.unit_of_measurement, row.total_weight, newSpecId]
            );
          }
        }

        const workersData = await req.userDb.query('SELECT * FROM workers_data WHERE calculation_id = $1', [calc.id]);
        if (workersData.rows.length > 0) {
          const wdInsert = await req.userDb.query('INSERT INTO workers_data (notes, calculation_id) VALUES ($1, $2) RETURNING *', [
            workersData.rows[0].notes,
            newCalculationId
          ]);
          const newWdId = wdInsert.rows[0].id;
          const wdTable = await req.userDb.query('SELECT * FROM workers_data_table WHERE workers_data_id = $1', [workersData.rows[0].id]);
          for (const row of wdTable.rows) {
            await req.userDb.query(
              'INSERT INTO workers_data_table (name, number_of_hours_worked, salary_per_day, salary_per_hour, total, workers_data_id) VALUES ($1, $2, $3, $4, $5, $6)',
              [row.name, row.number_of_hours_worked, row.salary_per_day, row.salary_per_hour, row.total, newWdId]
            );
          }
        }

        const itrData = await req.userDb.query('SELECT * FROM itr_data WHERE calculation_id = $1', [calc.id]);
        if (itrData.rows.length > 0) {
          const itrInsert = await req.userDb.query('INSERT INTO itr_data (notes, calculation_id) VALUES ($1, $2) RETURNING *', [
            itrData.rows[0].notes,
            newCalculationId
          ]);
          const newItrId = itrInsert.rows[0].id;
          const itrTable = await req.userDb.query('SELECT * FROM itr_data_table WHERE itr_data_id = $1', [itrData.rows[0].id]);
          for (const row of itrTable.rows) {
            await req.userDb.query('INSERT INTO itr_data_table (name, salary_per_month, itr_data_id) VALUES ($1, $2, $3)', [
              row.name,
              row.salary_per_month,
              newItrId
            ]);
          }
        }

        const workersTaxData = await req.userDb.query('SELECT * FROM workers_tax_data WHERE calculation_id = $1', [calc.id]);
        for (const row of workersTaxData.rows) {
          await req.userDb.query(
            'INSERT INTO workers_tax_data (order_id, name, coefficient, coefficient_a, coefficient_b, key, subtotal, total, calculation_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [
              row.order_id,
              row.name,
              row.coefficient,
              row.coefficient_a,
              row.coefficient_b,
              row.key,
              row.subtotal,
              row.total,
              newCalculationId
            ]
          );
        }

        const itrTaxData = await req.userDb.query('SELECT * FROM itr_tax_data WHERE calculation_id = $1', [calc.id]);
        for (const row of itrTaxData.rows) {
          await req.userDb.query(
            'INSERT INTO itr_tax_data (order_id, name, coefficient, coefficient_a, coefficient_b, key, subtotal, total, calculation_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [
              row.order_id,
              row.name,
              row.coefficient,
              row.coefficient_a,
              row.coefficient_b,
              row.key,
              row.subtotal,
              row.total,
              newCalculationId
            ]
          );
        }
      }

      const newCalculationsResult = await req.userDb.query(
        'SELECT id, title, calculation_type, total, date_of_creation FROM calculation WHERE parent_calculation_id = $1 ORDER BY id',
        [newParent.id]
      );

      res.status(201).json({
        ...newParent,
        calculations: newCalculationsResult.rows
      });
    } catch (error) {
      console.error('❌ Error cloning parent calculation:', error);
      res.status(500).json({
        message: 'Ошибка при клонировании родительской калькуляции',
        code: error.code || 'PARENT_CALCULATION_CLONE_ERROR'
      });
    }
  }
}

module.exports = new ParentCalculationController();
