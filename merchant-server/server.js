/**
 * Example Merchant Server
 * 
 * Этот сервер демонстрирует интеграцию с платежным шлюзом:
 * 1. API для фронтенда (создание инвойсов, проверка статуса)
 * 2. Обработка webhook уведомлений
 * 3. WebSocket подключение для real-time уведомлений
 */

let config;
try {
  config = require('./config');
} catch (e) {
  require('dotenv').config();
  config = {
    port: process.env.PORT || 4000,
    paymentGatewayUrl: process.env.PAYMENT_GATEWAY_URL || 'http://localhost:3000',
    apiKey: process.env.PAYMENT_GATEWAY_API_KEY,
    webhookSecret: process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET,
    siteKey: process.env.PAYMENT_GATEWAY_SITE_KEY,
    websocketToken: process.env.PAYMENT_GATEWAY_WS_TOKEN,
    enableWebSocket: !!process.env.PAYMENT_GATEWAY_WS_TOKEN,
  };
}

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const PaymentGateway = require('./paymentGateway');
const WebSocketClient = require('./websocketClient');

const app = express();
const PORT = config.port;

// Инициализация клиента платежного шлюза
const paymentGateway = new PaymentGateway({
  baseUrl: config.paymentGatewayUrl,
  apiKey: config.apiKey,
  webhookSecret: config.webhookSecret,
  siteKey: config.siteKey,
});

// WebSocket клиент для real-time уведомлений (опционально)
let wsClient = null;
if (config.enableWebSocket && config.websocketToken) {
  wsClient = new WebSocketClient({
    url: config.paymentGatewayUrl.replace('http', 'ws') + '/ws/merchant',
    token: config.websocketToken,
    onNotification: handlePaymentNotification,
  });
}

// Middleware
app.use(cors());
app.use(express.json());

// Простое хранилище платежей в памяти (в реальном проекте используйте БД)
const payments = new Map();         // order_id -> payment
const invoiceToOrder = new Map();   // invoice_id -> order_id
const userBalances = new Map();

// ═══════════════════════════════════════════════════════════════
// API ИНТЕГРАЦИЯ (пользователь остается на сайте мерчанта)
// ═══════════════════════════════════════════════════════════════

/**
 * Создание платежа через API
 * POST /api/payments/create-invoice
 * 
 * Фронтенд мерчанта вызывает этот эндпоинт,
 * сервер мерчанта создает инвойс в платежном шлюзе,
 * возвращает адрес и данные для оплаты.
 */
app.post('/api/payments/create-invoice', async (req, res) => {
  try {
    const { user_id, amount, currency, network, description } = req.body;

    // Валидация
    if (!user_id || !amount || !currency || !network) {
      return res.status(400).json({
        success: false,
        error: 'user_id, amount, currency, and network are required',
      });
    }

    // Генерируем уникальный order_id
    const orderId = `ORDER-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    console.log(`\n📤 [API] Creating invoice for user ${user_id}...`);
    console.log(`   Amount: ${amount} ${currency} on ${network}`);

    // Создаем инвойс через платежный шлюз
    const invoice = await paymentGateway.createInvoice({
      amount: parseFloat(amount),
      currency,
      network,
      order_id: orderId,
      description: description || `Deposit for user ${user_id}`,
      metadata: { user_id },
    });

    // Сохраняем платеж локально
    const payment = {
      order_id: orderId,
      user_id,
      invoice_id: invoice.invoice_id,
      address: invoice.address,
      amount: parseFloat(amount),
      amount_to_pay: invoice.amount_to_pay, // Уникальная сумма для оплаты
      payment_id: invoice.payment_id,       // Уникальный ID платежа
      currency,
      network,
      networkDisplayName: invoice.network_display_name || network,
      status: 'pending',
      timeRemaining: 3600,
      created_at: new Date(),
    };

    payments.set(orderId, payment);
    invoiceToOrder.set(invoice.invoice_id, orderId);

    console.log(`✅ [API] Invoice created: ${invoice.invoice_id}`);
    console.log(`   Address: ${invoice.address}`);
    console.log(`   Amount to pay: ${invoice.amount_to_pay} ${currency}`);
    console.log(`   Payment ID: ${invoice.payment_id}`);

    // Возвращаем данные для модального окна
    res.json({
      success: true,
      data: {
        id: invoice.invoice_id,
        order_id: orderId,
        address: invoice.address,
        amount: invoice.amount,              // Запрошенная сумма
        amount_to_pay: invoice.amount_to_pay, // Уникальная сумма для оплаты!
        payment_id: invoice.payment_id,       // Уникальный ID платежа
        currency: invoice.currency,
        network: invoice.network,
        networkDisplayName: invoice.network_display_name || network,
        status: 'pending',
        timeRemaining: 3600,
        expires_at: invoice.expires_at,
      },
    });

  } catch (error) {
    console.error('❌ [API] Error creating invoice:', error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to create payment',
    });
  }
});

// Алиас для совместимости
app.post('/api/payments/create', (req, res, next) => {
  req.url = '/api/payments/create-invoice';
  app.handle(req, res, next);
});

/**
 * Проверка статуса платежа по invoice_id
 * GET /api/payments/:invoiceId/status
 */
app.get('/api/payments/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Ищем по invoice_id или order_id
    let payment;
    let invoiceId = id;
    
    if (invoiceToOrder.has(id)) {
      // Это invoice_id
      const orderId = invoiceToOrder.get(id);
      payment = payments.get(orderId);
    } else if (payments.has(id)) {
      // Это order_id
      payment = payments.get(id);
      invoiceId = payment.invoice_id;
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    // Получаем актуальный статус из платежного шлюза
    const invoiceStatus = await paymentGateway.getInvoiceStatus(invoiceId);

    // Обновляем локальный статус
    payment.status = invoiceStatus.status;
    payment.amount_received = invoiceStatus.amount_received;
    payment.transactions = invoiceStatus.transactions;

    console.log(`📊 [Status] ${payment.order_id}: ${payment.status}`);

    res.json({
      success: true,
      data: {
        id: invoiceId,
        order_id: payment.order_id,
        status: payment.status,
        amount: payment.amount,
        amount_received: payment.amount_received || 0,
        currency: payment.currency,
        network: payment.network,
        address: payment.address,
        transactions: payment.transactions || [],
      },
    });

  } catch (error) {
    console.error('❌ [Status] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to check payment status',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// HOSTED CHECKOUT (редирект на платежный шлюз)
// ═══════════════════════════════════════════════════════════════

/**
 * Генерация URL для редиректа на hosted checkout
 * POST /api/payments/checkout-url
 * 
 * Фронтенд мерчанта вызывает этот эндпоинт,
 * получает URL и делает редирект пользователя
 * на страницу оплаты платежного шлюза.
 * 
 * ВАЖНО: Конвертация фиат → крипта происходит на стороне платёжного шлюза!
 * Мерчант передаёт только фиатную сумму и желаемую криптовалюту.
 */
app.post('/api/payments/checkout-url', (req, res) => {
  try {
    const { user_id, fiat_amount, fiat_currency, currency, network, description } = req.body;

    // Валидация обязательных полей
    if (!user_id || !fiat_amount || !fiat_currency || !currency || !network) {
      return res.status(400).json({
        success: false,
        error: 'user_id, fiat_amount, fiat_currency, currency, and network are required',
      });
    }

    const orderId = `ORDER-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    console.log(`\n🔗 [HOSTED] Creating checkout URL for user ${user_id}...`);
    console.log(`   Fiat amount: ${fiat_amount} ${fiat_currency}`);
    console.log(`   Pay with: ${currency} on ${network}`);

    // Сохраняем платеж локально (инвойс создастся на стороне шлюза)
    // Конвертация в крипту происходит на стороне платёжного шлюза
    payments.set(orderId, {
      order_id: orderId,
      user_id,
      fiat_amount: parseFloat(fiat_amount),
      fiat_currency,
      currency,
      network,
      status: 'pending',
      created_at: new Date(),
    });

    // Генерируем подписанный URL для hosted checkout
    // Платёжный шлюз сам конвертирует фиат в крипту по текущему курсу
    const checkoutUrl = paymentGateway.createCheckoutUrl({
      fiat_amount: parseFloat(fiat_amount),
      fiat_currency,
      currency,
      network,
      order_id: orderId,
      user_id,
      description,
    });

    console.log(`✅ [HOSTED] Checkout URL created`);
    console.log(`   URL: ${checkoutUrl}`);

    res.json({
      success: true,
      data: {
        order_id: orderId,
        checkout_url: checkoutUrl,
      },
    });

  } catch (error) {
    console.error('❌ [HOSTED] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create checkout URL',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// ПОЛЬЗОВАТЕЛИ И БАЛАНС
// Общая сумма успешных пополнений получается с платёжного шлюза, а не локально!
// ═══════════════════════════════════════════════════════════════

/**
 * Получение общей суммы успешных пополнений пользователя
 * GET /api/users/:userId/balance
 * 
 * Общая сумма успешных пополнений рассчитывается на стороне платёжного шлюза как сумма
 * всех confirmed платежей в USD для данного user_id
 */
app.get('/api/users/:userId/balance', async (req, res) => {
  const { userId } = req.params;

  try {
    // Получаем баланс с платёжного шлюза
    const balanceData = await paymentGateway.getUserBalance(userId);
    
    console.log(`💰 [Balance] User ${userId}: $${balanceData.balance.toFixed(2)} USD (${balanceData.total_payments} payments)`);

    res.json({
      success: true,
      data: {
        user_id: userId,
        balance: balanceData.balance,
        currency: balanceData.currency,
        total_payments: balanceData.total_payments,
      },
    });
  } catch (error) {
    console.error(`❌ [Balance] Error for user ${userId}:`, error.message);
    
    // Фоллбэк на локальный баланс если шлюз недоступен
    const localBalance = userBalances.get(userId) || 0;
    res.json({
      success: true,
      data: {
        user_id: userId,
        balance: localBalance,
        currency: 'USD',
        source: 'local_fallback',
      },
    });
  }
});

/**
 * Получение истории платежей пользователя
 * GET /api/users/:userId/payments
 */
app.get('/api/users/:userId/payments', async (req, res) => {
  const { userId } = req.params;

  try {
    // Получаем историю с платёжного шлюза
    const paymentsData = await paymentGateway.getUserPayments(userId);
    
    res.json({
      success: true,
      data: paymentsData,
    });
  } catch (error) {
    console.error(`❌ [Payments] Error for user ${userId}:`, error.message);
    
    // Фоллбэк на локальную историю
    const userPayments = [];
    payments.forEach(payment => {
      if (payment.user_id === userId) {
        userPayments.push(payment);
      }
    });

    res.json({
      success: true,
      data: {
        user_id: userId,
        payments: userPayments.sort((a, b) => b.created_at - a.created_at),
        source: 'local_fallback',
      },
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// ИНВОЙСЫ (данные с платежного шлюза)
// ═══════════════════════════════════════════════════════════════

/**
 * Получение списка инвойсов с фильтрами
 * GET /api/invoices
 * 
 * Query params:
 * - status: pending,paid,confirmed,expired,failed (можно несколько)
 * - user_id: ID пользователя
 * - user_ids: список ID пользователей через запятую
 * - date_from: начало периода (YYYY-MM-DD)
 * - date_to: конец периода (YYYY-MM-DD)
 * - limit: количество записей
 * - offset: смещение
 */
app.get('/api/invoices', async (req, res) => {
  try {
    console.log('📋 [Invoices] Fetching invoices with params:', req.query);
    const result = await paymentGateway.getInvoices(req.query);
    console.log(`✅ [Invoices] Got ${result.data?.length || 0} invoices`);
    res.json(result);
  } catch (error) {
    console.error('❌ [Invoices] Error:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', JSON.stringify(error.response.data));
    }
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to get invoices',
    });
  }
});

/**
 * Получение статистики по инвойсам
 * GET /api/invoices/stats
 */
app.get('/api/invoices/stats', async (req, res) => {
  try {
    const stats = await paymentGateway.getInvoiceStats(req.query);
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('❌ [Stats] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to get stats',
    });
  }
});

/**
 * Получение полных данных инвойса
 * GET /api/invoices/:id
 */
app.get('/api/invoices/:id', async (req, res) => {
  try {
    console.log(`📋 [Invoice] Fetching invoice ${req.params.id}...`);
    const result = await paymentGateway.getInvoice(req.params.id);
    console.log(`✅ [Invoice] Got invoice ${req.params.id}`);
    res.json(result);
  } catch (error) {
    console.error('❌ [Invoice] Error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to get invoice',
    });
  }
});

/**
 * Отмена инвойса
 * POST /api/invoices/:id/cancel
 */
app.post('/api/invoices/:id/cancel', async (req, res) => {
  try {
    console.log(`🚫 [Invoice] Cancelling invoice ${req.params.id}...`);
    const result = await paymentGateway.cancelInvoice(req.params.id);
    
    // Обновляем локальный статус если есть
    const orderId = invoiceToOrder.get(req.params.id);
    if (orderId) {
      const payment = payments.get(orderId);
      if (payment) {
        payment.status = 'cancelled';
        payment.updated_at = new Date();
      }
    }
    
    console.log(`✅ [Invoice] Cancelled invoice ${req.params.id}`);
    res.json(result);
  } catch (error) {
    console.error('❌ [Invoice] Cancel error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to cancel invoice',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// WEBHOOK ОБРАБОТЧИК
// ═══════════════════════════════════════════════════════════════

/**
 * Обработка webhook от платежного шлюза
 * POST /webhook/payment
 */
app.post('/webhook/payment', (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const event = req.headers['x-webhook-event'];
    
    // Проверяем подпись
    if (!paymentGateway.verifyWebhookSignature(req.body, signature)) {
      console.error('❌ [Webhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log(`\n📨 [Webhook] Event: ${event}`);
    
    // Обрабатываем уведомление
    handlePaymentNotification(req.body);

    // Важно: возвращаем 200 OK быстро
    res.json({ received: true });

  } catch (error) {
    console.error('❌ [Webhook] Error:', error.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// ЛОГИКА ОБРАБОТКИ ПЛАТЕЖЕЙ
// ═══════════════════════════════════════════════════════════════

/**
 * Обработка уведомления о платеже (webhook или websocket)
 * 
 * ВАЖНО: Баланс хранится в USD!
 * При пополнении используем usd_amount из webhook.
 */
function handlePaymentNotification(data) {
  const { 
    event, 
    invoice_id, 
    merchant_order_id, 
    user_id,
    status, 
    amount_received, 
    currency,
    usd_amount,         // USD эквивалент суммы
    fiat_amount,        // Оригинальная фиатная сумма
    fiat_currency,      // Код фиатной валюты
    metadata
  } = data;
  
  console.log(`\n📬 [Notification] Event: ${event}`);
  console.log(`   Order: ${merchant_order_id}, Status: ${status}`);
  console.log(`   Amount received: ${amount_received} ${currency}`);
  console.log(`   USD amount: ${usd_amount || 'N/A'}`);

  // Находим платеж по order_id
  const payment = payments.get(merchant_order_id);
  
  if (!payment) {
    console.warn(`⚠️  [Notification] Payment not found: ${merchant_order_id}`);
    return;
  }

  // Определяем user_id (из платежа или из данных webhook)
  const userId = payment.user_id || user_id || metadata?.user_id;

  // Обновляем статус платежа
  payment.status = status;
  payment.invoice_id = invoice_id;
  payment.amount_received = amount_received;
  payment.usd_amount = usd_amount;
  payment.updated_at = new Date();

  // Связываем invoice_id с order_id
  if (invoice_id) {
    invoiceToOrder.set(invoice_id, merchant_order_id);
  }

  // Если платеж подтвержден - пополняем баланс пользователя В USD
  if (event === 'payment.confirmed') {
    // Используем usd_amount если есть, иначе amount_received 
    // (для обратной совместимости)
    const amountToAdd = usd_amount ? parseFloat(usd_amount) : parseFloat(amount_received);
    const currentBalance = userBalances.get(userId) || 0;
    const newBalance = currentBalance + amountToAdd;
    userBalances.set(userId, newBalance);

    console.log(`\n💰 [Balance Updated - USD]`);
    console.log(`   User: ${userId}`);
    console.log(`   Received: ${amount_received} ${currency}`);
    console.log(`   USD equivalent: $${amountToAdd.toFixed(2)}`);
    console.log(`   Balance: $${currentBalance.toFixed(2)} + $${amountToAdd.toFixed(2)} = $${newBalance.toFixed(2)}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// ЗАПУСК СЕРВЕРА
// ═══════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           🏪 MERCHANT SERVER - Example Integration            ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                     ║
╠═══════════════════════════════════════════════════════════════╣
║  📋 API Endpoints:                                            ║
║                                                               ║
║  API Integration (user stays on merchant site):               ║
║  ├─ POST /api/payments/create-invoice                         ║
║  └─ GET  /api/payments/:id/status                             ║
║                                                               ║
║  Hosted Checkout (redirect to payment gateway):               ║
║  └─ POST /api/payments/checkout-url                           ║
║                                                               ║
║  User:                                                        ║
║  ├─ GET  /api/users/:userId/balance                           ║
║  └─ GET  /api/users/:userId/payments                          ║
║                                                               ║
║  Webhook:                                                     ║
║  └─ POST /webhook/payment                                     ║
╠═══════════════════════════════════════════════════════════════╣
║  🔧 Config:                                                   ║
║  ├─ Payment Gateway: ${config.paymentGatewayUrl.padEnd(36)}║
║  ├─ API Key: ${(config.apiKey ? '✓ configured' : '✗ missing').padEnd(43)}║
║  ├─ Site Key: ${(config.siteKey ? '✓ configured' : '✗ missing').padEnd(42)}║
║  └─ WebSocket: ${(config.enableWebSocket ? '✓ enabled' : '✗ disabled').padEnd(41)}║
╚═══════════════════════════════════════════════════════════════╝
`);
  
  if (wsClient) {
    wsClient.connect();
  }
});

module.exports = app;
