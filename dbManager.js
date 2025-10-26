const { Pool } = require('pg');

class DatabaseManager {
  constructor() {
    // Основная база данных для всех пользователей
    this.mainDbConfig = {
      user: 'postgres',
      database: 'calculations',
      password: 'root',
      host: 'localhost',
      port: 5432,
    };
    
    this.mainPool = new Pool(this.mainDbConfig);
  }

  // Получить подключение к основной БД (для пользователей)
  getMainConnection() {
    return this.mainPool;
  }

  // Создать схему для пользователя (вместо отдельной БД)
  async createUserDatabase(userId) {
    const client = await this.mainPool.connect();
    
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
        FOREIGN KEY (parent_calculation_id) REFERENCES ${schemaName}.parent_calculation(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.specification_data (
        id SERIAL PRIMARY KEY,
        notes VARCHAR(255),
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
        notes VARCHAR(255),
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
        notes VARCHAR(255),
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
    const client = await this.mainPool.connect();
    
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
  }
}

module.exports = new DatabaseManager();
