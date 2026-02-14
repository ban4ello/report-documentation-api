require('dotenv').config();
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = util.promisify(exec);

async function copyDatabase(userId) {
  try {
    // Get userId from environment variables if not provided
    const targetUserId = userId || process.env.USER_ID;
    
    if (!targetUserId) {
      console.error('❌ Ошибка: userId должен быть указан');
      console.log('Использование: node scripts/copy-database.js [userId]');
      console.log('Или установите переменную окружения USER_ID');
      process.exit(1);
    }

    const schemaName = `user_${targetUserId}`;
    
    // Database connection parameters
    const dbUser = process.env.DB_USER || 'postgres';
    const dbName = process.env.DB_NAME || 'calculations';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || 5432;
    
    console.log(`📦 Начинаю создание копии БД для пользователя ${targetUserId}...`);
    console.log(`📋 Схема: ${schemaName}`);
    console.log(`🗄️  База данных: ${dbName}\n`);

    // Create dumps directory if it doesn't exist
    const dumpsDir = path.join(__dirname, '..', 'dumps');
    if (!fs.existsSync(dumpsDir)) {
      fs.mkdirSync(dumpsDir, { recursive: true });
      console.log(`✓ Создана директория для дампов: ${dumpsDir}`);
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                     new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('.')[0];
    const filename = `dump_user_${targetUserId}_${timestamp}.sql`;
    const filepath = path.join(dumpsDir, filename);

    // Set PGPASSWORD environment variable for pg_dump
    const env = {
      ...process.env,
      PGPASSWORD: process.env.DB_PASSWORD || 'root'
    };

    // Build pg_dump command
    // --schema=user_X dumps only the specified schema
    // --no-owner removes ownership commands
    // --no-privileges removes privilege commands
    const pgDumpCommand = `pg_dump -U ${dbUser} -h ${dbHost} -p ${dbPort} -d ${dbName} --schema=${schemaName} --no-owner --no-privileges -f "${filepath}"`;

    console.log(`🔧 Выполняется команда: pg_dump ...`);
    console.log(`   Схема: ${schemaName}`);
    console.log(`   Файл: ${filepath}\n`);

    try {
      // Execute pg_dump
      const { stdout, stderr } = await execPromise(pgDumpCommand, { env });
      
      if (stderr && !stderr.includes('NOTICE')) {
        // pg_dump writes notices to stderr, but they're usually not errors
        console.warn('⚠️  Предупреждения:', stderr);
      }

      // Check if file was created and has content
      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        const fileSizeKB = (stats.size / 1024).toFixed(2);
        
        if (stats.size > 0) {
          console.log(`✅ Копия БД успешно создана!`);
          console.log(`📁 Файл: ${filepath}`);
          console.log(`📊 Размер: ${fileSizeKB} KB`);
          console.log(`\n💡 Для восстановления используйте:`);
          console.log(`   psql -U ${dbUser} -h ${dbHost} -p ${dbPort} -d ${dbName} -f "${filepath}"`);
          
          return filepath;
        } else {
          console.error('❌ Ошибка: Файл дампа пустой');
          fs.unlinkSync(filepath);
          process.exit(1);
        }
      } else {
        console.error('❌ Ошибка: Файл дампа не был создан');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Ошибка при выполнении pg_dump:');
      console.error(error.message);
      
      if (error.message.includes('pg_dump: command not found')) {
        console.error('\n💡 Решение: Убедитесь, что PostgreSQL клиентские утилиты установлены');
        console.error('   macOS: brew install postgresql');
        console.error('   Ubuntu: sudo apt-get install postgresql-client');
        console.error('   Windows: Установите PostgreSQL из официального сайта');
      } else if (error.message.includes('password authentication failed')) {
        console.error('\n💡 Решение: Проверьте правильность DB_PASSWORD в .env файле');
      } else if (error.message.includes('does not exist')) {
        console.error(`\n💡 Решение: Убедитесь, что схема ${schemaName} существует`);
      }
      
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Ошибка при создании копии БД:', error);
    process.exit(1);
  }
}

// Get user ID from command line arguments
// Usage: node copy-database.js [userId]
// Example: node copy-database.js 1  (to copy user_1 schema)
// Example: node copy-database.js    (uses USER_ID from .env)
const args = process.argv.slice(2);
const userId = args[0] ? parseInt(args[0], 10) : null;

if (userId !== null && isNaN(userId)) {
  console.error('❌ Ошибка: userId должен быть числом');
  process.exit(1);
}

// Run the script
copyDatabase(userId)
  .then((filepath) => {
    if (filepath) {
      console.log(`\n🎉 Копия БД завершена успешно!`);
      console.log(`💾 Сохранена в: ${filepath}`);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });

