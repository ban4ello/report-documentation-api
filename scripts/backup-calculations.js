require('dotenv').config();
const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function backupCalculations(userId) {
  const client = await pool.connect();

  try {
    // Get userId from environment variables if not provided
    const targetUserId = userId || process.env.USER_ID;
    
    if (!targetUserId) {
      console.error('❌ Ошибка: userId должен быть указан');
      process.exit(1);
    }

    const schemaName = `user_${targetUserId}`;
    
    console.log(`Начинаю создание бэкапа для пользователя ${targetUserId}...`);
    console.log(`Целевая схема: ${schemaName}\n`);

    // Set search path to target schema
    await client.query(`SET search_path TO ${schemaName}, public`);

    // 1. Get all parent_calculation records
    const parentCalculations = await client.query('SELECT * FROM parent_calculation ORDER BY id');
    
    if (parentCalculations.rows.length === 0) {
      console.log('⚠️  В таблице parent_calculation нет записей для бэкапа');
      return null;
    }

    console.log(`✓ Найдено parent_calculation записей: ${parentCalculations.rows.length}`);

    const backupData = {
      metadata: {
        userId: targetUserId,
        schemaName: schemaName,
        backupDate: new Date().toISOString(),
        version: '1.0'
      },
      parent_calculations: []
    };

    // 2. For each parent_calculation, get all related data
    for (const parentCalc of parentCalculations.rows) {
      console.log(`\n📦 Обработка parent_calculation ID=${parentCalc.id}: "${parentCalc.title}"`);

      const parentCalcData = {
        ...parentCalc,
        calculations: []
      };

      // Get all calculations for this parent
      const calculations = await client.query(
        'SELECT * FROM calculation WHERE parent_calculation_id = $1 ORDER BY id',
        [parentCalc.id]
      );

      console.log(`  ✓ Найдено calculations: ${calculations.rows.length}`);

      // For each calculation, get all related data
      for (const calc of calculations.rows) {
        const calcData = {
          ...calc,
          specification_data: null,
          workers_data: null,
          itr_data: null,
          workers_tax_data: [],
          itr_tax_data: []
        };

        // Get specification_data
        const specData = await client.query(
          'SELECT * FROM specification_data WHERE calculation_id = $1',
          [calc.id]
        );

        if (specData.rows.length > 0) {
          const specDataItem = specData.rows[0];
          const specDataTable = await client.query(
            'SELECT * FROM specification_data_table WHERE specification_data_id = $1 ORDER BY id',
            [specDataItem.id]
          );

          calcData.specification_data = {
            ...specDataItem,
            table: specDataTable.rows
          };
        }

        // Get workers_data
        const workersData = await client.query(
          'SELECT * FROM workers_data WHERE calculation_id = $1',
          [calc.id]
        );

        if (workersData.rows.length > 0) {
          const workersDataItem = workersData.rows[0];
          const workersDataTable = await client.query(
            'SELECT * FROM workers_data_table WHERE workers_data_id = $1 ORDER BY id',
            [workersDataItem.id]
          );

          calcData.workers_data = {
            ...workersDataItem,
            table: workersDataTable.rows
          };
        }

        // Get itr_data
        const itrData = await client.query(
          'SELECT * FROM itr_data WHERE calculation_id = $1',
          [calc.id]
        );

        if (itrData.rows.length > 0) {
          const itrDataItem = itrData.rows[0];
          const itrDataTable = await client.query(
            'SELECT * FROM itr_data_table WHERE itr_data_id = $1 ORDER BY id',
            [itrDataItem.id]
          );

          calcData.itr_data = {
            ...itrDataItem,
            table: itrDataTable.rows
          };
        }

        // Get workers_tax_data
        const workersTaxData = await client.query(
          'SELECT * FROM workers_tax_data WHERE calculation_id = $1 ORDER BY id',
          [calc.id]
        );
        calcData.workers_tax_data = workersTaxData.rows;

        // Get itr_tax_data
        const itrTaxData = await client.query(
          'SELECT * FROM itr_tax_data WHERE calculation_id = $1 ORDER BY id',
          [calc.id]
        );
        calcData.itr_tax_data = itrTaxData.rows;

        parentCalcData.calculations.push(calcData);
      }

      backupData.parent_calculations.push(parentCalcData);
    }

    // 3. Create backup directory if it doesn't exist
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // 4. Save backup to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                     new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('.')[0];
    const filename = `backup_user_${targetUserId}_${timestamp}.json`;
    const filepath = path.join(backupDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2), 'utf8');

    // 5. Print statistics
    const totalCalculations = backupData.parent_calculations.reduce(
      (sum, pc) => sum + pc.calculations.length, 0
    );
    const totalSpecData = backupData.parent_calculations.reduce(
      (sum, pc) => sum + pc.calculations.filter(c => c.specification_data).length, 0
    );
    const totalWorkersData = backupData.parent_calculations.reduce(
      (sum, pc) => sum + pc.calculations.filter(c => c.workers_data).length, 0
    );
    const totalItrData = backupData.parent_calculations.reduce(
      (sum, pc) => sum + pc.calculations.filter(c => c.itr_data).length, 0
    );
    const totalWorkersTaxData = backupData.parent_calculations.reduce(
      (sum, pc) => sum + pc.calculations.reduce((s, c) => s + c.workers_tax_data.length, 0), 0
    );
    const totalItrTaxData = backupData.parent_calculations.reduce(
      (sum, pc) => sum + pc.calculations.reduce((s, c) => s + c.itr_tax_data.length, 0), 0
    );

    console.log(`\n✅ Бэкап успешно создан!`);
    console.log(`📁 Файл: ${filepath}`);
    console.log(`\n📊 Статистика бэкапа:`);
    console.log(`   - parent_calculations: ${backupData.parent_calculations.length}`);
    console.log(`   - calculations: ${totalCalculations}`);
    console.log(`   - specification_data: ${totalSpecData}`);
    console.log(`   - workers_data: ${totalWorkersData}`);
    console.log(`   - itr_data: ${totalItrData}`);
    console.log(`   - workers_tax_data: ${totalWorkersTaxData} записей`);
    console.log(`   - itr_tax_data: ${totalItrTaxData} записей`);

    return filepath;

  } catch (error) {
    console.error('❌ Ошибка при создании бэкапа:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Get user ID from command line arguments
// Usage: node backup-calculations.js [userId]
// Example: node backup-calculations.js 1  (to backup user_1 schema)
// Example: node backup-calculations.js    (uses USER_ID from .env)
const args = process.argv.slice(2);
const userId = args[0] ? parseInt(args[0], 10) : null;

if (userId !== null && isNaN(userId)) {
  console.error('❌ Ошибка: userId должен быть числом');
  process.exit(1);
}

// Get userId from environment or arguments
const finalUserId = userId || process.env.USER_ID;

// Ask for confirmation
if (finalUserId === null || finalUserId === undefined) {
  console.log('❌ Ошибка: userId не указан');
  console.log('Использование: node backup-calculations.js [userId]');
  console.log('Или установите переменную окружения USER_ID');
  process.exit(1);
}

// Run the script
backupCalculations(finalUserId)
  .then((filepath) => {
    if (filepath) {
      console.log(`\n🎉 Бэкап завершен успешно!`);
      console.log(`💾 Сохранен в: ${filepath}`);
    } else {
      console.log('\n⚠️  Бэкап не создан (нет данных для бэкапа)');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });

