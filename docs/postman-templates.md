# Примеры запросов для Postman - API Шаблонов

## 🔐 Настройка авторизации

Все запросы требуют авторизации через Bearer token.

**Шаг 1:** Сначала получите токен через `/api/login`:

```http
POST http://localhost:8000/api/login
Content-Type: application/json

{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Шаг 2:** Скопируйте токен из ответа и используйте его в заголовке `Authorization`:

```
Authorization: Bearer YOUR_TOKEN_HERE
```

---

## 📋 1. Создать шаблон "Зарплата - Цех" (workers)

**POST** `http://localhost:8000/api/template`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "title": "Шаблон зарплаты цеха - Стандартный",
  "templateType": "workers",
  "workersData": [
    {
      "name": "Иванов Иван Иванович",
      "numberOfHoursWorked": 8,
      "salaryPerDay": 2000,
      "salaryPerHour": 250,
      "total": 16000
    },
    {
      "name": "Петров Петр Петрович",
      "numberOfHoursWorked": 8,
      "salaryPerDay": 1800,
      "salaryPerHour": 225,
      "total": 14400
    },
    {
      "name": "Сидоров Сидор Сидорович",
      "numberOfHoursWorked": 6,
      "salaryPerDay": 1500,
      "salaryPerHour": 250,
      "total": 9000
    }
  ]
}
```

**Ожидаемый ответ (201 Created):**
```json
{
  "id": 1,
  "title": "Шаблон зарплаты цеха - Стандартный",
  "templateType": "workers",
  "dateOfCreation": "2026-02-06T12:00:00.000Z",
  "workersData": [
    {
      "id": 1,
      "name": "Иванов Иван Иванович",
      "numberOfHoursWorked": 8,
      "salaryPerDay": 2000,
      "salaryPerHour": 250,
      "total": 16000
    },
    {
      "id": 2,
      "name": "Петров Петр Петрович",
      "numberOfHoursWorked": 8,
      "salaryPerDay": 1800,
      "salaryPerHour": 225,
      "total": 14400
    },
    {
      "id": 3,
      "name": "Сидоров Сидор Сидорович",
      "numberOfHoursWorked": 6,
      "salaryPerDay": 1500,
      "salaryPerHour": 250,
      "total": 9000
    }
  ]
}
```

---

## 📋 2. Создать шаблон "Зарплата - ИТР" (itr)

**POST** `http://localhost:8000/api/template`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "title": "Шаблон зарплаты ИТР - Базовый",
  "templateType": "itr",
  "itrData": [
    {
      "name": "Директор",
      "salaryPerMonth": 150000
    },
    {
      "name": "Главный инженер",
      "salaryPerMonth": 120000
    },
    {
      "name": "Инженер-конструктор",
      "salaryPerMonth": 80000
    },
    {
      "name": "Технолог",
      "salaryPerMonth": 75000
    }
  ]
}
```

**Ожидаемый ответ (201 Created):**
```json
{
  "id": 2,
  "title": "Шаблон зарплаты ИТР - Базовый",
  "templateType": "itr",
  "dateOfCreation": "2026-02-06T12:05:00.000Z",
  "itrData": [
    {
      "id": 1,
      "name": "Директор",
      "salaryPerMonth": 150000
    },
    {
      "id": 2,
      "name": "Главный инженер",
      "salaryPerMonth": 120000
    },
    {
      "id": 3,
      "name": "Инженер-конструктор",
      "salaryPerMonth": 80000
    },
    {
      "id": 4,
      "name": "Технолог",
      "salaryPerMonth": 75000
    }
  ]
}
```

---

## 📋 3. Получить все шаблоны

**GET** `http://localhost:8000/api/templates`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
```

**Ожидаемый ответ (200 OK):**
```json
[
  {
    "id": 1,
    "title": "Шаблон зарплаты цеха - Стандартный",
    "templateType": "workers",
    "dateOfCreation": "2026-02-06T12:00:00.000Z",
    "workersData": [
      {
        "id": 1,
        "name": "Иванов Иван Иванович",
        "numberOfHoursWorked": 8,
        "salaryPerDay": 2000,
        "salaryPerHour": 250,
        "total": 16000
      }
    ]
  },
  {
    "id": 2,
    "title": "Шаблон зарплаты ИТР - Базовый",
    "templateType": "itr",
    "dateOfCreation": "2026-02-06T12:05:00.000Z",
    "itrData": [
      {
        "id": 1,
        "name": "Директор",
        "salaryPerMonth": 150000
      }
    ]
  }
]
```

---

## 📋 4. Получить шаблон по ID

**GET** `http://localhost:8000/api/template/1`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
```

**Ожидаемый ответ (200 OK):**
```json
{
  "id": 1,
  "title": "Шаблон зарплаты цеха - Стандартный",
  "templateType": "workers",
  "dateOfCreation": "2026-02-06T12:00:00.000Z",
  "workersData": [
    {
      "id": 1,
      "name": "Иванов Иван Иванович",
      "numberOfHoursWorked": 8,
      "salaryPerDay": 2000,
      "salaryPerHour": 250,
      "total": 16000
    }
  ]
}
```

**Ошибка (404 Not Found):**
```json
{
  "message": "Шаблон не найден",
  "code": "TEMPLATE_NOT_FOUND"
}
```

---

## 📋 5. Обновить шаблон

**PUT** `http://localhost:8000/api/template/1`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Body (raw JSON) - Обновление шаблона "workers":**
```json
{
  "title": "Шаблон зарплаты цеха - Обновленный",
  "templateType": "workers",
  "workersData": [
    {
      "name": "Новый сотрудник",
      "numberOfHoursWorked": 8,
      "salaryPerDay": 2200,
      "salaryPerHour": 275,
      "total": 17600
    }
  ]
}
```

**Body (raw JSON) - Обновление только названия:**
```json
{
  "title": "Новое название шаблона"
}
```

**Ожидаемый ответ (200 OK):**
```json
{
  "id": 1,
  "title": "Шаблон зарплаты цеха - Обновленный",
  "templateType": "workers",
  "dateOfCreation": "2026-02-06T12:00:00.000Z",
  "workersData": [
    {
      "id": 5,
      "name": "Новый сотрудник",
      "numberOfHoursWorked": 8,
      "salaryPerDay": 2200,
      "salaryPerHour": 275,
      "total": 17600
    }
  ]
}
```

---

## 📋 6. Удалить шаблон

**DELETE** `http://localhost:8000/api/template/1`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
```

**Ожидаемый ответ (200 OK):**
```json
{
  "message": "Шаблон успешно удален",
  "id": 1
}
```

**Ошибка (404 Not Found):**
```json
{
  "message": "Шаблон не найден",
  "code": "TEMPLATE_NOT_FOUND"
}
```

---

## ⚠️ Примеры ошибок

### Ошибка валидации (400 Bad Request)
```json
{
  "message": "Название и тип шаблона обязательны",
  "code": "MISSING_REQUIRED_FIELDS"
}
```

```json
{
  "message": "Тип шаблона должен быть \"workers\" или \"itr\"",
  "code": "INVALID_TEMPLATE_TYPE"
}
```

```json
{
  "message": "Данные для шаблона \"Зарплата - Цех\" обязательны",
  "code": "MISSING_WORKERS_DATA"
}
```

### Ошибка авторизации (401 Unauthorized)
```json
{
  "message": "Токен доступа отсутствует",
  "code": "NO_TOKEN"
}
```

```json
{
  "message": "Токен истек",
  "code": "TOKEN_EXPIRED"
}
```

### Ошибка сервера (500 Internal Server Error)
```json
{
  "message": "Ошибка при создании шаблона",
  "code": "TEMPLATE_CREATE_ERROR",
  "error": "Подробное описание ошибки"
}
```

---

## 📝 Примечания

1. **Базовый URL:** Замените `http://localhost:8000` на ваш production URL при необходимости
2. **Токен:** Токен получается при авторизации через `/api/login` и действителен в течение определенного времени
3. **Типы шаблонов:** 
   - `workers` - для шаблона "Зарплата - Цех"
   - `itr` - для шаблона "Зарплата - ИТР"
4. **Поля данных:**
   - Для `workers`: `name`, `numberOfHoursWorked`, `salaryPerDay`, `salaryPerHour`, `total`
   - Для `itr`: `name`, `salaryPerMonth`
5. **Обновление:** При обновлении шаблона все старые данные удаляются и заменяются новыми
6. **Автоматическое создание таблиц:** Таблицы создаются автоматически при первом обращении к API для существующих пользователей

---

## 🚀 Быстрый старт в Postman

1. Создайте новую коллекцию "Templates API"
2. Добавьте переменную окружения `baseUrl` = `http://localhost:8000`
3. Добавьте переменную окружения `token` = `YOUR_TOKEN_HERE`
4. В настройках коллекции добавьте заголовок:
   - Key: `Authorization`
   - Value: `Bearer {{token}}`
5. Используйте `{{baseUrl}}/api/template` в запросах
