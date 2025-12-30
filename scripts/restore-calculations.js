require('dotenv').config();
const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function restoreCalculations(backupFilePath, userId = null, clearExisting = false) {
  const client = await pool.connect();

  try {
    // 1. Read backup file
    if (!fs.existsSync(backupFilePath)) {
      console.error(`❌ Ошибка: Файл бэкапа не найден: ${backupFilePath}`);
      process.exit(1);
    }

    const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));

    // Validate backup structure
    if (!backupData.metadata || !backupData.parent_calculations) {
      console.error('❌ Ошибка: Неверный формат файла бэкапа');
      process.exit(1);
    }

    // Get userId from backup or parameter
    const targetUserId = userId || backupData.metadata.userId || process.env.USER_ID;
    
    if (!targetUserId) {
      console.error('❌ Ошибка: userId должен быть указан');
      process.exit(1);
    }

    const schemaName = `user_${targetUserId}`;
    
    console.log(`Начинаю восстановление из бэкапа...`);
    console.log(`Файл бэкапа: ${backupFilePath}`);
    console.log(`Дата бэкапа: ${backupData.metadata.backupDate}`);
    console.log(`Целевая схема: ${schemaName}\n`);

    // Set search path to target schema
    await client.query(`SET search_path TO ${schemaName}, public`);

    // 2. Clear existing data if requested
    if (clearExisting) {
      console.log('⚠️  Очистка существующих данных...');
      const countResult = await client.query('SELECT COUNT(*) as count FROM parent_calculation');
      const currentCount = parseInt(countResult.rows[0].count);
      
      if (currentCount > 0) {
        await client.query('DELETE FROM parent_calculation');
        console.log(`✓ Удалено ${currentCount} существующих записей parent_calculation`);
      }
    }

    // 3. Restore data
    let restoredParentCount = 0;
    let restoredCalcCount = 0;
    let restoredSpecDataCount = 0;
    let restoredWorkersDataCount = 0;
    let restoredItrDataCount = 0;
    let restoredWorkersTaxCount = 0;
    let restoredItrTaxCount = 0;

    for (const parentCalc of backupData.parent_calculations) {
      console.log(`\n📦 Восстановление parent_calculation: "${parentCalc.title}"`);

      // Insert parent_calculation
      const parentResult = await client.query(
        'INSERT INTO parent_calculation (title, date_of_creation) VALUES ($1, $2) RETURNING *',
        [parentCalc.title, parentCalc.date_of_creation]
      );
      const newParentId = parentResult.rows[0].id;
      restoredParentCount++;

      console.log(`  ✓ Создана parent_calculation ID=${newParentId}`);

      // Restore calculations
      for (const calc of parentCalc.calculations) {
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
          console.log('  ⚠️  Предупреждение: Проблема с JSON данными, используем null');
          consumablesData = null;
          hardwareData = null;
          metalData = null;
        }

        // Insert calculation
        const calcResult = await client.query(
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
            date_of_creation,
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
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING *`,
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
            newParentId,
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
        const newCalcId = calcResult.rows[0].id;
        restoredCalcCount++;

        // Restore specification_data
        if (calc.specification_data) {
          const specDataResult = await client.query(
            'INSERT INTO specification_data (notes, date_of_creation, calculation_id) VALUES ($1, $2, $3) RETURNING *',
            [calc.specification_data.notes, calc.specification_data.date_of_creation, newCalcId]
          );
          const newSpecDataId = specDataResult.rows[0].id;
          restoredSpecDataCount++;

          // Restore specification_data_table
          for (const item of calc.specification_data.table || []) {
            await client.query(
              'INSERT INTO specification_data_table (name, quantity, value_per_unit, unit_of_measurement, total_weight, date_of_creation, specification_data_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
              [item.name, item.quantity, item.value_per_unit, item.unit_of_measurement, item.total_weight, item.date_of_creation, newSpecDataId]
            );
          }
        }

        // Restore workers_data
        if (calc.workers_data) {
          const workersDataResult = await client.query(
            'INSERT INTO workers_data (notes, date_of_creation, calculation_id) VALUES ($1, $2, $3) RETURNING *',
            [calc.workers_data.notes, calc.workers_data.date_of_creation, newCalcId]
          );
          const newWorkersDataId = workersDataResult.rows[0].id;
          restoredWorkersDataCount++;

          // Restore workers_data_table
          for (const item of calc.workers_data.table || []) {
            await client.query(
              'INSERT INTO workers_data_table (name, number_of_hours_worked, salary_per_day, salary_per_hour, total, date_of_creation, workers_data_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
              [item.name, item.number_of_hours_worked, item.salary_per_day, item.salary_per_hour, item.total, item.date_of_creation, newWorkersDataId]
            );
          }
        }

        // Restore itr_data
        if (calc.itr_data) {
          const itrDataResult = await client.query(
            'INSERT INTO itr_data (notes, date_of_creation, calculation_id) VALUES ($1, $2, $3) RETURNING *',
            [calc.itr_data.notes, calc.itr_data.date_of_creation, newCalcId]
          );
          const newItrDataId = itrDataResult.rows[0].id;
          restoredItrDataCount++;

          // Restore itr_data_table
          for (const item of calc.itr_data.table || []) {
            await client.query(
              'INSERT INTO itr_data_table (name, salary_per_month, date_of_creation, itr_data_id) VALUES ($1, $2, $3, $4)',
              [item.name, item.salary_per_month, item.date_of_creation, newItrDataId]
            );
          }
        }

        // Restore workers_tax_data
        for (const item of calc.workers_tax_data || []) {
          await client.query(
            'INSERT INTO workers_tax_data (name, coefficient, coefficient_a, coefficient_b, key, subtotal, total, calculation_id, order_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [item.name, item.coefficient, item.coefficient_a, item.coefficient_b, item.key, item.subtotal, item.total, newCalcId, item.order_id]
          );
          restoredWorkersTaxCount++;
        }

        // Restore itr_tax_data
        for (const item of calc.itr_tax_data || []) {
          await client.query(
            'INSERT INTO itr_tax_data (name, coefficient, coefficient_a, coefficient_b, key, subtotal, total, calculation_id, order_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [item.name, item.coefficient, item.coefficient_a, item.coefficient_b, item.key, item.subtotal, item.total, newCalcId, item.order_id]
          );
          restoredItrTaxCount++;
        }
      }
    }

    // 4. Print statistics
    console.log(`\n✅ Восстановление завершено успешно!`);
    console.log(`\n📊 Статистика восстановления:`);
    console.log(`   - parent_calculations: ${restoredParentCount}`);
    console.log(`   - calculations: ${restoredCalcCount}`);
    console.log(`   - specification_data: ${restoredSpecDataCount}`);
    console.log(`   - workers_data: ${restoredWorkersDataCount}`);
    console.log(`   - itr_data: ${restoredItrDataCount}`);
    console.log(`   - workers_tax_data: ${restoredWorkersTaxCount} записей`);
    console.log(`   - itr_tax_data: ${restoredItrTaxCount} записей`);

  } catch (error) {
    console.error('❌ Ошибка при восстановлении:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Get arguments
// Usage: node restore-calculations.js <backupFilePath> [userId] [--clear]
// Example: node restore-calculations.js backups/backup_user_1_2024-01-15.json 1
// Example: node restore-calculations.js backups/backup_user_1_2024-01-15.json 1 --clear
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('❌ Ошибка: Не указан путь к файлу бэкапа');
  console.log('Использование: node restore-calculations.js <backupFilePath> [userId] [--clear]');
  console.log('Пример: node restore-calculations.js backups/backup_user_1_2024-01-15.json 1');
  console.log('Пример: node restore-calculations.js backups/backup_user_1_2024-01-15.json 1 --clear');
  process.exit(1);
}

const backupFilePath = path.isAbsolute(args[0]) ? args[0] : path.join(__dirname, '..', args[0]);
const userId = args[1] && !args[1].startsWith('--') ? parseInt(args[1], 10) : null;
const clearExisting = args.includes('--clear');

if (userId !== null && isNaN(userId)) {
  console.error('❌ Ошибка: userId должен быть числом');
  process.exit(1);
}

if (clearExisting) {
  console.log('⚠️  ВНИМАНИЕ: Будут удалены все существующие данные перед восстановлением!');
  console.log('Это действие необратимо.\n');
}

// Run the script
restoreCalculations(backupFilePath, userId, clearExisting)
  .then(() => {
    console.log('\n🎉 Скрипт завершен успешно!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });

