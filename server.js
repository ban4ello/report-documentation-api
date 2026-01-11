require('dotenv').config();
const express = require('express')
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const dbManager = require('./dbManager');
const PORT = process.env.PORT || 8000
const app = express()
const calculationRouter = require('./routes/calculation.routes.js')
const parentCalculationRouter = require('./routes/parent-calculation.routes.js')
const workersRouter = require('./routes/workers.routes.js')
const authRouter = require('./routes/auth.routes.js')

app.use(cookieParser());

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://report-documentation.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

// Явная обработка preflight запросов (OPTIONS)
app.options('*', cors({
  origin: function (origin, callback) {
    if (!origin || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin) || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return callback(null, true);
    }
    callback(null, true); // Временно разрешаем все
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie', 'Accept'],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200
}));

// CORS middleware для всех запросов
app.use(cors({
  origin: function (origin, callback) {
    // Разрешаем запросы без origin (мобильные приложения, Postman, curl)
    if (!origin) {
      console.log('🔓 CORS: Запрос без origin разрешен');
      return callback(null, true);
    }
    
    // Разрешаем любой origin в development режиме
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔓 CORS: Development режим - origin разрешен: ${origin}`);
      return callback(null, true);
    }
    
    // Логируем все запросы для отладки
    console.log(`🔍 CORS: Проверка origin: ${origin}`);
    console.log(`   Разрешенные origins: ${allowedOrigins.join(', ') || 'none'}`);
    
    // Проверяем разрешенные origins
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      // Точное совпадение
      if (origin === allowedOrigin) {
        console.log(`✅ CORS: Точное совпадение с ${allowedOrigin}`);
        return true;
      }
      // Проверка начала строки (для поддоменов)
      if (origin.startsWith(allowedOrigin)) {
        console.log(`✅ CORS: Origin начинается с ${allowedOrigin}`);
        return true;
      }
      return false;
    });
    
    if (isAllowed) {
      return callback(null, true);
    }
    
    // Для продакшена временно разрешаем все origins (для тестирования)
    // В будущем можно заменить на: callback(new Error('Not allowed by CORS'));
    console.warn(`⚠️ CORS: Origin не в списке разрешенных, но разрешен временно: ${origin}`);
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie', 'Accept'],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200,
  preflightContinue: false
}));

// Middleware для логирования CORS запросов (для отладки)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS' || req.headers.origin) {
    console.log(`📥 ${req.method} ${req.path}`);
    console.log(`   Origin: ${req.headers.origin || 'none'}`);
    console.log(`   Access-Control-Request-Method: ${req.headers['access-control-request-method'] || 'none'}`);
    console.log(`   Access-Control-Request-Headers: ${req.headers['access-control-request-headers'] || 'none'}`);
  }
  next();
});

app.use(bodyParser.json());
app.use(express.json())
app.use('/api', calculationRouter)
app.use('/api', parentCalculationRouter)
app.use('/api', workersRouter)
app.use('/api', authRouter)

const server = app.listen(PORT, async () => {
  console.log('Server started on port ' + PORT);
  console.log('🌐 CORS configuration:');
  console.log(`   Allowed origins: ${allowedOrigins.join(', ') || 'none'}`);
  console.log(`   FRONTEND_URL: ${process.env.FRONTEND_URL || 'not set'}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  
  // Инициализация пулов подключений с резолвом IPv4 адресов
  try {
    await dbManager.initializePools();
  } catch (error) {
    console.error('❌ Ошибка при инициализации пулов подключений:', error.message);
  }
  
  // Инициализация основных таблиц при старте сервера
  try {
    await dbManager.initializeMainTables();
    console.log('✅ Основные таблицы инициализированы');
  } catch (error) {
    console.error('❌ Ошибка при инициализации основных таблиц:', error.message);
    console.error('⚠️  Сервер продолжит работу, но таблицы должны быть созданы вручную.');
    console.error('💡 Выполните SQL скрипт в Supabase SQL Editor:');
    console.error('   server/scripts/create-main-tables-supabase.sql');
  }
});

app.requestTimeout = 10000;

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    console.log('Process terminated');
    await dbManager.closeAll();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(async () => {
    console.log('Process terminated');
    await dbManager.closeAll();
    process.exit(0);
  });
});
