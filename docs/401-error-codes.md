# Обработка ошибок 401 - Разделение типов

## Проблема
Ранее все ошибки 401 обрабатывались одинаково - как ошибки токена, что приводило к нежелательному logout и редиректу на страницу логина даже при обычной ошибке входа.

## Решение
Разделение ошибок 401 по кодам (error.code):

### 🔐 Ошибки токена (делают logout и редирект на `/login`):
- `TOKEN_EXPIRED` - токен истек
- `INVALID_TOKEN` - неверный токен
- `NO_TOKEN` - токен отсутствует
- `INVALID_TOKEN_FORMAT` - неверный формат токена

### 🔑 Ошибки авторизации (НЕ делают logout):
- `INVALID_CREDENTIALS` - неверный email/пароль при входе
- `USER_ALREADY_EXISTS` - пользователь уже существует при регистрации

## Серверная часть

### auth.controller.js
Возвращает `INVALID_CREDENTIALS` при неправильном email/пароле.

### middleware/auth.js
Возвращает коды ошибок токена при проблемах с токеном:
- `TOKEN_EXPIRED`
- `INVALID_TOKEN`  
- `NO_TOKEN`
- `INVALID_TOKEN_FORMAT`

## Клиентская часть

### api.js (interceptor)
```javascript
if (errorCode === 'TOKEN_EXPIRED' || 
    errorCode === 'INVALID_TOKEN' || 
    errorCode === 'NO_TOKEN' || 
    errorCode === 'INVALID_TOKEN_FORMAT') {
  // Делаем logout и редирект
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}
// Если INVALID_CREDENTIALS - просто пропускаем ошибку дальше
```

## Примеры использования

### ❌ Неправильный вход
```javascript
// POST /login с неверными данными
{
  status: 401,
  data: {
    message: 'Неверные учетные данные',
    code: 'INVALID_CREDENTIALS'
  }
}
// Пользователь остается на странице логина
```

### ⏰ Истекший токен
```javascript
// GET /api/protected с истекшим токеном
{
  status: 401,
  data: {
    message: 'Токен истек',
    code: 'TOKEN_EXPIRED'
  }
}
// Автоматический logout и редирект на /login
```

## Тестирование

1. **Ошибка входа**: Введите неверный email/пароль - должен показаться toast без redirect
2. **Истекший токен**: Подождите 24 часа или сбросьте токен - должен быть автоматический logout
3. **Rate limit**: Сделайте 5+ попыток входа - должен показать таймер, без logout

