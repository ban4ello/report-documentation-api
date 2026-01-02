require('dotenv').config();
const pool = require('../db');

/**
 * Скрипт для создания таблицы calculation_media_files
 * Может работать с публичной схемой или схемой конкретного пользователя
 * 
 * Использование:
 *   node scripts/create-media-files-table.js [userId]
 * 
 * Если userId не указан:
 *   - Используется USER_ID из .env файла
 *   - Если и его нет, создается в публичной схеме (public)
 * 
 * Если userId указан:
 *   - Создается таблица в схеме user_{userId}
 */

async function createMediaFilesTable(targetUserId = null) {
  const client = await pool.connect();

  try {
    // Get userId from environment variables if not provided
    const finalUserId = targetUserId || process.env.USER_ID;
    const schemaName = finalUserId ? `user_${finalUserId}` : 'public';
    
    console.log(`Создание таблицы calculation_media_files...`);
    console.log(`Целевая схема: ${schemaName}\n`);

    // Проверяем существование схемы (если это схема пользователя)
    if (finalUserId) {
      const schemaCheck = await client.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [`user_${finalUserId}`]
      );

      if (schemaCheck.rows.length === 0) {
        console.error(`❌ Ошибка: Схема user_${finalUserId} не существует!`);
        console.log(`   Сначала создайте схему пользователя через регистрацию или dbManager.`);
        process.exit(1);
      }
    }

    // Проверяем существование таблицы calculation (необходима для внешнего ключа)
    const calculationCheck = await client.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = $1 AND table_name = 'calculation'`,
      [schemaName]
    );

    if (calculationCheck.rows.length === 0) {
      console.error(`❌ Ошибка: Таблица calculation не существует в схеме ${schemaName}!`);
      console.log(`   Сначала создайте таблицы через database.sql или dbManager.`);
      process.exit(1);
    }

    // Проверяем, существует ли уже таблица
    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = $1 AND table_name = 'calculation_media_files'`,
      [schemaName]
    );

    if (tableCheck.rows.length > 0) {
      console.log(`⚠️  Таблица calculation_media_files уже существует в схеме ${schemaName}`);
      console.log(`   Используется IF NOT EXISTS, таблица не будет пересоздана.`);
    }

    // Создаем таблицу
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${schemaName}.calculation_media_files (
        id SERIAL PRIMARY KEY,
        calculation_id INTEGER NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size INTEGER NOT NULL,
        file_data BYTEA NOT NULL,
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (calculation_id) REFERENCES ${schemaName}.calculation(id) ON DELETE CASCADE
      )
    `;

    await client.query(createTableQuery);
    
    console.log(`✅ Таблица calculation_media_files успешно создана в схеме ${schemaName}`);
    
    // Проверяем структуру созданной таблицы
    const tableInfo = await client.query(
      `SELECT column_name, data_type, is_nullable 
       FROM information_schema.columns 
       WHERE table_schema = $1 AND table_name = 'calculation_media_files'
       ORDER BY ordinal_position`,
      [schemaName]
    );

    console.log(`\n📋 Структура таблицы:`);
    tableInfo.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.column_name} (${row.data_type}) ${row.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
    });

    console.log(`\n🎉 Скрипт завершен успешно!`);

  } catch (error) {
    console.error('❌ Ошибка при создании таблицы:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Получаем аргументы командной строки
const args = process.argv.slice(2);
const userId = args[0] ? parseInt(args[0], 10) : null;

if (userId && isNaN(userId)) {
  console.error('❌ Ошибка: userId должен быть числом');
  process.exit(1);
}

// Запускаем скрипт
createMediaFilesTable(userId).catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});

