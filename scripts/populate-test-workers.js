require('dotenv').config();
const pool = require('../db');

// List of sample first and last names
const firstNames = [
  'Александр', 'Дмитрий', 'Максим', 'Сергей', 'Андрей',
  'Алексей', 'Артём', 'Илья', 'Кирилл', 'Михаил',
  'Иван', 'Роман', 'Даниил', 'Евгений', 'Никита',
  'Егор', 'Павел', 'Антон', 'Арсений', 'Константин'
];

const lastNames = [
  'Иванов', 'Петров', 'Смирнов', 'Кузнецов', 'Попов',
  'Соколов', 'Лебедев', 'Козлов', 'Новиков', 'Морозов',
  'Петров', 'Волков', 'Алексеев', 'Лебедев', 'Семёнов',
  'Егоров', 'Павлов', 'Козлов', 'Степанов', 'Николаев'
];

async function populateTestWorkers(targetUserId = null) {
  const client = await pool.connect();

  try {
    // Get userId from environment variables if not provided
    const finalUserId = targetUserId || process.env.USER_ID;
    const schemaName = finalUserId ? `user_${finalUserId}` : 'public';
    
    console.log(`Начинаю наполнение таблицы workers тестовыми данными...`);
    console.log(`Целевая схема: ${schemaName}\n`);

    // Create an array of 10 test workers
    const workers = [];
    for (let i = 0; i < 10; i++) {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const position = Math.random() > 0.5 ? 'worker' : 'itr';

      workers.push({
        name: `${firstName} ${lastName}`,
        lastname: lastName,
        position: position
      });
    }

    // Set search path to target schema
    await client.query(`SET search_path TO ${schemaName}, public`);

    // Insert workers into database
    let insertedCount = 0;
    for (const worker of workers) {
      try {
        const result = await client.query(
          'INSERT INTO workers (name, lastname, position) VALUES ($1, $2, $3) RETURNING *',
          [worker.name, worker.lastname, worker.position]
        );

        const inserted = result.rows[0];
        console.log(`${insertedCount + 1}. Добавлен: ${inserted.name} (${inserted.position})`);
        insertedCount++;
      } catch (error) {
        if (error.code === '23505') {
          console.log(`⚠️  Пропущен дубликат: ${worker.name}`);
        } else {
          throw error;
        }
      }
    }

    console.log(`\n✅ Успешно добавлено ${insertedCount} из ${workers.length} тестовых работников в таблицу workers`);
    
    // Show summary
    const summaryResult = await client.query('SELECT position, COUNT(*) as count FROM workers GROUP BY position');
    console.log('\n📊 Распределение по позициям:');
    summaryResult.rows.forEach(row => {
      console.log(`   ${row.position}: ${row.count}`);
    });

  } catch (error) {
    console.error('❌ Ошибка при наполнении таблицы:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Get user ID from command line arguments (optional)
// Usage: node populate-test-workers.js [userId]
// Example: node populate-test-workers.js 1  (to populate user_1 schema)
const args = process.argv.slice(2);
const userId = args[0] ? parseInt(args[0], 10) : null;

if (userId !== null && isNaN(userId)) {
  console.error('❌ Ошибка: userId должен быть числом');
  process.exit(1);
}

// Get userId from environment or arguments
const finalUserId = userId || process.env.USER_ID;

// Run the script
populateTestWorkers(finalUserId)
  .then(() => {
    console.log('\n🎉 Скрипт завершен успешно!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });

