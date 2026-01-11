require('dotenv').config();
const { Pool } = require('pg');

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
    
    // Для Supabase: Connection Pooler (порт 6543) не поддерживает DDL операции
    // Используем прямое подключение (порт 5432) для DDL и pooler для обычных запросов
    const isPoolerPort = this.mainDbConfig.port === 6543;
    const isSupabasePooler = this.mainDbConfig.host && this.mainDbConfig.host.includes('pooler.supabase.com');
    
    if (isPoolerPort || isSupabasePooler) {
      // Если используется pooler порт или Supabase pooler хост, создаем два пула:
      // 1. directPool - для DDL операций (CREATE TABLE, CREATE SCHEMA и т.д.)
      // 2. poolerPool - для обычных запросов
      
      // Определяем хост для прямого подключения Supabase
      let directHost = this.mainDbConfig.host;
      if (isSupabasePooler) {
        // Преобразуем pooler хост в прямой хост
        // db.xxx.pooler.supabase.com -> db.xxx.supabase.co
        directHost = this.mainDbConfig.host.replace('.pooler.supabase.com', '.supabase.co');
      }
      
      // Прямое подключение для DDL (порт 5432)
      this.directDbConfig = {
        ...this.mainDbConfig,
        host: directHost,
        port: 5432, // Прямой порт Supabase
      };
      this.directPool = new Pool(this.directDbConfig);
      
      // Pooler для обычных запросов (порт 6543 или текущий порт)
      this.mainPool = new Pool(this.mainDbConfig);
    } else {
      // Если используется прямой порт, используем один пул для всего
      this.directPool = null;
      this.mainPool = new Pool(this.mainDbConfig);
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

      for (const tableQuery of mainTables) {
        try {
          await client.query(tableQuery);
          console.log(`✅ Основная таблица создана в схеме public`);
        } catch (error) {
          if (error.code === '42P07') {
            console.log(`ℹ️ Основная таблица уже существует в схеме public`);
          } else {
            console.error(`❌ Ошибка при создании основной таблицы:`, error.message);
            throw error;
          }
        }
      }
      
      console.log(`🎉 Все основные таблицы в схеме public инициализированы`);
    } catch (error) {
      console.error(`❌ Ошибка при инициализации основных таблиц:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Создать схему для пользователя (вместо отдельной БД)
  async createUserDatabase(userId) {
    // Используем прямое подключение для DDL операций
    const pool = this.getDirectPool();
    const client = await pool.connect();
    
    try {
      // Создаем схему для пользователя
      await client.query(`CREATE SCHEMA IF NOT EXISTS user_${userId}`);
      console.log(`Схема user_${userId} создана`);
      
      // Создаем таблицы в схеме пользователя
      await this.createUserTables(client, userId);
      
      console.log(`Схема для пользователя ${userId} создана успешно`);
    } catch (error) {
      console.error(`Ошибка при создании схемы для пользователя ${userId}:`, error);
      throw error;
    } finally {
      client.release();
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
