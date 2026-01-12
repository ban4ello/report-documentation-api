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

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://report-documentation.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

// CORS должен быть ПЕРВЫМ middleware, до всех остальных
app.use(cors({
  origin: function (origin, callback) {
    // Разрешаем запросы без origin (например, Postman, мобильные приложения)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie', 'Accept'],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200
}));

app.use(cookieParser());

// Middleware для логирования всех запросов (для отладки CORS)
app.use((req, res, next) => {
  // Логируем все запросы
  console.log(`📥 ${req.method} ${req.path}`);
  console.log(`   Origin: ${req.headers.origin || 'none'}`);
  console.log(`   User-Agent: ${req.headers['user-agent'] || 'none'}`);
  if (req.method === 'OPTIONS') {
    console.log(`   ⚙️ Preflight запрос`);
    console.log(`   Access-Control-Request-Method: ${req.headers['access-control-request-method'] || 'none'}`);
    console.log(`   Access-Control-Request-Headers: ${req.headers['access-control-request-headers'] || 'none'}`);
  }
  
  // Перехватываем отправку ответа для логирования CORS заголовков
  const originalSend = res.send;
  res.send = function(data) {
    console.log(`📤 ${req.method} ${req.path} - Response ${res.statusCode}`);
    if (req.headers.origin) {
      console.log(`   CORS Headers:`, {
        'Access-Control-Allow-Origin': res.getHeader('Access-Control-Allow-Origin') || 'not set',
        'Access-Control-Allow-Credentials': res.getHeader('Access-Control-Allow-Credentials') || 'not set',
        'Access-Control-Allow-Methods': res.getHeader('Access-Control-Allow-Methods') || 'not set',
        'Access-Control-Allow-Headers': res.getHeader('Access-Control-Allow-Headers') || 'not set'
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
