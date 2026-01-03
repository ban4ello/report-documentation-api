require('dotenv').config();
const pool = require('../db');

/**
 * Скрипт для изменения типа поля notes с VARCHAR(255) на TEXT
 * Позволяет хранить большие тексты в полях notes таблиц:
 * - specification_data
 * - workers_data
 * - itr_data
 * 
 * Использование:
 *   node scripts/alter-notes-to-text.js [userId]
 *   node scripts/alter-notes-to-text.js all  # для всех пользователей
 * 
 * Если userId не указан:
 *   - Используется USER_ID из .env файла
 *   - Если и его нет, изменяется в публичной схеме (public)
 * 
 * Если userId указан:
 *   - Изменяется в схеме user_{userId}
 * 
 * Если указано "all":
 *   - Изменяется во всех схемах пользователей (user_1, user_2, ...)
 */

async function alterNotesToText(targetUserId = null) {
  const client = await pool.connect();

  try {
    const tables = ['specification_data', 'workers_data', 'itr_data'];
    
    // Если указано "all", обрабатываем все схемы пользователей
    if (targetUserId === 'all') {
      console.log('🔄 Изменение типа поля notes для всех пользователей...\n');
      
      // Получаем все схемы пользователей
      const schemasResult = await client.query(
        `SELECT schema_name FROM information_schema.schemata 
         WHERE schema_name LIKE 'user_%' 
         ORDER BY schema_name`
      );

      if (schemasResult.rows.length === 0) {
        console.log('⚠️  Не найдено схем пользователей');
        return;
      }

      console.log(`Найдено схем пользователей: ${schemasResult.rows.length}\n`);

      for (const schemaRow of schemasResult.rows) {
        const schemaName = schemaRow.schema_name;
        console.log(`📦 Обработка схемы: ${schemaName}`);
        
        await alterSchema(client, schemaName, tables);
        console.log(`✅ Схема ${schemaName} обработана\n`);
      }

      console.log('🎉 Все схемы обработаны успешно!');
      return;
    }

    // Получаем userId из окружения или аргументов
    const finalUserId = targetUserId || process.env.USER_ID;
    const schemaName = finalUserId ? `user_${finalUserId}` : 'public';
    
    console.log(`🔄 Изменение типа поля notes на TEXT...`);
    console.log(`Целевая схема: ${schemaName}\n`);

    // Проверяем существование схемы (если это схема пользователя)
    if (finalUserId) {
      const schemaCheck = await client.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [schemaName]
      );

      if (schemaCheck.rows.length === 0) {
        console.error(`❌ Ошибка: Схема ${schemaName} не существует!`);
        console.log(`   Сначала создайте схему пользователя через регистрацию или dbManager.`);
        process.exit(1);
      }
    }

    await alterSchema(client, schemaName, tables);

    console.log(`\n🎉 Скрипт завершен успешно!`);

  } catch (error) {
    console.error('❌ Ошибка при изменении типа поля:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

async function alterSchema(client, schemaName, tables) {
  for (const tableName of tables) {
    try {
      // Проверяем существование таблицы
      const tableCheck = await client.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = $1 AND table_name = $2`,
        [schemaName, tableName]
      );

      if (tableCheck.rows.length === 0) {
        console.log(`   ⚠️  Таблица ${tableName} не существует в схеме ${schemaName}, пропускаем`);
        continue;
      }

      // Проверяем текущий тип поля
      const columnCheck = await client.query(
        `SELECT data_type, character_maximum_length 
         FROM information_schema.columns 
         WHERE table_schema = $1 AND table_name = $2 AND column_name = 'notes'`,
        [schemaName, tableName]
      );

      if (columnCheck.rows.length === 0) {
        console.log(`   ⚠️  Поле notes не найдено в таблице ${tableName}, пропускаем`);
        continue;
      }

      const currentType = columnCheck.rows[0].data_type;
      const maxLength = columnCheck.rows[0].character_maximum_length;

      // Если уже TEXT, пропускаем
      if (currentType === 'text') {
        console.log(`   ✓ Поле notes в таблице ${tableName} уже имеет тип TEXT, пропускаем`);
        continue;
      }

      console.log(`   🔄 Изменение поля notes в таблице ${tableName} (${currentType}${maxLength ? `(${maxLength})` : ''} -> TEXT)...`);

      // Изменяем тип поля
      const alterQuery = `ALTER TABLE ${schemaName}.${tableName} ALTER COLUMN notes TYPE TEXT`;
      await client.query(alterQuery);

      console.log(`   ✅ Поле notes в таблице ${tableName} успешно изменено на TEXT`);

    } catch (error) {
      console.error(`   ❌ Ошибка при изменении таблицы ${tableName}:`, error.message);
      throw error;
    }
  }
}

// Получаем аргументы командной строки
const args = process.argv.slice(2);
const userId = args[0] || null;

// Запускаем скрипт
alterNotesToText(userId).catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});

