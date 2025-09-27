# Report Documentation API Server

Node.js/Express API сервер для системы управления расчетами и документацией.

## 🚀 Технологии

- **Node.js** - JavaScript runtime
- **Express.js** - веб-фреймворк
- **PostgreSQL** - база данных
- **JWT** - аутентификация
- **bcryptjs** - хеширование паролей
- **CORS** - кросс-доменные запросы
- **PM2** - менеджер процессов (продакшн)

## 📋 Требования

- Node.js (версия 14 или выше)
- PostgreSQL (версия 12 или выше)
- npm или yarn

## 🛠 Установка и настройка

### 1. Установка зависимостей

```bash
cd server
npm install
```

### 2. Настройка PostgreSQL

Установите PostgreSQL и создайте базу данных:

```bash
# Подключение к PostgreSQL
psql -U postgres

# Создание базы данных
CREATE DATABASE calculations;

# Выход из psql
\q
```

### 3. Создание таблиц

Выполните SQL-скрипт для создания всех необходимых таблиц:

```bash
# Выполнение SQL-скрипта
psql -U postgres -d calculations -f database.sql
```

### 4. Настройка переменных окружения

Создайте файл `.env` в корне папки `server`:

```env
PORT=8000
JWT_SECRET=your_jwt_secret_key_here
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calculations
DB_USER=postgres
DB_PASSWORD=root
```

**⚠️ Важно:** Замените `your_jwt_secret_key_here` на безопасный секретный ключ!

## 🚀 Запуск сервера

### Режим разработки (с автоперезагрузкой)

```bash
npm run dev
```

### Продакшн режим (с PM2)

```bash
npm start
```

### Остановка сервера

```bash
npm run stop
```

## 📊 Структура базы данных

База данных содержит следующие таблицы:

- **users** - пользователи системы
- **tokenSchema** - refresh токены
- **workers** - сотрудники
- **parent_calculation** - родительские расчеты
- **calculation** - основные расчеты
- **specification_data** - данные спецификаций
- **workers_data** - данные по рабочим
- **itr_data** - данные ИТР
- **workers_tax_data** - налоговые данные рабочих
- **itr_tax_data** - налоговые данные ИТР

## 🔌 API Endpoints

### Аутентификация
- `POST /api/signup` - регистрация пользователя
- `POST /api/login` - вход в систему

### Расчеты
- `GET /api/calculations` - получение всех расчетов
- `POST /api/calculations` - создание нового расчета
- `GET /api/calculations/:id` - получение расчета по ID
- `PUT /api/calculations/:id` - обновление расчета
- `DELETE /api/calculations/:id` - удаление расчета

### Родительские расчеты
- `GET /api/parent-calculations` - получение всех родительских расчетов
- `POST /api/parent-calculations` - создание родительского расчета
- `GET /api/parent-calculations/:id` - получение родительского расчета по ID
- `PUT /api/parent-calculations/:id` - обновление родительского расчета
- `DELETE /api/parent-calculations/:id` - удаление родительского расчета

### Сотрудники
- `GET /api/workers` - получение всех сотрудников
- `POST /api/workers` - создание сотрудника
- `GET /api/workers/:id` - получение сотрудника по ID
- `PUT /api/workers/:id` - обновление сотрудника
- `DELETE /api/workers/:id` - удаление сотрудника

## 🛠 Доступные команды

```bash
# Разработка
npm run dev          # Запуск с nodemon

# Продакшн
npm start            # Запуск с PM2
npm run stop         # Остановка PM2 процесса

# Линтинг
npm run lint:fix     # Исправление ошибок ESLint
```

## 🔧 Настройка базы данных

Если необходимо изменить параметры подключения к БД, отредактируйте файл `db.js`:

```javascript
const pool = new Pool({
    user: 'your_username',
    database: 'your_database_name',
    password: 'your_password',
    host: 'localhost',
    port: 5432,
})
```

## 🗄️ Подключение к базе данных

Для прямого подключения к базе данных PostgreSQL используйте команду:

```bash
psql -U postgres -d calculations
```

**Где:**
- `-U postgres` - имя пользователя PostgreSQL
- `-d calculations` - имя базы данных

После подключения вы сможете выполнять SQL-запросы напрямую:

```sql
-- Просмотр всех таблиц
\dt

-- Просмотр структуры таблицы
\d users

-- Выполнение SQL-запросов
SELECT * FROM users LIMIT 5;

-- Выход из psql
\q
```

**Полезные команды psql:**
- `\l` - список всех баз данных
- `\c database_name` - подключение к другой базе данных
- `\dt` - список всех таблиц в текущей БД
- `\d table_name` - структура конкретной таблицы
- `\q` - выход из psql

## 🐛 Решение проблем

### Ошибка подключения к базе данных
- Убедитесь, что PostgreSQL запущен
- Проверьте правильность параметров подключения в `db.js`
- Убедитесь, что база данных `calculations` существует

### Порт уже используется
- Измените `PORT` в файле `.env`
- Или остановите процесс, использующий порт 8000

### Ошибки JWT
- Убедитесь, что `JWT_SECRET` установлен в файле `.env`
- Используйте безопасный секретный ключ

## 📝 Структура проекта

```
server/
├── controller/          # Контроллеры API
│   ├── auth.controller.js
│   ├── calculation.controller.js
│   ├── parent-calculation.controller.js
│   └── workers.controller.js
├── routes/              # Маршруты API
│   ├── auth.routes.js
│   ├── calculation.routes.js
│   ├── parent-calculation.routes.js
│   └── workers.routes.js
├── database.sql         # SQL скрипт для создания БД
├── db.js               # Конфигурация подключения к БД
├── server.js           # Основной файл сервера
├── package.json        # Зависимости и скрипты
└── eslint.config.mjs   # Конфигурация ESLint
```

## 🌐 Проверка работы

После запуска сервер будет доступен по адресу: `http://localhost:8000`

Для проверки работы API можно использовать:

```bash
# Проверка регистрации
curl -X POST http://localhost:8000/api/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"123456"}'

# Проверка входа
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456"}'
```

## 📄 Лицензия

ISC License

## 👥 Авторы

Команда разработки Report Documentation