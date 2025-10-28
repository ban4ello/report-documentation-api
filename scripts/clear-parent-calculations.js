require('dotenv').config();
const pool = require('../db');

async function clearParentCalculations(userId) {
  const client = await pool.connect();

  try {
    // Get userId from environment variables if not provided
    const targetUserId = userId || process.env.USER_ID;
    
    if (!targetUserId) {
      console.error('❌ Ошибка: userId должен быть указан');
      process.exit(1);
    }

    const schemaName = `user_${targetUserId}`;
    
    console.log(`Начинаю очистку таблицы parent_calculation...`);
    console.log(`Целевая схема: ${schemaName}\n`);

    // Set search path to target schema
    await client.query(`SET search_path TO ${schemaName}, public`);

    // First, count existing records
    const countResult = await client.query('SELECT COUNT(*) as count FROM parent_calculation');
    const currentCount = parseInt(countResult.rows[0].count);

    if (currentCount === 0) {
      console.log('⚠️  В таблице parent_calculation нет записей для удаления');
      return;
    }

    console.log(`Найдено записей parent_calculation: ${currentCount}`);

    // Count related calculations before deletion (will be deleted by CASCADE)
    const calculationsCount = await client.query('SELECT COUNT(*) as count FROM calculation');
    const relatedCalculationsCount = parseInt(calculationsCount.rows[0].count);
    
    if (relatedCalculationsCount > 0) {
      console.log(`Найдено связанных записей calculation: ${relatedCalculationsCount}`);
      console.log('(Все связанные calculations будут удалены каскадно)\n');
    }

    // Delete all parent_calculation records
    // CASCADE will automatically delete all related calculations and their children
    const deleteResult = await client.query('DELETE FROM parent_calculation');

    console.log(`\n✅ Успешно удалено ${currentCount} записей из таблицы parent_calculation`);
    console.log(`✅ Удалено ${relatedCalculationsCount} связанных расчетов (calculations)`);

    // Show statistics
    const remainingCountResult = await client.query('SELECT COUNT(*) as count FROM parent_calculation');
    const remainingCount = parseInt(remainingCountResult.rows[0].count);
    console.log(`📊 Оставшихся записей в parent_calculation: ${remainingCount}`);

  } catch (error) {
    console.error('❌ Ошибка при очистке таблицы:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Get user ID from command line arguments
// Usage: node clear-parent-calculations.js [userId]
// Example: node clear-parent-calculations.js 1  (to clear user_1 schema)
// Example: node clear-parent-calculations.js    (uses USER_ID from .env)
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
  console.log('Использование: node clear-parent-calculations.js [userId]');
  console.log('Или установите переменную окружения USER_ID');
  process.exit(1);
}

console.log(`⚠️  ВНИМАНИЕ: Вы собираетесь удалить ВСЕ записи из таблицы parent_calculation для пользователя ${finalUserId}!`);
console.log(`Схема: user_${finalUserId}`);
console.log('Это действие необратимо.\n');

// Run the script
clearParentCalculations(finalUserId)
  .then(() => {
    console.log('\n🎉 Скрипт завершен успешно!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });

