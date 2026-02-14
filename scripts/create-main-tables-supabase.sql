-- SQL скрипт для создания основных таблиц в схеме public для Supabase
-- Выполните этот скрипт в Supabase SQL Editor

-- Установка схемы поиска на public
SET search_path TO public;

-- Таблица users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  role VARCHAR(10) DEFAULT 'guest',
  username VARCHAR(255),
  email VARCHAR(50) NOT NULL UNIQUE,
  isActivated BOOLEAN DEFAULT FALSE,
  activationLink VARCHAR(255),
  password VARCHAR(255) NOT NULL
);

-- Таблица login_attempts
CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(50) NOT NULL,
  success BOOLEAN DEFAULT FALSE,
  ip_address VARCHAR(45),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Таблица tokenSchema
CREATE TABLE IF NOT EXISTS tokenSchema (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  refreshToken VARCHAR(50) NOT NULL UNIQUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Проверка создания таблиц
SELECT 
  schemaname,
  tablename
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'login_attempts', 'tokenSchema')
ORDER BY tablename;

