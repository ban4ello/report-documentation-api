require('dotenv').config();
const dbManager = require('../dbManager');

/**
 * Скрипт для инициализации основных таблиц в схеме public
 * Создает таблицы: users, login_attempts, tokenSchema
 * 
 * Использование:
 *   node scripts/initialize-main-tables.js
 * 
 * Или через npm:
 *   npm run initialize-main-tables
 */

async function initializeMainTables() {
  try {
    console.log('🔄 Инициализация основных таблиц в схеме public...\n');
    
    await dbManager.initializeMainTables();
    
    console.log('\n✅ Инициализация завершена успешно!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Ошибка при инициализации основных таблиц:', error);
    process.exit(1);
  }
}

// Запуск скрипта
initializeMainTables();

