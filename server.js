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
app.use(cors())
app.use(bodyParser.json());

app.use(function (req, res, next) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
	res.setHeader('Access-Control-Allow-Credentials', true);

	next();
});
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
    console.error('❌ Ошибка при инициализации основных таблиц:', error);
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
