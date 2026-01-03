require('dotenv').config();
const pool = require('../db');

/**
 * Скрипт для добавления поля is_metal_enabled в таблицу calculation
 * 
 * Использование:
 *   node scripts/add-is-metal-enabled.js [userId]
 *   node scripts/add-is-metal-enabled.js all  # для всех пользователей
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

async function addIsMetalEnabled(targetUserId = null) {
  const client = await pool.connect();

  try {
    // Если указано "all", обрабатываем все схемы пользователей
    if (targetUserId === 'all') {
      console.log('🔄 Добавление поля is_metal_enabled для всех пользователей...\n');
      
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
        
        await alterSchema(client, schemaName);
        console.log(`✅ Схема ${schemaName} обработана\n`);
      }

      console.log('🎉 Все схемы обработаны успешно!');
      return;
    }

    // Получаем userId из окружения или аргументов
    const finalUserId = targetUserId || process.env.USER_ID;
    const schemaName = finalUserId ? `user_${finalUserId}` : 'public';
    
    console.log(`🔄 Добавление поля is_metal_enabled в таблицу calculation...`);
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

    await alterSchema(client, schemaName);

    console.log(`\n🎉 Скрипт завершен успешно!`);

  } catch (error) {
    console.error('❌ Ошибка при добавлении поля:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

async function alterSchema(client, schemaName) {
  try {
    // Проверяем существование таблицы calculation
    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = $1 AND table_name = 'calculation'`,
      [schemaName]
    );

    if (tableCheck.rows.length === 0) {
      console.log(`   ⚠️  Таблица calculation не существует в схеме ${schemaName}, пропускаем`);
      return;
    }

    // Проверяем, существует ли уже поле is_metal_enabled
    const columnCheck = await client.query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_schema = $1 AND table_name = 'calculation' AND column_name = 'is_metal_enabled'`,
      [schemaName]
    );

    if (columnCheck.rows.length > 0) {
      console.log(`   ✓ Поле is_metal_enabled уже существует в таблице calculation, пропускаем`);
      return;
    }

    console.log(`   🔄 Добавление поля is_metal_enabled в таблицу calculation...`);

    // Добавляем поле
    const alterQuery = `ALTER TABLE ${schemaName}.calculation ADD COLUMN is_metal_enabled BOOLEAN DEFAULT FALSE`;
    await client.query(alterQuery);

    console.log(`   ✅ Поле is_metal_enabled успешно добавлено в таблицу calculation`);

  } catch (error) {
    console.error(`   ❌ Ошибка при изменении таблицы calculation:`, error.message);
    throw error;
  }
}

// Получаем аргументы командной строки
const args = process.argv.slice(2);
const userId = args[0] || null;

// Запускаем скрипт
addIsMetalEnabled(userId).catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});

