require('dotenv').config();
const { Pool } = require('pg');
const dns = require('dns');

class DatabaseManager {
  constructor() {
    // Основная база данных для всех пользователей
    this.mainDbConfig = {
      user: process.env.DB_USER || 'postgres',
      database: process.env.DB_NAME || 'calculations',
      password: process.env.DB_PASSWORD || 'root',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
    };
    
    // Создаем кастомную функцию lookup для принудительного использования IPv4
    // Это решает проблему с IPv6 на Railway и других платформах
    const ipv4Lookup = (hostname, options, callback) => {
      dns.lookup(hostname, { family: 4, all: false }, (err, address) => {
        if (err) {
          return callback(err);
        }
        // Возвращаем IPv4 адрес
        callback(null, address, 4);
      });
    };
    
    // Для Supabase: Connection Pooler (порт 6543) не поддерживает DDL операции
    // Используем прямое подключение (порт 5432) для DDL и pooler для обычных запросов
    const isPoolerPort = this.mainDbConfig.port === 6543;
    const isSupabasePooler = this.mainDbConfig.host && this.mainDbConfig.host.includes('pooler.supabase.com');
    
    if (isPoolerPort || isSupabasePooler) {
      // Если используется pooler порт или Supabase pooler хост, создаем два пула:
      // 1. directPool - для DDL операций (CREATE TABLE, CREATE SCHEMA и т.д.)
      // 2. poolerPool - для обычных запросов
      
      // Определяем хост для прямого подключения Supabase
      let directHost = process.env.DB_DIRECT_HOST; // Можно указать явно через переменную окружения
      
      if (!directHost && isSupabasePooler) {
        // Пытаемся извлечь project reference из pooler хоста или пользователя
        const poolerHost = this.mainDbConfig.host;
        let projectRef = null;
        
        // Приоритет 1: Если формат db.xxx.pooler.supabase.com
        if (poolerHost.startsWith('db.')) {
          const match = poolerHost.match(/^db\.([^.]+)\.pooler\.supabase\.com$/);
          if (match) {
            projectRef = match[1];
            directHost = `db.${projectRef}.supabase.co`;
          }
        }
        // Приоритет 2: Извлекаем project reference из DB_USER (формат: postgres.xxx)
        // Это работает для всех форматов pooler хоста
        if (!directHost) {
          const dbUser = this.mainDbConfig.user;
          console.log(`🔍 Извлечение project reference из DB_USER: ${dbUser}`);
          if (dbUser && dbUser.includes('.')) {
            projectRef = dbUser.split('.')[1]; // postgres.xxx -> xxx
            console.log(`   Извлечен project reference: ${projectRef}`);
            if (projectRef) {
              directHost = `db.${projectRef}.supabase.co`;
              console.log(`   Сформирован прямой хост: ${directHost}`);
            }
          } else {
            console.warn(`   ⚠️ DB_USER не содержит точку или имеет неожиданный формат: ${dbUser}`);
          }
        }
        
        // Если все еще не определен, выводим ошибку
        if (!directHost) {
          console.error('❌ Не удалось определить прямой хост Supabase. Установите DB_DIRECT_HOST в переменных окружения.');
          console.error(`   Pooler host: ${poolerHost}`);
          console.error(`   DB User: ${this.mainDbConfig.user}`);
          console.error(`   Формат DB_USER должен быть: postgres.{projectRef}`);
        }
      }
      
      // Если прямой хост не определен для Supabase pooler, выбрасываем ошибку
      if (!directHost && (isPoolerPort || isSupabasePooler)) {
        throw new Error(
          `Не удалось определить прямой хост Supabase для DDL операций. ` +
          `Установите переменную окружения DB_DIRECT_HOST=db.{projectRef}.supabase.co ` +
          `или убедитесь, что DB_USER имеет формат postgres.{projectRef}. ` +
          `Текущий DB_USER: ${this.mainDbConfig.user}, Pooler host: ${this.mainDbConfig.host}`
        );
      }
      
      // Если прямой хост не определен (не Supabase), используем тот же хост
      if (!directHost) {
        directHost = this.mainDbConfig.host;
      }
      
      // Прямое подключение для DDL (порт 5432)
      this.directDbConfig = {
        ...this.mainDbConfig,
        host: directHost,
        port: 5432, // Прямой порт Supabase
        // Используем кастомный lookup для принудительного IPv4
        lookup: ipv4Lookup,
      };
      
      // Проверка формата хоста
      if (!directHost.startsWith('db.') || !directHost.endsWith('.supabase.co')) {
        console.warn(`⚠️ Прямой хост может быть неправильным: ${directHost}`);
        console.warn(`   Ожидаемый формат: db.{projectRef}.supabase.co`);
      }
      
      this.directPool = new Pool(this.directDbConfig);
      
      // Логирование для отладки
      console.log(`🔌 Database connection configured:`);
      console.log(`   Pooler (queries): ${this.mainDbConfig.host}:${this.mainDbConfig.port}`);
      console.log(`   Direct (DDL): ${directHost}:5432 (IPv4 only)`);
      
      // Pooler для обычных запросов (порт 6543 или текущий порт)
      // Также принудительно используем IPv4 для pooler
      this.mainPool = new Pool({
        ...this.mainDbConfig,
        lookup: ipv4Lookup,
      });
    } else {
      // Если используется прямой порт, используем один пул для всего
      // Также используем IPv4 lookup для надежности
      this.directPool = null;
      this.mainPool = new Pool({
        ...this.mainDbConfig,
        lookup: ipv4Lookup,
      });
    }
  }
  
  // Получить пул для DDL операций (создание таблиц, схем)
  getDirectPool() {
    return this.directPool || this.mainPool;
  }

  // Получить подключение к основной БД (для пользователей)
  getMainConnection() {
    return this.mainPool;
  }

  // Инициализировать основные таблицы в схеме public
  async initializeMainTables() {
    // Используем прямое подключение для DDL операций
    const pool = this.getDirectPool();
    const client = await pool.connect();
    
    try {
      // Устанавливаем схему поиска на public
      await client.query('SET search_path TO public');
      
      const mainTables = [
        `CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          role VARCHAR(10) DEFAULT 'guest',
          username VARCHAR(255),
          email VARCHAR(50) NOT NULL UNIQUE,
          isActivated BOOLEAN DEFAULT FALSE,
          activationLink VARCHAR(255),
          password VARCHAR(255) NOT NULL
        )`,
        
        `CREATE TABLE IF NOT EXISTS login_attempts (
          id SERIAL PRIMARY KEY,
          email VARCHAR(50) NOT NULL,
          success BOOLEAN DEFAULT FALSE,
          ip_address VARCHAR(45),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS tokenSchema (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          refreshToken VARCHAR(50) NOT NULL UNIQUE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`
      ];

      let createdCount = 0;
      let existingCount = 0;
      let errorCount = 0;

      for (const tableQuery of mainTables) {
        try {
          await client.query(tableQuery);
          createdCount++;
          console.log(`✅ Основная таблица создана в схеме public`);
        } catch (error) {
          if (error.code === '42P07') {
            existingCount++;
            console.log(`ℹ️ Основная таблица уже существует в схеме public`);
          } else {
            errorCount++;
            console.error(`❌ Ошибка при создании основной таблицы:`, error.message);
            console.error(`   Код ошибки: ${error.code}`);
            // Не прерываем выполнение, продолжаем создавать остальные таблицы
          }
        }
      }
      
      if (createdCount > 0 || existingCount > 0) {
        console.log(`🎉 Инициализация таблиц завершена: создано ${createdCount}, уже существует ${existingCount}`);
      }
      
      if (errorCount > 0) {
        console.warn(`⚠️ При инициализации возникло ${errorCount} ошибок. Проверьте подключение к БД.`);
        // Не выбрасываем ошибку, чтобы сервер мог продолжить работу
      }
    } catch (error) {
      console.error(`❌ Критическая ошибка при инициализации основных таблиц:`, error.message);
      console.error(`   Код ошибки: ${error.code}`);
      console.error(`   Если таблицы не созданы, выполните SQL скрипт вручную:`);
      console.error(`   server/scripts/create-main-tables-supabase.sql`);
      // Не выбрасываем ошибку, чтобы сервер мог запуститься
      // В продакшене таблицы должны быть созданы заранее
    } finally {
      client.release();
    }
  }

  // Создать схему для пользователя (вместо отдельной БД)
  async createUserDatabase(userId) {
    // Используем прямое подключение для DDL операций
    const pool = this.getDirectPool();
    let client;
    
    try {
      client = await pool.connect();
      
      // Создаем схему для пользователя
      await client.query(`CREATE SCHEMA IF NOT EXISTS user_${userId}`);
      console.log(`✅ Схема user_${userId} создана`);
      
      // Создаем таблицы в схеме пользователя
      await this.createUserTables(client, userId);
      
      console.log(`✅ Схема для пользователя ${userId} создана успешно`);
    } catch (error) {
      console.error(`❌ Ошибка при создании схемы для пользователя ${userId}:`, error.message);
      console.error(`   Код ошибки: ${error.code}`);
      console.error(`   Хост: ${this.directDbConfig?.host || 'не определен'}`);
      console.error(`   Порт: ${this.directDbConfig?.port || 'не определен'}`);
      
      // Если ошибка подключения, выводим более подробную информацию
      if (error.code === 'ENETUNREACH' || error.code === 'ENOTFOUND') {
        console.error(`   ⚠️ Проблема с подключением к Supabase. Проверьте:`);
        console.error(`      1. Правильность DB_DIRECT_HOST в переменных окружения`);
        console.error(`      2. Доступность хоста ${this.directDbConfig?.host}`);
        console.error(`      3. Используйте формат: db.{projectRef}.supabase.co`);
      }
      
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }


  // Создать таблицы в схеме пользователя
  async createUserTables(client, userId) {
    const schemaName = `user_${userId}`;
    
    try {
      // Всегда создаем таблицы программно для надежности
      console.log(`Создание таблиц в схеме ${schemaName}...`);
      await this.createTablesProgrammatically(client, schemaName);
      console.log(`Таблицы в схеме ${schemaName} созданы успешно`);
    } catch (error) {
      console.error(`Ошибка при создании таблиц в схеме ${schemaName}:`, error);
      throw error;
    }
  }

  // Создать таблицы программно (альтернативный метод)
  async createTablesProgrammatically(client, schemaName) {
    const tables = [
      `CREATE TABLE IF NOT EXISTS ${schemaName}.workers (
        id SERIAL PRIMARY KEY,
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        name VARCHAR(255),
        lastname VARCHAR(255),
        position VARCHAR(255)
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.parent_calculation (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.calculation (
        id SERIAL PRIMARY KEY,
        itr_worked_days DECIMAL,
        coeficient_of_nds DECIMAL,
        cost_of_electricity_per_day INTEGER,
        galvanized_value INTEGER,
        number_of_days_per_shift INTEGER,
        number_of_hours_per_shift INTEGER,
        rental_cost_per_day INTEGER,
        profitability_coeficient DECIMAL,
        title VARCHAR(255),
        transport_value INTEGER,
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_edit_date TIMESTAMP,
        parent_calculation_id INTEGER,
        calculation_type VARCHAR(255),
        consumables_data JSON,
        hardware_data JSON,
        metal_data JSON,
        total_metal_per_item DECIMAL,
        total_processing_per_item DECIMAL,
        total_profitability_per_item DECIMAL,
        total DECIMAL,
        is_metal_enabled BOOLEAN DEFAULT FALSE,
        is_hardware_enabled BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (parent_calculation_id) REFERENCES ${schemaName}.parent_calculation(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.specification_data (
        id SERIAL PRIMARY KEY,
        notes TEXT,
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        calculation_id INTEGER,
        FOREIGN KEY (calculation_id) REFERENCES ${schemaName}.calculation(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.specification_data_table (
        id SERIAL PRIMARY KEY,
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        name VARCHAR(255),
        quantity INTEGER,
        value_per_unit DECIMAL,
        unit_of_measurement VARCHAR(255),
        total_weight INTEGER,
        specification_data_id INTEGER,
        FOREIGN KEY (specification_data_id) REFERENCES ${schemaName}.specification_data(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.workers_data (
        id SERIAL PRIMARY KEY,
        notes TEXT,
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        calculation_id INTEGER,
        FOREIGN KEY (calculation_id) REFERENCES ${schemaName}.calculation(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.workers_data_table (
        id SERIAL PRIMARY KEY,
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        name VARCHAR(255),
        number_of_hours_worked INTEGER,
        salary_per_day INTEGER,
        salary_per_hour INTEGER,
        total DECIMAL,
        workers_data_id INTEGER,
        FOREIGN KEY (workers_data_id) REFERENCES ${schemaName}.workers_data(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.itr_data (
        id SERIAL PRIMARY KEY,
        notes TEXT,
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        calculation_id INTEGER,
        FOREIGN KEY (calculation_id) REFERENCES ${schemaName}.calculation(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.itr_data_table (
        id SERIAL PRIMARY KEY,
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        name VARCHAR(255),
        salary_per_month INTEGER,
        itr_data_id INTEGER,
        FOREIGN KEY (itr_data_id) REFERENCES ${schemaName}.itr_data(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.workers_tax_data (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        coefficient DECIMAL,
        coefficient_a DECIMAL,
        coefficient_b DECIMAL,
        key VARCHAR(255),
        subtotal DECIMAL,
        total DECIMAL,
        calculation_id INTEGER,
        order_id INTEGER,
        FOREIGN KEY (calculation_id) REFERENCES ${schemaName}.calculation(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.itr_tax_data (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        coefficient DECIMAL,
        coefficient_a DECIMAL,
        coefficient_b DECIMAL,
        key VARCHAR(255),
        subtotal DECIMAL,
        total DECIMAL,
        calculation_id INTEGER,
        order_id INTEGER,
        FOREIGN KEY (calculation_id) REFERENCES ${schemaName}.calculation(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.calculation_media_files (
        id SERIAL PRIMARY KEY,
        calculation_id INTEGER NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size INTEGER NOT NULL,
        file_data BYTEA NOT NULL,
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (calculation_id) REFERENCES ${schemaName}.calculation(id) ON DELETE CASCADE
      )`
    ];

    for (const tableQuery of tables) {
      try {
        await client.query(tableQuery);
        console.log(`✅ Таблица создана в схеме ${schemaName}`);
      } catch (error) {
        if (error.code === '42P07') {
          console.log(`ℹ️ Таблица уже существует в схеме ${schemaName}`);
        } else {
          console.error(`❌ Ошибка при создании таблицы в схеме ${schemaName}:`, error.message);
          throw error;
        }
      }
    }
    
    console.log(`🎉 Все таблицы в схеме ${schemaName} созданы программно`);
  }

  // Получить подключение к схеме пользователя
  async getUserConnection(userId) {
    // Возвращаем объект с методом query, который устанавливает схему поиска
    return {
      query: async (query, params) => {
        const client = await this.mainPool.connect();
        try {
          // Устанавливаем схему поиска для пользователя
          await client.query(`SET search_path TO user_${userId}, public`);
          return await client.query(query, params);
        } finally {
          client.release();
        }
      }
    };
  }

  // Удалить схему пользователя
  async deleteUserDatabase(userId) {
    // Используем прямое подключение для DDL операций
    const pool = this.getDirectPool();
    const client = await pool.connect();
    
    try {
      // Удаляем схему со всеми таблицами
      await client.query(`DROP SCHEMA IF EXISTS user_${userId} CASCADE`);
      
      console.log(`Схема пользователя ${userId} удалена успешно`);
    } catch (error) {
      console.error(`Ошибка при удалении схемы пользователя ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Закрыть все подключения
  async closeAll() {
    await this.mainPool.end();
    if (this.directPool) {
      await this.directPool.end();
    }
  }
}

module.exports = new DatabaseManager();


