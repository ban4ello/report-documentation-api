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
// app.use(cors({origin: ['http://localhost:5173', 'http://127.0.0.1:5173']}));
// app.use(cors())

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://report-documentation.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Разрешаем запросы без origin (мобильные приложения, Postman)
    if (!origin) return callback(null, true);
    
    // Разрешаем любой origin в development режиме
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // Проверяем разрешенные origins
    if (allowedOrigins.some(allowedOrigin => {
      // Точное совпадение или если origin начинается с allowedOrigin
      return origin === allowedOrigin || origin.startsWith(allowedOrigin);
    })) {
      return callback(null, true);
    }
    
    // Для продакшена временно разрешаем все origins (для тестирования)
    // В будущем можно заменить на: callback(new Error('Not allowed by CORS'));
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(bodyParser.json());
app.use(express.json())
app.use('/api', calculationRouter)
app.use('/api', parentCalculationRouter)
app.use('/api', workersRouter)
app.use('/api', authRouter)

const server = app.listen(PORT, async () => {
  console.log('Server started on port ' + PORT);
  
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
