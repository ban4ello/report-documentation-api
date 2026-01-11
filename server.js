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

// CORS должен быть ПЕРВЫМ middleware, до всех остальных
// Упрощенная конфигурация CORS - разрешаем все origins
app.use(cors({
  origin: true, // Разрешаем все origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie', 'Accept'],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200
}));

app.use(cookieParser());

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://report-documentation.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

// Middleware для логирования CORS запросов и ответов (для отладки)
app.use((req, res, next) => {
  // Логируем входящие запросы с origin
  if (req.headers.origin) {
    console.log(`📥 ${req.method} ${req.path}`);
    console.log(`   Origin: ${req.headers.origin}`);
    if (req.method === 'OPTIONS') {
      console.log(`   Preflight: ${req.headers['access-control-request-method'] || 'none'}`);
      console.log(`   Request Headers: ${req.headers['access-control-request-headers'] || 'none'}`);
    }
  }
  
  // Перехватываем отправку ответа для логирования CORS заголовков
  const originalSend = res.send;
  res.send = function(data) {
    if (req.headers.origin) {
      console.log(`📤 ${req.method} ${req.path} - Response`);
      console.log(`   Status: ${res.statusCode}`);
      console.log(`   CORS Headers:`, {
        'Access-Control-Allow-Origin': res.getHeader('Access-Control-Allow-Origin'),
        'Access-Control-Allow-Credentials': res.getHeader('Access-Control-Allow-Credentials'),
        'Access-Control-Allow-Methods': res.getHeader('Access-Control-Allow-Methods'),
        'Access-Control-Allow-Headers': res.getHeader('Access-Control-Allow-Headers')
      });
    }
    return originalSend.call(this, data);
  };
  
  next();
});

app.use(bodyParser.json());
app.use(express.json())

// Обработка ошибок CORS
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    console.error(`❌ CORS Error: ${req.headers.origin} не разрешен`);
    return res.status(403).json({ 
      message: 'CORS: Origin не разрешен',
      origin: req.headers.origin 
    });
  }
  next(err);
});

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
