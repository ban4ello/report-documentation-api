require('dotenv').config();
const pool = require('../db');

async function cloneCalculation(sourceCalcId = 1, targetUserId = null) {
  const client = await pool.connect();

  try {
    // Get userId from environment or arguments
    const finalUserId = targetUserId || process.env.USER_ID;
    const schemaName = finalUserId ? `user_${finalUserId}` : 'public';

    if (!finalUserId) {
      console.error('❌ Ошибка: Необходимо указать USER_ID в .env файле или через аргумент командной строки');
      console.log('Пример: node scripts/clone-calculation.js 1 3');
      console.log('       или установите USER_ID в .env файле');
      process.exit(1);
    }

    console.log(`Начинаю клонирование calculation ID=${sourceCalcId} для пользователя ${finalUserId}`);
    console.log(`Целевая схема: ${schemaName}\n`);

    // Set search path to target schema
    await client.query(`SET search_path TO ${schemaName}, public`);

    // 1. Get source calculation with all related data
    const sourceCalculation = await client.query('SELECT * FROM calculation WHERE id = $1', [sourceCalcId]);

    if (sourceCalculation.rows.length === 0) {
      console.error(`❌ Calculation с ID ${sourceCalcId} не найдена`);
      process.exit(1);
    }

    const calc = sourceCalculation.rows[0];
    console.log(`✓ Найдена calculation: "${calc.title}"`);
    console.log(`  Тип: ${calc.calculation_type}`);
    console.log(`  Parent ID: ${calc.parent_calculation_id}`);

    // 2. Get related data
    const specificationData = await client.query('SELECT * FROM specification_data WHERE calculation_id = $1', [sourceCalcId]);
    const specificationDataTable = specificationData.rows.length > 0
      ? await client.query('SELECT * FROM specification_data_table WHERE specification_data_id = $1', [specificationData.rows[0].id])
      : { rows: [] };

    const workersData = await client.query('SELECT * FROM workers_data WHERE calculation_id = $1', [sourceCalcId]);
    const workersDataTable = workersData.rows.length > 0
      ? await client.query('SELECT * FROM workers_data_table WHERE workers_data_id = $1', [workersData.rows[0].id])
      : { rows: [] };

    const itrData = await client.query('SELECT * FROM itr_data WHERE calculation_id = $1', [sourceCalcId]);
    const itrDataTable = itrData.rows.length > 0
      ? await client.query('SELECT * FROM itr_data_table WHERE itr_data_id = $1', [itrData.rows[0].id])
      : { rows: [] };

    const workersTaxData = await client.query('SELECT * FROM workers_tax_data WHERE calculation_id = $1', [sourceCalcId]);
    const itrTaxData = await client.query('SELECT * FROM itr_tax_data WHERE calculation_id = $1', [sourceCalcId]);

    console.log(`✓ Загружены связанные данные:`);
    console.log(`  - specification_data: ${specificationDataTable.rows.length} записей`);
    console.log(`  - workers_data: ${workersDataTable.rows.length} записей`);
    console.log(`  - itr_data: ${itrDataTable.rows.length} записей`);
    console.log(`  - workers_tax_data: ${workersTaxData.rows.length} записей`);
    console.log(`  - itr_tax_data: ${itrTaxData.rows.length} записей`);

    // 3. Create new parent_calculation
    let newParentCalculationId;
    if (calc.calculation_type === 'plan') {
      const newParentTitle = `${calc.title} (копия ${new Date().toISOString().split('T')[0]})`;
      const parentResult = await client.query(
        'INSERT INTO parent_calculation (title) VALUES ($1) RETURNING *',
        [newParentTitle]
      );
      newParentCalculationId = parentResult.rows[0].id;
      console.log(`✓ Создана новая parent_calculation ID=${newParentCalculationId}: "${newParentTitle}"`);
    } else {
      newParentCalculationId = calc.parent_calculation_id;
      console.log(`✓ Использован существующий parent_calculation ID=${newParentCalculationId}`);
    }

    // 4. Create new calculation
    const newTitle = `${calc.title} (копия)`;
    
    // Handle JSON fields safely
    let consumablesData, hardwareData, metalData;
    
    try {
      consumablesData = calc.consumables_data ? 
        (typeof calc.consumables_data === 'string' ? calc.consumables_data : JSON.stringify(calc.consumables_data)) : null;
      hardwareData = calc.hardware_data ? 
        (typeof calc.hardware_data === 'string' ? calc.hardware_data : JSON.stringify(calc.hardware_data)) : null;
      metalData = calc.metal_data ? 
        (typeof calc.metal_data === 'string' ? calc.metal_data : JSON.stringify(calc.metal_data)) : null;
    } catch (error) {
      console.log('⚠️  Предупреждение: Проблема с JSON данными, используем null');
      consumablesData = null;
      hardwareData = null;
      metalData = null;
    }
    
    const newCalculationResult = await client.query(
      `INSERT INTO calculation (
        itr_worked_days,
        coeficient_of_nds,
        cost_of_electricity_per_day,
        galvanized_value,
        number_of_days_per_shift,
        number_of_hours_per_shift,
        rental_cost_per_day,
        profitability_coeficient,
        title,
        transport_value,
        last_edit_date,
        parent_calculation_id,
        calculation_type,
        consumables_data,
        hardware_data,
        metal_data,
        total_metal_per_item,
        total_processing_per_item,
        total_profitability_per_item,
        total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING *`,
      [
        calc.itr_worked_days,
        calc.coeficient_of_nds,
        calc.cost_of_electricity_per_day,
        calc.galvanized_value,
        calc.number_of_days_per_shift,
        calc.number_of_hours_per_shift,
        calc.rental_cost_per_day,
        calc.profitability_coeficient,
        newTitle,
        calc.transport_value,
        calc.last_edit_date,
        newParentCalculationId,
        calc.calculation_type,
        consumablesData,
        hardwareData,
        metalData,
        calc.total_metal_per_item,
        calc.total_processing_per_item,
        calc.total_profitability_per_item,
        calc.total
      ]
    );

    const newCalculationId = newCalculationResult.rows[0].id;
    console.log(`✓ Создана новая calculation ID=${newCalculationId}: "${newTitle}"`);

    // 5. Create related data if exists

    // Specification data
    if (specificationData.rows.length > 0) {
      const newSpecificationDataResult = await client.query(
        'INSERT INTO specification_data (notes, calculation_id) VALUES ($1, $2) RETURNING *',
        [specificationData.rows[0].notes, newCalculationId]
      );
      const newSpecificationDataId = newSpecificationDataResult.rows[0].id;

      for (const item of specificationDataTable.rows) {
        await client.query(
          'INSERT INTO specification_data_table (name, quantity, value_per_unit, unit_of_measurement, total_weight, specification_data_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [item.name, item.quantity, item.value_per_unit, item.unit_of_measurement, item.total_weight, newSpecificationDataId]
        );
      }
      console.log(`  ✓ Клонированы данные specification_data_table: ${specificationDataTable.rows.length} записей`);
    }

    // Workers data
    if (workersData.rows.length > 0) {
      const newWorkersDataResult = await client.query(
        'INSERT INTO workers_data (notes, calculation_id) VALUES ($1, $2) RETURNING *',
        [workersData.rows[0].notes, newCalculationId]
      );
      const newWorkersDataId = newWorkersDataResult.rows[0].id;

      for (const item of workersDataTable.rows) {
        await client.query(
          'INSERT INTO workers_data_table (name, number_of_hours_worked, salary_per_day, salary_per_hour, total, workers_data_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [item.name, item.number_of_hours_worked, item.salary_per_day, item.salary_per_hour, item.total, newWorkersDataId]
        );
      }
      console.log(`  ✓ Клонированы данные workers_data_table: ${workersDataTable.rows.length} записей`);
    }

    // ITR data
    if (itrData.rows.length > 0) {
      const newItrDataResult = await client.query(
        'INSERT INTO itr_data (notes, calculation_id) VALUES ($1, $2) RETURNING *',
        [itrData.rows[0].notes, newCalculationId]
      );
      const newItrDataId = newItrDataResult.rows[0].id;

      for (const item of itrDataTable.rows) {
        await client.query(
          'INSERT INTO itr_data_table (name, salary_per_month, itr_data_id) VALUES ($1, $2, $3)',
          [item.name, item.salary_per_month, newItrDataId]
        );
      }
      console.log(`  ✓ Клонированы данные itr_data_table: ${itrDataTable.rows.length} записей`);
    }

    // Workers tax data
    for (const item of workersTaxData.rows) {
      await client.query(
        'INSERT INTO workers_tax_data (order_id, name, coefficient, coefficient_a, coefficient_b, key, subtotal, total, calculation_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [item.order_id, item.name, item.coefficient, item.coefficient_a, item.coefficient_b, item.key, item.subtotal, item.total, newCalculationId]
      );
    }
    if (workersTaxData.rows.length > 0) {
      console.log(`  ✓ Клонированы данные workers_tax_data: ${workersTaxData.rows.length} записей`);
    }

    // ITR tax data
    for (const item of itrTaxData.rows) {
      await client.query(
        'INSERT INTO itr_tax_data (order_id, name, coefficient, coefficient_a, coefficient_b, key, subtotal, total, calculation_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [item.order_id, item.name, item.coefficient, item.coefficient_a, item.coefficient_b, item.key, item.subtotal, item.total, newCalculationId]
      );
    }
    if (itrTaxData.rows.length > 0) {
      console.log(`  ✓ Клонированы данные itr_tax_data: ${itrTaxData.rows.length} записей`);
    }

    console.log(`\n✅ Клонирование завершено успешно!`);
    console.log(`📊 Создана новая запись:`);
    console.log(`   - calculation ID: ${newCalculationId}`);
    console.log(`   - parent_calculation ID: ${newParentCalculationId}`);
    console.log(`   - title: "${newTitle}"`);

  } catch (error) {
    console.error('❌ Ошибка при клонировании:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Get arguments
// Usage: node clone-calculation.js [sourceCalcId] [userId]
// Example: node clone-calculation.js 1 3
const args = process.argv.slice(2);
const sourceCalcId = args[0] ? parseInt(args[0], 10) : 1;
const userId = args[1] ? parseInt(args[1], 10) : null;

if (isNaN(sourceCalcId)) {
  console.error('❌ Ошибка: sourceCalcId должен быть числом');
  process.exit(1);
}

// Run the script
cloneCalculation(sourceCalcId, userId)
  .then(() => {
    console.log('\n🎉 Скрипт завершен успешно!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });

