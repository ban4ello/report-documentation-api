-- Миграция для изменения типа поля notes с VARCHAR(255) на TEXT
-- Это позволяет хранить большие тексты в полях notes

-- Изменение типа поля notes в таблице specification_data
ALTER TABLE specification_data ALTER COLUMN notes TYPE TEXT;

-- Изменение типа поля notes в таблице workers_data
ALTER TABLE workers_data ALTER COLUMN notes TYPE TEXT;

-- Изменение типа поля notes в таблице itr_data
ALTER TABLE itr_data ALTER COLUMN notes TYPE TEXT;

