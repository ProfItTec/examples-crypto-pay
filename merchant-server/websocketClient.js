/**
 * WebSocket Client for Payment Gateway
 * 
 * Клиент для real-time уведомлений о платежах
 */

const WebSocket = require('ws');

class WebSocketClient {
  constructor(options) {
    this.url = options.url;
    this.token = options.token;
    this.onNotification = options.onNotification || (() => {});
    this.onConnect = options.onConnect || (() => {});
    this.onDisconnect = options.onDisconnect || (() => {});
    
    this.ws = null;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.pingInterval = options.pingInterval || 30000;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.isConnecting = false;
    this.shouldReconnect = true;
  }

  /**
   * Подключение к WebSocket серверу
   */
  connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    const wsUrl = `${this.url}?token=${this.token}`;
    console.log('[WebSocket] Connecting to:', this.url);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      this.isConnecting = false;
      console.log('[WebSocket] Connected');
      this.onConnect();
      this.startPing();

      // Подписываемся на все события
      this.send({
        type: 'subscribe',
        events: ['all'],
      });
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('close', (code, reason) => {
      this.isConnecting = false;
      console.log(`[WebSocket] Disconnected: ${code} - ${reason}`);
      this.stopPing();
      this.onDisconnect(code, reason);

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error.message);
    });

    this.ws.on('pong', () => {
    });
  }

  /**
   * Отключение от сервера
   */
  disconnect() {
    this.shouldReconnect = false;
    this.stopPing();
    clearTimeout(this.reconnectTimer);

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  /**
   * Обработка входящего сообщения
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'connected':
          console.log(`[WebSocket] Connection established: ${message.connection_id}`);
          break;

        case 'subscribed':
          console.log('[WebSocket] Subscribed to events:', message.events);
          break;

        case 'pong':
          break;

        case 'notification':
          console.log(`[WebSocket] Notification: ${message.event}`);
          this.onNotification(message.data);
          break;

        case 'invoice_status':
          console.log(`[WebSocket] Invoice status: ${message.invoice.status}`);
          break;

        case 'error':
          console.error('[WebSocket] Server error:', message.message);
          break;

        default:
          console.log('[WebSocket] Unknown message type:', message.type);
      }

    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error.message);
    }
  }

  /**
   * Отправка сообщения
   */
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Запрос статуса инвойса
   */
  getInvoiceStatus(invoiceId) {
    this.send({
      type: 'get_status',
      invoice_id: invoiceId,
    });
  }

  /**
   * Запуск периодического ping
   */
  startPing() {
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, this.pingInterval);
  }

  /**
   * Остановка ping
   */
  stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Планирование переподключения
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    console.log(`[WebSocket] Reconnecting in ${this.reconnectInterval / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * Проверка состояния подключения
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

module.exports = WebSocketClient;
