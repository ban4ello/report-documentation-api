# Report Documentation API Server

Node.js/Express API сервер для системы управления расчетами и документацией с **полной изоляцией данных пользователей**.

## 🏗️ Архитектура системы

Система использует **схемы PostgreSQL** для обеспечения полной изоляции данных между пользователями:

- **Основная БД** `calculations` - содержит таблицы `users` и `tokenSchema`
- **Пользовательские схемы** `user_{userId}` - изолированные данные каждого пользователя
- **Автоматическое создание** схем при регистрации новых пользователей
- **Полная изоляция** - каждый пользователь работает только со своими данными

## 🚀 Технологии

- **Node.js** - JavaScript runtime
- **Express.js** - веб-фреймворк
- **PostgreSQL** - база данных с изоляцией через схемы
- **JWT** - аутентификация
- **bcryptjs** - хеширование паролей
- **CORS** - кросс-доменные запросы
- **PM2** - менеджер процессов (продакшн)

## 📋 Требования

- Node.js (версия 14 или выше)
- PostgreSQL (версия 12 или выше)
- npm или yarn

## 🛠 Установка и настройка

### 0. Клонирование репозитория

```bash
git clone https://github.com/ban4ello/report-documentation-api.git server
cd server
```

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка PostgreSQL

Установите PostgreSQL и создайте базу данных:

```bash
# Создание основной базы данных
psql -U postgres -c "CREATE DATABASE calculations OWNER postgres;"

# Создание системных таблиц
psql -U postgres -d calculations -f database.sql
```

### 3. Настройка переменных окружения

Создайте файл `.env` в корне папки `server`:

```env
PORT=8000
JWT_SECRET=your_jwt_secret_key_here
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calculations
DB_USER=postgres
DB_PASSWORD=root
USER_ID=1
```

**⚠️ Важно:** Замените `your_jwt_secret_key_here` на безопасный секретный ключ!

### 📋 Описание переменных окружения

| Переменная | Описание | Пример | Обязательная |
|------------|----------|--------|--------------|
| `PORT` | Порт, на котором будет запущен сервер | `8000` | ✅ |
| `JWT_SECRET` | Секретный ключ для подписи JWT токенов | `your_jwt_secret_key_here` | ✅ |
| `DB_HOST` | Хост базы данных PostgreSQL | `localhost` | ✅ |
| `DB_PORT` | Порт базы данных PostgreSQL | `5432` | ✅ |
| `DB_NAME` | Название базы данных | `calculations` | ✅ |
| `DB_USER` | Пользователь для подключения к БД | `postgres` | ✅ |
| `DB_PASSWORD` | Пароль для подключения к БД | `root` | ✅ |
| `USER_ID` | ID пользователя по умолчанию для тестирования | `1` | ❌ |

#### Детальное описание:

- **`PORT`** - Порт, на котором будет запущен Express сервер. По умолчанию `8000`. Убедитесь, что порт свободен или измените на другой.

- **`JWT_SECRET`** - Секретный ключ для подписи и проверки JWT токенов. **КРИТИЧЕСКИ ВАЖНО**: Используйте длинный, случайный ключ в продакшене. Пример: `my_super_secret_jwt_key_2024_very_long_and_secure`

- **`DB_HOST`** - Адрес сервера PostgreSQL. Для локальной разработки обычно `localhost`. Для удаленного сервера укажите IP или домен.

- **`DB_PORT`** - Порт PostgreSQL сервера. Стандартный порт `5432`. Измените, если PostgreSQL настроен на другом порту.

- **`DB_NAME`** - Название базы данных. Должна существовать в PostgreSQL. По умолчанию `calculations`.

- **`DB_USER`** - Имя пользователя PostgreSQL с правами на создание схем и таблиц. Обычно `postgres` или создайте отдельного пользователя.

- **`DB_PASSWORD`** - Пароль пользователя PostgreSQL. Убедитесь, что пароль правильный и пользователь имеет необходимые права.

- **`USER_ID`** - ID пользователя для тестирования и отладки. Используется в некоторых скриптах. Не обязательная переменная.

### 4. Быстрая настройка (одной командой)

```bash
# Создание .env файла
cat > .env << 'EOF'
PORT=8000
JWT_SECRET=jwt_secret_key_report_docs
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calculations
DB_USER=postgres
DB_PASSWORD=root
USER_ID=1
EOF

# Создание БД и таблиц
psql -U postgres -c "CREATE DATABASE calculations OWNER postgres;"
psql -U postgres -d calculations -f database.sql
```

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

## 🗄️ Структура базы данных

### Основная схема `public` (общая для всех):
- **users** - пользователи системы
- **tokenSchema** - refresh токены

### Пользовательские схемы `user_{userId}` (изолированные):
- **workers** - сотрудники
- **parent_calculation** - родительские расчеты
- **calculation** - основные расчеты
- **specification_data** - данные спецификаций
- **specification_data_table** - таблица спецификаций
- **workers_data** - данные по рабочим
- **workers_data_table** - таблица данных рабочих
- **itr_data** - данные ИТР
- **itr_data_table** - таблица данных ИТР
- **workers_tax_data** - налоговые данные рабочих
- **itr_tax_data** - налоговые данные ИТР

## 🔌 API Endpoints

### Аутентификация
- `POST /api/signup` - регистрация пользователя (автоматически создает схему)
- `POST /api/login` - вход в систему
- `POST /api/logout` - выход из системы

### Расчеты (требуют аутентификации)
- `GET /api/calculations` - получение всех расчетов пользователя
- `POST /api/calculation` - создание нового расчета
- `GET /api/calculation/:id` - получение расчета по ID
- `PUT /api/calculation/:id` - обновление расчета
- `DELETE /api/calculation/:id` - удаление расчета

### Родительские расчеты (требуют аутентификации)
- `GET /api/parent-calculations` - получение всех родительских расчетов
- `POST /api/parent-calculation` - создание родительского расчета
- `DELETE /api/parent-calculation/:id` - удаление родительского расчета

### Сотрудники (требуют аутентификации)
- `GET /api/workers` - получение всех сотрудников
- `POST /api/worker` - создание сотрудника
- `PUT /api/worker/:id` - обновление сотрудника
- `DELETE /api/worker/:id` - удаление сотрудника

## 🔐 Безопасность и изоляция данных

### Принципы работы:
1. **Регистрация**: Создается пользователь + автоматически создается схема `user_{userId}`
2. **Аутентификация**: Middleware устанавливает `search_path` на схему пользователя
3. **Изоляция**: Все запросы выполняются в контексте схемы конкретного пользователя
4. **Безопасность**: Невозможно получить доступ к данным других пользователей

### Пример работы:
```javascript
// При запросе с токеном пользователя ID=5
// Автоматически устанавливается: SET search_path TO user_5, public
// Все таблицы ищутся сначала в схеме user_5, затем в public
```

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

## 🗄️ Подключение к базе данных

Для прямого подключения к базе данных PostgreSQL:

```bash
psql -U postgres -d calculations
```

### Полезные команды для работы со схемами:

```sql
-- Просмотр всех схем
\dn

-- Переключение на схему пользователя
SET search_path TO user_123, public;

-- Просмотр таблиц в текущей схеме
\dt

-- Просмотр структуры таблицы
\d workers

-- Просмотр всех таблиц во всех схемах
SELECT schemaname, tablename FROM pg_tables WHERE schemaname LIKE 'user_%';

-- Выход из psql
\q
```

## 🧪 Тестирование системы

### Регистрация пользователя:
```bash
curl -X POST http://localhost:8000/api/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "123456",
    "role": "guest"
  }'
```

### Вход в систему:
```bash
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "123456"
  }'
```

### Создание сотрудника (с токеном):
```bash
curl -X POST http://localhost:8000/api/worker \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Иван",
    "lastname": "Петров",
    "position": "Инженер"
  }'
```

## 🐛 Решение проблем

### Ошибка подключения к базе данных
- Убедитесь, что PostgreSQL запущен
- Проверьте правильность параметров подключения в `.env`
- Убедитесь, что база данных `calculations` существует

### Ошибка создания схемы пользователя
- Проверьте права пользователя PostgreSQL на создание схем
- Убедитесь, что нет активных подключений к БД

### Порт уже используется
- Измените `PORT` в файле `.env`
- Или остановите процесс: `pkill -f "node.*server.js"`

### Ошибки JWT
- Убедитесь, что `JWT_SECRET` установлен в файле `.env`
- Используйте безопасный секретный ключ

## 📝 Структура проекта

```
server/
├── controller/              # Контроллеры API
│   ├── auth.controller.js   # Аутентификация + создание схем
│   ├── calculation.controller.js
│   ├── parent-calculation.controller.js
│   └── workers.controller.js
├── middleware/              # Middleware
│   └── auth.js             # Аутентификация + установка схемы
├── routes/                  # Маршруты API
│   ├── auth.routes.js
│   ├── calculation.routes.js
│   ├── parent-calculation.routes.js
│   └── workers.routes.js
├── database.sql             # SQL скрипт для создания системных таблиц
├── db.js                   # Конфигурация подключения к основной БД
├── dbManager.js            # Менеджер схем пользователей
├── server.js               # Основной файл сервера
├── package.json            # Зависимости и скрипты
└── eslint.config.mjs       # Конфигурация ESLint
```

## 🌐 Проверка работы

После запуска сервер будет доступен по адресу: `http://localhost:8000`

### Проверка создания схем:
```sql
-- Подключение к БД
psql -U postgres -d calculations

-- Просмотр всех схем пользователей
SELECT schemaname FROM pg_namespace WHERE nspname LIKE 'user_%';

-- Просмотр таблиц в схеме пользователя
SET search_path TO user_1, public;
\dt
```

## 🔧 Мониторинг и обслуживание

### Просмотр использования схем:
```sql
-- Размер каждой схемы пользователя
SELECT 
    schemaname,
    pg_size_pretty(sum(pg_total_relation_size(schemaname||'.'||tablename))::bigint) as size
FROM pg_tables 
WHERE schemaname LIKE 'user_%' 
GROUP BY schemaname;
```

### Очистка неиспользуемых схем:
```sql
-- Удаление схемы пользователя (при необходимости)
DROP SCHEMA IF EXISTS user_123 CASCADE;
```

## 📄 Лицензия

ISC License

## 👥 Авторы

Команда разработки Report Documentation