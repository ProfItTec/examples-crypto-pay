/**
 * Payment Gateway Client
 * 
 * Клиент для работы с API платежного шлюза
 */

const axios = require('axios');
const crypto = require('crypto');

class PaymentGateway {
  constructor(options) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.webhookSecret = options.webhookSecret;
    this.siteKey = options.siteKey;
    this.timeout = options.timeout || 30000;

    // ВАЖНО: X-Site-Key обязателен для API интеграции!
    // Каждый сайт мерчанта имеет свой уникальный site_key
    if (!this.siteKey) {
      console.warn('⚠️ PaymentGateway: siteKey не указан! API запросы не будут работать.');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,       // API ключ мерчанта (для идентификации)
        'X-Site-Key': this.siteKey,     // Ключ сайта (обязательно для API!)
      },
    });
  }

  /**
   * Создание инвойса через API
   */
  async createInvoice(params) {
    const { amount, currency, network, order_id, description, metadata, callback_url, expires_in } = params;

    const response = await this.client.post('/api/v1/invoices', {
      amount,
      currency,
      network,
      merchant_order_id: order_id,
      description,
      metadata,
      callback_url,
      expires_in,
    });

    return response.data.data;
  }

  /**
   * Получение статуса инвойса
   */
  async getInvoiceStatus(invoiceId) {
    const response = await this.client.get(`/api/v1/invoices/${invoiceId}`);
    return response.data.data;
  }

  /**
   * Получение списка инвойсов
   */
  async listInvoices(params = {}) {
    const response = await this.client.get('/api/v1/invoices', { params });
    return response.data.data;
  }

  /**
   * Получение поддерживаемых сетей и валют
   */
  async getSupportedNetworks() {
    const response = await this.client.get('/api/v1/networks');
    return response.data.data;
  }

  /**
   * Проверка подписи webhook
   */
  verifyWebhookSignature(payload, signature) {
    if (!signature || !this.webhookSecret) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    // Безопасное сравнение для защиты от timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Создание URL для hosted checkout (редирект)
   * 
   * ВАЖНО: Конвертация фиат → крипта происходит на стороне платёжного шлюза!
   * Мерчант передаёт только фиатную сумму и желаемую криптовалюту.
   * 
   * @param {Object} params
   * @param {string} params.user_id - ID пользователя (required)
   * @param {number} params.fiat_amount - Сумма в фиатной валюте (required)
   * @param {string} params.fiat_currency - Фиатная валюта: USD, EUR, RUB, UAH, AMD, UZS, KZT, GEL, AZN, INR (required)
   * @param {string} params.currency - Криптовалюта для оплаты: BTC, ETH, USDT и т.д. (required)
   * @param {string} params.network - Сеть: bitcoin, ethereum, bsc, tron и т.д. (required)
   * @param {string} [params.order_id] - ID заказа мерчанта
   * @param {string} [params.description] - Назначение платежа (опционально)
   */
  createCheckoutUrl(params) {
    const { user_id, fiat_amount, fiat_currency, currency, network, order_id, description } = params;

    if (!user_id) {
      throw new Error('user_id is required for checkout URL');
    }

    // Создаем подпись: site_key:user_id:fiat_amount:fiat_currency:currency:network:order_id
    const signData = `${this.siteKey}:${user_id}:${fiat_amount}:${fiat_currency}:${currency}:${network}:${order_id || ''}`;
    const signature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signData)
      .digest('hex');

    // Формируем URL
    const urlParams = new URLSearchParams({
      site_key: this.siteKey,
      user_id,
      fiat_amount: fiat_amount.toString(),
      fiat_currency,
      currency,
      network,
      signature,
    });

    if (order_id) urlParams.set('order_id', order_id);
    if (description) urlParams.set('description', description);

    return `${this.baseUrl}/checkout/pay?${urlParams.toString()}`;
  }

  /**
   * Получение всех удачных пополнений пользователя в USD
   * Общая сумма успешных пополнений рассчитывается на стороне платёжного шлюза как сумма 
   * всех подтверждённых платежей для данного user_id
   * 
   * @param {string} userId - ID пользователя
   * @returns {Promise<{balance: number, currency: string, total_payments: number}>}
   */
  async getUserBalance(userId) {
    const response = await this.client.get(`/api/v1/users/${userId}/balance`);
    return response.data.data;
  }

  /**
   * Получение истории платежей пользователя
   * 
   * @param {string} userId - ID пользователя
   * @param {Object} [params] - Параметры запроса
   * @param {string} [params.status] - Фильтр по статусу
   * @param {number} [params.limit] - Лимит записей
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<Array>}
   */
  async getUserPayments(userId, params = {}) {
    const response = await this.client.get(`/api/v1/users/${userId}/payments`, { params });
    return response.data.data;
  }

  /**
   * Получение списка инвойсов с фильтрами
   * 
   * @param {Object} [params] - Параметры запроса
   * @param {string} [params.status] - Фильтр по статусу (pending,paid,confirmed,expired,failed)
   * @param {string} [params.network] - Фильтр по сети
   * @param {string} [params.currency] - Фильтр по валюте
   * @param {string} [params.user_id] - Фильтр по ID пользователя
   * @param {string} [params.user_ids] - Список ID пользователей через запятую
   * @param {string} [params.date_from] - Начало периода (YYYY-MM-DD или ISO 8601)
   * @param {string} [params.date_to] - Конец периода (YYYY-MM-DD или ISO 8601)
   * @param {number} [params.limit] - Лимит записей (макс 1000)
   * @param {number} [params.offset] - Смещение
   * @param {string} [params.sort] - Поле сортировки
   * @param {string} [params.order] - ASC или DESC
   * @returns {Promise<{data: Array, stats: Object, pagination: Object}>}
   */
  async getInvoices(params = {}) {
    const response = await this.client.get('/api/v1/invoices', { params });
    return response.data;
  }

  /**
   * Получение статистики по инвойсам
   * 
   * @param {Object} [params] - Параметры (те же что и getInvoices)
   * @returns {Promise<{total_usd: number, pending_count: number, confirmed_count: number, expired_count: number}>}
   */
  async getInvoiceStats(params = {}) {
    const response = await this.client.get('/api/v1/invoices', { 
      params: { ...params, limit: 1 } 
    });
    return response.data.stats;
  }

  /**
   * Отмена инвойса
   * Можно отменить только инвойсы со статусом 'pending'
   * 
   * @param {string} invoiceId - ID инвойса
   * @returns {Promise<{invoice_id: string, status: string, cancelled_at: string}>}
   */
  async cancelInvoice(invoiceId) {
    const response = await this.client.post(`/api/v1/invoices/${invoiceId}/cancel`);
    return response.data;
  }

  /**
   * Получение полных данных инвойса
   * 
   * @param {string} invoiceId - ID инвойса
   * @returns {Promise<Object>}
   */
  async getInvoice(invoiceId) {
    const response = await this.client.get(`/api/v1/invoices/${invoiceId}`);
    return response.data;
  }

  /**
   * Создание HMAC подписи для запроса (если требуется)
   */
  createRequestSignature(payload) {
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}

module.exports = PaymentGateway;
