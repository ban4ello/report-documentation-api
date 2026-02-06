require('dotenv').config();
const { Pool } = require('pg');
const dns = require('dns');
const { promisify } = require('util');
const net = require('net');

// Принудительно устанавливаем IPv4 как приоритетный (если доступно)
if (net.setDefaultAutoSelectFamily) {
  try {
    net.setDefaultAutoSelectFamily(false);
    if (net.setDefaultAutoSelectFamilyIPv4) {
      net.setDefaultAutoSelectFamilyIPv4();
    }
  } catch (e) {
    // Игнорируем ошибки, если функции не доступны
  }
}

// Устанавливаем приоритет IPv4 для DNS резолва
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch (e) {
    // Игнорируем ошибки, если функция не доступна
  }
}

// Промис-версия dns.lookup и dns.resolve4 для асинхронного резолва
const dnsLookup = promisify(dns.lookup);
const dnsResolve4 = promisify(dns.resolve4);

// Кастомная функция lookup для принудительного использования IPv4
const ipv4Lookup = (hostname, options, callback) => {
  console.log(`🔍 IPv4 lookup вызван для хоста: ${hostname}`);
  // Принудительно используем только IPv4
  dns.lookup(hostname, { family: 4, all: false }, (err, address, family) => {
    if (err) {
      console.error(`❌ IPv4 lookup ошибка для ${hostname}:`, err.message);
      console.error(`   Код ошибки: ${err.code}`);
      // Если хост не резолвится, возвращаем ошибку - не позволяем pg использовать IPv6
      // Это предотвратит попытку подключения по IPv6
      return callback(err);
    }
    console.log(`✅ IPv4 lookup успешен для ${hostname}: ${address} (family: ${family || 4})`);
    // Всегда возвращаем family: 4 для гарантии IPv4
    callback(null, address, 4);
  });
};

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
      
      // Сохраняем хосты для последующего резолва
      this.directHost = directHost;
      this.poolerHost = this.mainDbConfig.host;
      
      // Проверка формата хоста
      if (!directHost.startsWith('db.') || !directHost.endsWith('.supabase.co')) {
        console.warn(`⚠️ Прямой хост может быть неправильным: ${directHost}`);
        console.warn(`   Ожидаемый формат: db.{projectRef}.supabase.co`);
      }
      
      // Пока создаем пулы с хостами, резолв будет выполнен асинхронно
      this.directDbConfig = {
        ...this.mainDbConfig,
        host: directHost,
        port: 5432, // Прямой порт Supabase
      };
      
      // Создаем пулы с хостами, но будем обновлять их после резолва
      this.directPool = null;
      this.mainPool = null;
      this.poolsInitialized = false;
    } else {
      // Если используется прямой порт, используем один пул для всего
      this.directHost = null;
      this.poolerHost = this.mainDbConfig.host;
      this.directPool = null;
      this.mainPool = null;
      this.poolsInitialized = false;
    }
  }
  
  // Асинхронная инициализация пулов с резолвом IPv4 адресов
  async initializePools() {
    if (this.poolsInitialized) {
      return;
    }
    
    try {
      // Резолвим IPv4 адреса для всех хостов
      const hostResolutions = [];
      
      if (this.directHost) {
        console.log(`🔍 Резолв IPv4 адреса для ${this.directHost}...`);
        hostResolutions.push(
          // Сначала пробуем resolve4 (более надежный для IPv4)
          dnsResolve4(this.directHost)
            .then(addresses => {
              const ip = addresses[0];
              console.log(`✅ Прямой хост ${this.directHost} резолвлен в IPv4 через resolve4: ${ip}`);
              return { type: 'direct', host: this.directHost, ip };
            })
            .catch(() => {
              // Fallback на lookup
              return dnsLookup(this.directHost, { family: 4 })
                .then(result => {
                  const ip = typeof result === 'string' ? result : (result.address || result);
                  console.log(`✅ Прямой хост ${this.directHost} резолвлен в IPv4 через lookup: ${ip}`);
                  return { type: 'direct', host: this.directHost, ip };
                })
                .catch(err => {
                  console.error(`❌ Ошибка резолва IPv4 для ${this.directHost}:`, err.message);
                  console.warn(`⚠️ Используется хост напрямую с принудительным IPv4 lookup`);
                  return { type: 'direct', host: this.directHost, ip: null }; // null означает использовать хост с lookup
                });
            })
        );
      }
      
      if (this.poolerHost) {
        console.log(`🔍 Резолв IPv4 адреса для ${this.poolerHost}...`);
        hostResolutions.push(
          dnsLookup(this.poolerHost, { family: 4 })
            .then(result => {
              // dns.lookup возвращает объект { address, family } или строку
              const ip = typeof result === 'string' ? result : (result.address || result);
              console.log(`✅ Pooler хост ${this.poolerHost} резолвлен в IPv4: ${ip}`);
              return { type: 'pooler', host: this.poolerHost, ip };
            })
            .catch(err => {
              console.error(`❌ Ошибка резолва IPv4 для ${this.poolerHost}:`, err.message);
              return { type: 'pooler', host: this.poolerHost, ip: this.poolerHost };
            })
        );
      }
      
      // Ждем резолва всех адресов
      const resolutions = await Promise.all(hostResolutions);
      
      let directHostIp = null;
      let poolerHostIp = null;
      
      for (const res of resolutions) {
        if (res.type === 'direct') {
          directHostIp = res.ip; // Может быть IP адрес или null
        } else if (res.type === 'pooler') {
          poolerHostIp = res.ip; // Может быть IP адрес или хост
        }
      }
      
      // Сначала создаем mainPool (pooler)
      if (poolerHostIp && poolerHostIp !== null && poolerHostIp !== this.poolerHost) {
        // Используем IP адрес напрямую
        this.mainPool = new Pool({
          ...this.mainDbConfig,
          host: poolerHostIp,
        });
        console.log(`✅ Main pool создан с IP адресом: ${poolerHostIp}`);
      } else {
        // Резолв не удался или вернул хост - используем оригинальный хост с принудительным IPv4 lookup
        this.mainPool = new Pool({
          ...this.mainDbConfig,
          // host остается из mainDbConfig (оригинальный хост)
          lookup: ipv4Lookup,
        });
        console.log(`✅ Main pool создан с хостом и IPv4 lookup: ${this.mainDbConfig.host}`);
      }
      
      // Теперь создаем directPool для DDL операций
      if (this.directDbConfig) {
        // Если получили валидный IP адрес (не null и не равен хосту), используем IP напрямую
        if (directHostIp && directHostIp !== null && directHostIp !== this.directHost) {
          // Используем IP адрес напрямую
          this.directPool = new Pool({
            ...this.directDbConfig,
            host: directHostIp,
          });
          console.log(`✅ Direct pool создан с IP адресом: ${directHostIp}`);
        } else {
          // Резолв не удался (null) или вернул хост
          // ВАЖНО: Если хост не резолвится, это критическая проблема
          // Хост должен резолвиться, иначе подключение невозможно
          console.error(`❌ КРИТИЧЕСКАЯ ПРОБЛЕМА: Хост ${this.directDbConfig.host} не резолвится!`);
          console.error(`   Это означает, что DB_DIRECT_HOST неправильный или хост недоступен.`);
          console.error(`   💡 РЕШЕНИЕ: Проверьте DB_DIRECT_HOST в Railway Variables:`);
          console.error(`      1. Откройте Supabase Dashboard → Settings → Database`);
          console.error(`      2. Переключитесь на "Direct connection" (не Pooler)`);
          console.error(`      3. Скопируйте точное значение поля "host"`);
          console.error(`      4. Установите это значение в Railway как DB_DIRECT_HOST`);
          console.error(`   ⚠️ ВРЕМЕННОЕ РЕШЕНИЕ: Используется pooler для DDL (НЕ РЕКОМЕНДУЕТСЯ)`);
          console.error(`      Pooler не поддерживает DDL операции и вызовет ошибки!`);
          
          // Используем pooler как временное решение
          // Это НЕ будет работать для DDL операций, но позволит серверу запуститься
          this.directPool = this.mainPool;
          console.log(`⚠️ Direct pool использует pooler (временное решение, НЕ для продакшена)`);
        }
      }
      
      // Логирование для отладки
      console.log(`🔌 Database connection configured:`);
      if (this.directHost) {
        const directDisplay = directHostIp && directHostIp !== null ? directHostIp : this.directHost;
        console.log(`   Direct (DDL): ${this.directHost} -> ${directDisplay}:5432 (IPv4 only)`);
      }
      const poolerDisplay = poolerHostIp && poolerHostIp !== null && poolerHostIp !== this.poolerHost ? poolerHostIp : this.poolerHost;
      console.log(`   Pooler (queries): ${this.poolerHost} -> ${poolerDisplay}:${this.mainDbConfig.port}`);
      
      this.poolsInitialized = true;
    } catch (error) {
      console.error(`❌ Критическая ошибка при инициализации пулов:`, error.message);
      // Fallback - создаем пулы с хостами и принудительным IPv4 lookup
      if (this.directDbConfig) {
        this.directPool = new Pool({
          ...this.directDbConfig,
          lookup: ipv4Lookup,
        });
      }
      this.mainPool = new Pool({
        ...this.mainDbConfig,
        lookup: ipv4Lookup,
      });
      this.poolsInitialized = true;
    }
  }
  
  // Получить пул для DDL операций (создание таблиц, схем)
  async getDirectPool() {
    if (!this.poolsInitialized) {
      await this.initializePools();
    }
    return this.directPool || this.mainPool;
  }

  // Получить подключение к основной БД (для пользователей)
  async getMainConnection() {
    if (!this.poolsInitialized) {
      await this.initializePools();
    }
    return this.mainPool;
  }

  // Инициализировать основные таблицы в схеме public
  async initializeMainTables() {
    // Убеждаемся, что пулы инициализированы
    if (!this.poolsInitialized) {
      await this.initializePools();
    }
    
    // Используем прямое подключение для DDL операций
    const pool = await this.getDirectPool();
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
    const pool = await this.getDirectPool();
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
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.templates (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('workers', 'itr')),
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.template_workers_data_table (
        id SERIAL PRIMARY KEY,
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        name VARCHAR(255),
        number_of_hours_worked INTEGER,
        salary_per_day INTEGER,
        salary_per_hour INTEGER,
        total DECIMAL,
        template_id INTEGER NOT NULL,
        FOREIGN KEY (template_id) REFERENCES ${schemaName}.templates(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${schemaName}.template_itr_data_table (
        id SERIAL PRIMARY KEY,
        date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        name VARCHAR(255),
        salary_per_month INTEGER,
        template_id INTEGER NOT NULL,
        FOREIGN KEY (template_id) REFERENCES ${schemaName}.templates(id) ON DELETE CASCADE
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

  // Проверить и создать отсутствующие таблицы в схеме пользователя
  async ensureUserTables(userId) {
    const schemaName = `user_${userId}`;
    const pool = await this.getDirectPool();
    const client = await pool.connect();
    
    try {
      // Проверяем существование схемы
      const schemaCheck = await client.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [schemaName]
      );
      
      if (schemaCheck.rows.length === 0) {
        console.log(`⚠️ Схема ${schemaName} не существует, создаем...`);
        await this.createUserDatabase(userId);
        return;
      }
      
      // Проверяем наличие критических таблиц, которые могли быть добавлены позже
      // Проверяем несколько таблиц, которые могут отсутствовать в старых схемах
      const criticalTables = ['workers_tax_data', 'itr_tax_data', 'calculation_media_files', 'templates', 'template_workers_data_table', 'template_itr_data_table'];
      const missingTables = [];
      
      for (const tableName of criticalTables) {
        const tableCheck = await client.query(
          `SELECT table_name FROM information_schema.tables 
           WHERE table_schema = $1 AND table_name = $2`,
          [schemaName, tableName]
        );
        
        if (tableCheck.rows.length === 0) {
          missingTables.push(tableName);
        }
      }
      
      if (missingTables.length > 0) {
        console.log(`⚠️ Отсутствуют таблицы в схеме ${schemaName}: ${missingTables.join(', ')}`);
        console.log(`   Создаем недостающие таблицы...`);
        await this.createTablesProgrammatically(client, schemaName);
        console.log(`✅ Недостающие таблицы в схеме ${schemaName} созданы`);
      }
    } catch (error) {
      console.error(`❌ Ошибка при проверке таблиц в схеме ${schemaName}:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  // Получить подключение к схеме пользователя
  async getUserConnection(userId) {
    // Убеждаемся, что пулы инициализированы
    if (!this.poolsInitialized) {
      await this.initializePools();
    }
    
    // Проверяем и создаем отсутствующие таблицы (для миграции)
    try {
      await this.ensureUserTables(userId);
    } catch (error) {
      console.warn(`⚠️ Не удалось проверить таблицы для пользователя ${userId}:`, error.message);
      // Продолжаем работу, даже если проверка не удалась
    }
    
    // Возвращаем объект с методом query, который устанавливает схему поиска
    return {
      query: async (query, params) => {
        const client = await this.mainPool.connect();
        try {
          // Устанавливаем схему поиска для пользователя
          await client.query(`SET search_path TO user_${userId}, public`);
          try {
            return await client.query(query, params);
          } catch (error) {
            // Автовосстановление: если таблицы в схеме пользователя не были созданы/обновлены (старые схемы),
            // то пробуем создать недостающие таблицы и повторить запрос один раз.
            if (error && error.code === '42P01') {
              console.warn(
                `⚠️ Missing relation for user_${userId} (42P01). Trying to ensure tables and retry once...`
              );
              await this.ensureUserTables(userId);
              await client.query(`SET search_path TO user_${userId}, public`);
              return await client.query(query, params);
            }
            throw error;
          }
        } finally {
          client.release();
        }
      }
    };
  }

  // Удалить схему пользователя
  async deleteUserDatabase(userId) {
    // Используем прямое подключение для DDL операций
    const pool = await this.getDirectPool();
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
    if (this.mainPool) {
      await this.mainPool.end();
    }
    if (this.directPool) {
      await this.directPool.end();
    }
  }
}

module.exports = new DatabaseManager();


