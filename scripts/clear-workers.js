require('dotenv').config();
const pool = require('../db');

async function clearWorkers(userId = null) {
  const client = await pool.connect();

  try {
    // Get userId from environment variables if not provided
    const targetUserId = userId || process.env.USER_ID;
    const schemaName = targetUserId ? `user_${targetUserId}` : 'public';
    
    console.log(`Начинаю очистку таблицы workers...`);
    console.log(`Целевая схема: ${schemaName}\n`);

    // Set search path to target schema
    await client.query(`SET search_path TO ${schemaName}, public`);

    // First, count existing records
    const countResult = await client.query('SELECT COUNT(*) as count FROM workers');
    const currentCount = parseInt(countResult.rows[0].count);

    if (currentCount === 0) {
      console.log('⚠️  В таблице workers нет записей для удаления');
      return;
    }

    console.log(`Найдено записей: ${currentCount}`);

    // Delete all workers
    const deleteResult = await client.query('DELETE FROM workers');

    console.log(`\n✅ Успешно удалено ${currentCount} записей из таблицы workers в схеме ${schemaName}`);

    // Show statistics
    const remainingCountResult = await client.query('SELECT COUNT(*) as count FROM workers');
    const remainingCount = parseInt(remainingCountResult.rows[0].count);
    console.log(`📊 Оставшихся записей: ${remainingCount}`);

  } catch (error) {
    console.error('❌ Ошибка при очистке таблицы:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Get user ID from command line arguments
// Usage: node clear-workers.js [userId]
// Example: node clear-workers.js 1  (to clear user_1 schema)
// Example: node clear-workers.js    (to clear public schema)
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
  console.log('⚠️  ВНИМАНИЕ: Вы собираетесь удалить ВСЕ записи из таблицы workers в публичной схеме!');
  console.log('Это действие необратимо.\n');
} else {
  console.log(`⚠️  ВНИМАНИЕ: Вы собираетесь удалить ВСЕ записи из таблицы workers для пользователя ${finalUserId}!`);
  console.log(`Схема: user_${finalUserId}`);
  console.log('Это действие необратимо.\n');
}

// Run the script
clearWorkers(finalUserId)
  .then(() => {
    console.log('\n🎉 Скрипт завершен успешно!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });

