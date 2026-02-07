# 🏪 Merchant Server - Пример интеграции

Этот сервер демонстрирует интеграцию сайта мерчанта с криптовалютным платёжным шлюзом.

server.js	Сервер мерчанта	Express API, эндпоинты, бизнес-логика, webhook обработка
paymentGateway.js	SDK/Клиент	HTTP-запросы к платёжному шлюзу, подписи, инкапсуляция API, можно использовать как npm-модуль в других проектах

---

## 📋 Содержание

- [Быстрый старт](#-быстрый-старт)
- [Структура проекта](#-структура-проекта)
- [Конфигурация](#-конфигурация)
- [API эндпоинты](#-api-эндпоинты)
- [Два способа интеграции](#-два-способа-интеграции)
- [Webhook обработка](#-webhook-обработка)
- [WebSocket подключение](#-websocket-подключение)
- [Тестирование](#-тестирование)

---

## 🚀 Быстрый старт

### Шаг 1: Установка зависимостей

```bash
cd merchant-server
npm install
```

### Шаг 2: Настройка конфигурации

**Вариант A: Через config.js**

```bash
cp config.example.js config.js
nano config.js
```

**Вариант B: Через .env файл**

```bash
cp .env.example .env
nano .env
```

### Шаг 3: Запуск

```bash
# Development (с автоперезагрузкой)
npm run dev

# Production
npm start
```

### Шаг 4: Проверка

```bash
curl http://localhost:4000/api/users/user-123/balance
```

Ответ:
```json
{
  "success": true,
  "data": {
    "user_id": "user-123",
    "balance": 0
  }
}
```

---

## 📁 Структура проекта

### server.js

Основной Express сервер с эндпоинтами:
- API для фронтенда мерчанта
- Webhook обработчик
- Хранение платежей и балансов (в памяти)

### paymentGateway.js

Клиент для работы с API платёжного шлюза:
- Создание инвойсов
- Проверка статусов
- Генерация checkout URL
- Проверка подписей webhook

### websocketClient.js

WebSocket клиент для real-time уведомлений:
- Автопереподключение
- Ping/pong для поддержания соединения
- Обработка событий платежей

---

## ⚙️ Конфигурация

### Параметры

| Параметр | Обязательный | Описание |
|----------|--------------|----------|
| `port` | ✅ | Порт сервера мерчанта (по умолчанию 4000) |
| `paymentGatewayUrl` | ✅ | URL платёжного шлюза |
| `apiKey` | ✅ | API ключ мерчанта (header X-API-Key) |
| `webhookSecret` | ✅ | Секрет для проверки подписей webhook |
| `siteKey` | ✅ | **ОБЯЗАТЕЛЬНЫЙ** ключ сайта (header X-Site-Key) |
| `websocketToken` | ❌ | Токен для WebSocket (опционально) |
| `enableWebSocket` | ❌ | Включить WebSocket (по умолчанию false) |

### ⚠️ ВАЖНО: X-Site-Key обязателен!

**Все API запросы к платёжному шлюзу должны содержать header `X-Site-Key`.**

Почему это важно:
- Каждый сайт мерчанта имеет свои кошельки
- Платежи привязываются к конкретному сайту
- Мнемоника для вывода средств уникальна для каждого сайта

```
┌─────────────────────────────────────────────────────────────────┐
│  Мерчант "GameShop" (api_key: pk_xxx...)                       │
│  ├── Сайт "Основной сайт" (site_key: sk_site1...)              │
│  │   └── Кошельки: 0xABC..., TXYZ..., bc1q...                  │
│  └── Сайт "Мобильное приложение" (site_key: sk_site2...)       │
│      └── Кошельки: 0xDEF..., TUVW..., bc1p...                  │
└─────────────────────────────────────────────────────────────────┘
```

### config.js (рекомендуется)

```javascript
module.exports = {
  // Порт сервера мерчанта
  port: 4000,

  // URL платёжного шлюза
  paymentGatewayUrl: '',

  // API ключ мерчанта
  apiKey: 'pk_abc123...',

  // Webhook секрет для проверки подписи
  webhookSecret: 'whsec_xyz789...',

  // ⚠️ ОБЯЗАТЕЛЬНО! Site Key для идентификации сайта
  siteKey: 'sk_def456...',

  // WebSocket (опционально)
  websocketToken: null,
  enableWebSocket: false,
};
```

### .env (альтернатива)

```env
PORT=4000
PAYMENT_GATEWAY_URL=http://localhost:3000
PAYMENT_GATEWAY_API_KEY=pk_test_abc123...
PAYMENT_GATEWAY_WEBHOOK_SECRET=whsec_xyz789...
PAYMENT_GATEWAY_SITE_KEY=site_def456...
# PAYMENT_GATEWAY_WS_TOKEN=ws_token_... (опционально)
```

## 📡 API эндпоинты

### Создание платежа (API интеграция)

```http
POST /api/payments/create-invoice
Content-Type: application/json
```

**Запрос:**
```json
{
  "user_id": "user-123",
  "amount": 100,
  "currency": "USDT",
  "network": "ethereum",
  "description": "Пополнение баланса"
}
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "id": "invoice-uuid",
    "order_id": "ORDER-1234567890-abc123",
    "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "amount": 100,
    "amount_to_pay": 100.007823,
    "payment_id": "PID-A7F3B2C1",
    "currency": "USDT",
    "network": "ethereum",
    "networkDisplayName": "Ethereum",
    "status": "pending",
    "timeRemaining": 3600,
    "expires_at": "2026-02-07T15:00:00.000Z"
  }
}
```

> ⚠️ **Важно:** Показывайте клиенту `amount_to_pay`, а не `amount`!

---

### Получение checkout URL (Hosted Checkout)

```http
POST /api/payments/checkout-url
Content-Type: application/json
```

**Запрос (сумма в ФИАТЕ!):**
```json
{
  "user_id": "user-123",
  "fiat_amount": 1000,
  "fiat_currency": "USD",
  "currency": "USDT",
  "network": "tron",
  "description": "Пополнение баланса"
}
```

> ⚠️ **Важно:** Для Hosted Checkout передаётся сумма в **фиатной валюте**.
> Конвертация в крипту происходит автоматически на платёжном шлюзе!

**Поддерживаемые фиатные валюты:**
`USD`, `EUR`, `RUB`, `UAH`, `AMD`, `GEL`, `AZN`, `KZT`, `UZS`, `INR`

**Ответ:**
```json
{
  "success": true,
  "data": {
    "order_id": "ORDER-1234567890-abc123",
    "checkout_url": "https://.../checkout/pay?site_key=...&user_id=user-123&fiat_amount=1000&fiat_currency=USD&currency=USDT&network=tron&signature=..."
  }
}
```

---

### Проверка статуса платежа

```http
GET /api/payments/{id}/status
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "id": "invoice-uuid",
    "order_id": "ORDER-1234567890-abc123",
    "status": "confirmed",
    "amount": 100,
    "amount_received": 100,
    "currency": "USDT",
    "network": "ethereum",
    "address": "0x742d35...",
    "transactions": [
      {
        "hash": "0xabc123...",
        "amount": 100,
        "confirmations": 15,
        "status": "confirmed"
      }
    ]
  }
}
```

---

### Баланс пользователя

```http
GET /api/users/{userId}/balance
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "user_id": "user-123",
    "balance": 1542.50,
    "currency": "USD",
    "total_payments": 15
  }
}
```

> ⚠️ **Баланс всегда в USD!** Независимо от того, в какой валюте был платёж.

---

### История платежей пользователя

```http
GET /api/users/{userId}/payments
```

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "order_id": "ORDER-123...",
      "user_id": "user-123",
      "invoice_id": "...",
      "amount": 100,
      "currency": "USDT",
      "network": "ethereum",
      "status": "confirmed",
      "created_at": "2024-01-20T12:00:00.000Z"
    }
  ]
}
```

---

### Список инвойсов с фильтрами

```http
GET /api/invoices
```

**Query параметры:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| `status` | string | Фильтр по статусу (pending,paid,confirmed,expired,failed) |
| `user_id` | string | Фильтр по одному пользователю |
| `user_ids` | string | Список ID пользователей через запятую |
| `date_from` | string | Начало периода (YYYY-MM-DD или ISO 8601) |
| `date_to` | string | Конец периода (YYYY-MM-DD или ISO 8601) |
| `network` | string | Фильтр по сети (ethereum, tron, bitcoin...) |
| `currency` | string | Фильтр по валюте (USDT, ETH, BTC...) |
| `limit` | number | Лимит записей (по умолчанию 50, макс 1000) |
| `offset` | number | Смещение для пагинации |
| `sort` | string | Поле сортировки (created_at, amount, usd_amount) |
| `order` | string | Направление сортировки (ASC или DESC) |

**Примеры:**

```bash
# Все инвойсы за последний месяц
curl "/api/invoices?date_from=2024-01-01&date_to=2024-01-31"

# Только подтверждённые платежи
curl "/api/invoices?status=confirmed"

# Ожидающие и оплаченные
curl "/api/invoices?status=pending,paid"

# Инвойсы конкретного пользователя
curl "/api/invoices?user_id=user-123"

# Инвойсы нескольких пользователей
curl "/api/invoices?user_ids=user-1,user-2,user-3"

# С пагинацией
curl "/api/invoices?limit=100&offset=200"
```

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "invoice_id": "abc-123",
      "merchant_order_id": "ORDER-xxx",
      "user_id": "user-123",
      "description": "Пополнение баланса",
      "network": "ethereum",
      "network_display_name": "Ethereum",
      "currency": "USDT",
      "amount": 100.0,
      "amount_to_pay": 100.007823,
      "amount_received": 100.007823,
      "fiat_currency": "USD",
      "fiat_amount": 100.0,
      "usd_amount": 100.0,
      "status": "confirmed",
      "created_at": "2024-01-20T12:00:00.000Z",
      "confirmed_at": "2024-01-20T12:10:00.000Z"
    }
  ],
  "stats": {
    "total_usd": 15000.00,
    "pending_count": 5,
    "confirmed_count": 120,
    "expired_count": 10
  },
  "pagination": {
    "total": 135,
    "limit": 50,
    "offset": 0
  }
}
```

---

### Статистика по инвойсам

```http
GET /api/invoices/stats
```

Принимает те же параметры что и `/api/invoices`.

**Ответ:**
```json
{
  "success": true,
  "data": {
    "total_usd": 15000.00,
    "pending_count": 5,
    "confirmed_count": 120,
    "expired_count": 10
  }
}
```

---

## 🔄 Два способа интеграции

### 1. API Integration (рекомендуется)

Пользователь остаётся на вашем сайте.

```javascript
// Фронтенд мерчанта
const response = await fetch('/api/payments/create-invoice', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'user-123',
    amount: 100,
    currency: 'USDT',
    network: 'ethereum',
    description: 'Пополнение баланса',
  }),
});

const { data } = await response.json();

// Показать модальное окно с QR-кодом
// ВАЖНО: используйте amount_to_pay, а не amount!
showPaymentModal({
  address: data.address,
  amountToPay: data.amount_to_pay,    // Уникальная сумма!
  paymentId: data.payment_id,          // ID платежа (memo/tag)
  currency: data.currency,
});

// Поллинг статуса
const interval = setInterval(async () => {
  const status = await fetch(`/api/payments/${data.id}/status`);
  const result = await status.json();
  
  if (result.data.status === 'confirmed') {
    clearInterval(interval);
    showSuccess('Оплата подтверждена!');
  }
}, 5000);
```

### 2. Hosted Checkout

Пользователь переходит на страницу шлюза.

```javascript
// Фронтенд мерчанта
// ВАЖНО: сумма указывается в ФИАТЕ!
const response = await fetch('/api/payments/checkout-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'user-123',
    fiat_amount: 1000,           // Сумма в фиате
    fiat_currency: 'USD',        // Валюта (USD, EUR...)
    currency: 'USDT',            // Крипта для оплаты
    network: 'tron',             // Сеть
    description: 'Пополнение баланса',
  }),
});

const { data } = await response.json();

// Редирект на платёжный шлюз
// Конвертация USD → USDT происходит автоматически на шлюзе!
window.location.href = data.checkout_url;
```

---

## 📨 Webhook обработка

### Настройка

Укажите webhook URL при создании мерчанта или сайта.

### Эндпоинт

```http
POST /webhook/payment
Content-Type: application/json
X-Signature: hmac-sha256-signature
X-Webhook-Event: payment.confirmed
```

### События

| Событие | Описание |
|---------|----------|
| `payment.received` | Платёж получен (не подтверждён) |
| `payment.confirmed` | Платёж полностью подтверждён ✅ |
| `invoice.expired` | Инвойс истёк |
| `invoice.cancelled` | Инвойс отменён |
| `payment.partial` | Частичная оплата |

### Пример payload

```json
{
  "event": "payment.confirmed",
  "invoice_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "merchant_order_id": "ORDER-1234567890-abc123",
  "user_id": "user-123",
  "status": "confirmed",
  "amount": 100,
  "amount_received": 100.007823,
  "currency": "USDT",
  "network": "ethereum",
  "usd_amount": 100.00,
  "fiat_amount": 9250.00,
  "fiat_currency": "USD",
  "transactions": [
    {
      "hash": "0xabc123...",
      "amount": 100.007823,
      "confirmations": 15
    }
  ],
  "timestamp": "2026-02-07T12:10:00.000Z"
}
```

> ⚠️ **Для обновления баланса используйте `usd_amount`**, а не `amount_received`!

### Проверка подписи

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
    
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

app.post('/webhook/payment', (req, res) => {
  const signature = req.headers['x-signature'];
  
  if (!verifyWebhookSignature(req.body, signature, WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Обработка платежа
  const { event, user_id, usd_amount } = req.body;
  
  if (event === 'payment.confirmed') {
    // Пополнить баланс пользователя В USD!
    // ВАЖНО: используйте usd_amount, а не amount_received
    await db.users.incrementBalance(user_id, parseFloat(usd_amount));
  }
  
  res.json({ received: true });
});
```

---

## 🔌 WebSocket подключение

### Когда использовать

- Для мгновенных уведомлений без поллинга
- Когда важна минимальная задержка

### Настройка

1. Получите WebSocket токен:

2. Добавьте в config.js:
   ```javascript
   websocketToken: 'ws_token_abc123...',
   enableWebSocket: true,
   ```

### Как работает

```javascript
const WebSocketClient = require('./websocketClient');

const wsClient = new WebSocketClient({
  url: 'wss://....m/ws/merchant',
  token: 'ws_token_abc123...',
  
  onNotification: (data) => {
    console.log('Payment notification:', data);
    
    if (data.event === 'payment.confirmed') {
      // Пополнить баланс
    }
  },
  
  onConnect: () => {
    console.log('Connected to payment gateway');
  },
  
  onDisconnect: (code, reason) => {
    console.log('Disconnected:', code, reason);
  },
});

wsClient.connect();
```

---

## 🧪 Тестирование

### 1. Запустить все сервисы

```bash
# Терминал 1: Бэкенд шлюза
cd kazik-back && npm run dev

# Терминал 2: Фронтенд шлюза
cd kazik-back/frontend && npm run dev

# Терминал 3: Сервер мерчанта
cd kazik-back/examples/merchant-server && npm run dev

# Терминал 4: Фронтенд мерчанта
cd kazik-back/examples/merchant-frontend && npm run dev
```

### 2. Проверить API

```bash
# Баланс пользователя
curl http://localhost:4000/api/users/user-123/balance

# Создать инвойс (API интеграция, сумма в КРИПТЕ)
curl -X POST http://localhost:4000/api/payments/create-invoice \
  -H "Content-Type: application/json" \
  -d '{"user_id":"user-123","amount":100,"currency":"USDT","network":"ethereum"}'

# Получить checkout URL (Hosted Checkout, сумма в ФИАТЕ!)
curl -X POST http://localhost:4000/api/payments/checkout-url \
  -H "Content-Type: application/json" \
  -d '{"user_id":"user-123","fiat_amount":1000,"fiat_currency":"USD","currency":"USDT","network":"tron"}'
```

### 3. Тест через браузер

Откройте **http://localhost:3001** (фронтенд мерчанта) и попробуйте обе кнопки оплаты.

### 4. Симуляция платежа

```bash
# В директории kazik-back
npm run simulate-payment -- --invoice-id <INVOICE_ID>
```

---

## 🔍 Идентификация платежей

Платёжный шлюз использует **несколько механизмов** для надёжной идентификации платежей:

### 1. Уникальная сумма (основной метод)

К каждому платежу добавляется случайная "соль" в дробной части:

```
Запрошено:    100.00 USDT
К оплате:     100.007823 USDT  ← последние цифры уникальны
                  ^^^^^^
```

При мониторинге блокчейна система находит платёж по точной сумме.

### 2. Уникальный ID платежа (резервный метод)

Генерируется код вида `PID-ABC12345`:

```
┌────────────────────────────────────────────┐
│ Уникальный ID платежа (memo/tag):          │
│                                            │
│         PID-ABC12345                       │
└────────────────────────────────────────────┘
```

Пользователь может добавить этот код как:
- **Memo** в Tron транзакции
- **Tag** в кошельках (если поддерживается)
- **Комментарий** к платежу

### 3. Fuzzy match (fallback)

Если первые два метода не сработали, система ищет:
- Сумму в пределах ±0.5% от ожидаемой
- На тот же адрес
- За время действия инвойса

### Приоритет поиска

| # | Метод | Точность | Когда работает |
|---|-------|----------|----------------|
| 1️⃣ | Exact Amount | 100% | Отправлена точная сумма |
| 2️⃣ | Payment ID | 100% | Указан memo/tag |
| 3️⃣ | Fuzzy Match | ~95% | Сумма близка к ожидаемой |

### Пример ответа API с идентификаторами

```json
{
  "invoice_id": "abc123...",
  "amount": 100.00,
  "amount_to_pay": 100.007823,
  "payment_id": "PID-ABC12345",
  "address": "0xABC..."
}
```

**Важно:** На странице оплаты пользователь видит:
- `amount_to_pay` — сумму которую нужно отправить
- `payment_id` — код для добавления в memo (опционально)

---

## 🔧 Troubleshooting

### Ошибка "X-Site-Key header is required"

- Убедитесь что `siteKey` указан в конфиге
- Проверьте что PaymentGateway инициализирован с `siteKey`
- X-Site-Key передаётся автоматически если указан в конфиге

### Ошибка "Invalid API key"

- Проверьте что `apiKey` в конфиге совпадает с ключом мерчанта
- Убедитесь что мерчант активен

### Ошибка "Invalid signature"

- Проверьте что `webhookSecret` правильный
- Не модифицируйте тело запроса перед проверкой подписи

### Ошибка "Network/currency not supported"

- Запросите `GET /api/v1/networks` чтобы увидеть доступные комбинации
- Убедитесь что сеть и валюта написаны правильно (регистр важен)

### WebSocket не подключается

- Проверьте что `websocketToken` валидный
- Убедитесь что IP сервера в whitelist

---
