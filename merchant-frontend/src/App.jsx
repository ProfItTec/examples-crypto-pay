import { useState, useEffect } from 'react';

const CONFIG = {
  MERCHANT_SERVER: import.meta.env.VITE_MERCHANT_SERVER || '',
  USER_ID: 'user-123',
};

// ═══════════════════════════════════════════════════════════════
// СТРАНИЦА ИНВОЙСОВ (АДМИНКА)
// ═══════════════════════════════════════════════════════════════

function InvoicesPage({ onBack }) {
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceDetails, setInvoiceDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  // Фильтры
  const [filters, setFilters] = useState({
    status: '',
    user_id: '',
    date_from: '',
    date_to: '',
  });
  const [pagination, setPagination] = useState({ total: 0, limit: 20, offset: 0 });

  const loadInvoices = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.user_id) params.set('user_id', filters.user_id);
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);
      params.set('limit', pagination.limit);
      params.set('offset', pagination.offset);

      const res = await fetch(`${CONFIG.MERCHANT_SERVER}/api/invoices?${params}`);
      const data = await res.json();

      if (data.success) {
        setInvoices(data.data || []);
        setStats(data.stats || null);
        setPagination(prev => ({ ...prev, total: data.pagination?.total || 0 }));
      } else {
        setError(data.error || 'Failed to load invoices');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [filters, pagination.offset]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return '#22c55e';
      case 'paid': return '#3b82f6';
      case 'pending': return '#fbbf24';
      case 'expired': return '#6b7280';
      case 'failed': return '#ef4444';
      case 'cancelled': return '#f97316';
      default: return '#9ca3af';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'confirmed': return '✓ Подтверждён';
      case 'paid': return '⏳ Оплачен';
      case 'pending': return '⏳ Ожидание';
      case 'expired': return '✕ Истёк';
      case 'failed': return '✕ Ошибка';
      case 'cancelled': return '⊘ Отменён';
      default: return status;
    }
  };

  const loadInvoiceDetails = async (invoiceId) => {
    setLoadingDetails(true);
    try {
      const res = await fetch(`${CONFIG.MERCHANT_SERVER}/api/invoices/${invoiceId}`);
      const data = await res.json();
      if (data.success) {
        setInvoiceDetails(data.data);
        setSelectedInvoice(invoiceId);
      } else {
        alert('Ошибка загрузки: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Ошибка: ' + err.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCancelInvoice = async (invoiceId) => {
    if (!confirm('Вы уверены, что хотите отменить этот платёж?')) return;
    
    try {
      const res = await fetch(`${CONFIG.MERCHANT_SERVER}/api/invoices/${invoiceId}/cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        alert('Платёж отменён');
        setSelectedInvoice(null);
        setInvoiceDetails(null);
        loadInvoices(); // Reload list
      } else {
        alert('Ошибка: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div style={invoiceStyles.container}>
      {/* Header */}
      <div style={invoiceStyles.header}>
        <button onClick={onBack} style={invoiceStyles.backBtn}>← Назад</button>
        <h1 style={invoiceStyles.title}>📋 Все инвойсы</h1>
      </div>

      {/* Stats */}
      {stats && (
        <div style={invoiceStyles.statsRow}>
          <div style={invoiceStyles.statCard}>
            <span style={invoiceStyles.statValue}>${stats.total_usd?.toFixed(2) || '0.00'}</span>
            <span style={invoiceStyles.statLabel}>Всего USD</span>
          </div>
          <div style={{ ...invoiceStyles.statCard, borderColor: '#22c55e40' }}>
            <span style={{ ...invoiceStyles.statValue, color: '#22c55e' }}>{stats.confirmed_count || 0}</span>
            <span style={invoiceStyles.statLabel}>Подтверждено</span>
          </div>
          <div style={{ ...invoiceStyles.statCard, borderColor: '#fbbf2440' }}>
            <span style={{ ...invoiceStyles.statValue, color: '#fbbf24' }}>{stats.pending_count || 0}</span>
            <span style={invoiceStyles.statLabel}>Ожидание</span>
          </div>
          <div style={{ ...invoiceStyles.statCard, borderColor: '#6b728040' }}>
            <span style={{ ...invoiceStyles.statValue, color: '#6b7280' }}>{stats.expired_count || 0}</span>
            <span style={invoiceStyles.statLabel}>Истекло</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={invoiceStyles.filters}>
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          style={invoiceStyles.filterSelect}
        >
          <option value="">Все статусы</option>
          <option value="pending">⏳ Ожидание</option>
          <option value="paid">💰 Оплачен</option>
          <option value="confirmed">✓ Подтверждён</option>
          <option value="expired">✕ Истёк</option>
          <option value="failed">✕ Ошибка</option>
          <option value="cancelled">⊘ Отменён</option>
        </select>

        <input
          type="text"
          placeholder="User ID"
          value={filters.user_id}
          onChange={(e) => handleFilterChange('user_id', e.target.value)}
          style={invoiceStyles.filterInput}
        />

        <input
          type="date"
          value={filters.date_from}
          onChange={(e) => handleFilterChange('date_from', e.target.value)}
          style={invoiceStyles.filterInput}
        />

        <input
          type="date"
          value={filters.date_to}
          onChange={(e) => handleFilterChange('date_to', e.target.value)}
          style={invoiceStyles.filterInput}
        />

        <button onClick={loadInvoices} style={invoiceStyles.refreshBtn}>🔄 Обновить</button>
      </div>

      {/* Error */}
      {error && <div style={invoiceStyles.error}>{error}</div>}

      {/* Loading */}
      {loading && <div style={invoiceStyles.loading}>Загрузка...</div>}

      {/* Table */}
      {!loading && invoices.length > 0 && (
        <div style={invoiceStyles.tableWrapper}>
          <table style={invoiceStyles.table}>
            <thead>
              <tr>
                <th style={invoiceStyles.th}>ID / Order</th>
                <th style={invoiceStyles.th}>Пользователь</th>
                <th style={invoiceStyles.th}>Сумма</th>
                <th style={invoiceStyles.th}>USD</th>
                <th style={invoiceStyles.th}>Статус</th>
                <th style={invoiceStyles.th}>Создан</th>
                <th style={invoiceStyles.th}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.invoice_id} style={invoiceStyles.tr}>
                  <td style={invoiceStyles.td}>
                    <div style={invoiceStyles.invoiceId}>{inv.invoice_id?.slice(0, 8)}...</div>
                    {inv.merchant_order_id && (
                      <div style={invoiceStyles.orderId}>{inv.merchant_order_id}</div>
                    )}
                  </td>
                  <td style={invoiceStyles.td}>
                    <span style={invoiceStyles.userId}>{inv.user_id || '-'}</span>
                  </td>
                  <td style={invoiceStyles.td}>
                    <div style={invoiceStyles.amount}>{inv.amount_to_pay || inv.amount} {inv.currency}</div>
                    <div style={invoiceStyles.network}>{inv.network_display_name || inv.network}</div>
                  </td>
                  <td style={invoiceStyles.td}>
                    <span style={invoiceStyles.usdAmount}>
                      {inv.usd_amount ? `$${inv.usd_amount.toFixed(2)}` : '-'}
                    </span>
                  </td>
                  <td style={invoiceStyles.td}>
                    <span style={{ 
                      ...invoiceStyles.statusBadge, 
                      backgroundColor: getStatusColor(inv.status) + '20',
                      color: getStatusColor(inv.status),
                    }}>
                      {getStatusLabel(inv.status)}
                    </span>
                  </td>
                  <td style={invoiceStyles.td}>
                    <div style={invoiceStyles.date}>{formatDate(inv.created_at)}</div>
                    {inv.confirmed_at && (
                      <div style={invoiceStyles.confirmedAt}>✓ {formatDate(inv.confirmed_at)}</div>
                    )}
                  </td>
                  <td style={invoiceStyles.td}>
                    <button
                      onClick={() => loadInvoiceDetails(inv.invoice_id)}
                      style={invoiceStyles.detailsBtn}
                      disabled={loadingDetails}
                    >
                      {loadingDetails ? '...' : '🔍 Подробно'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && invoices.length === 0 && (
        <div style={invoiceStyles.empty}>Нет инвойсов по заданным фильтрам</div>
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div style={invoiceStyles.pagination}>
          <button
            onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
            disabled={pagination.offset === 0}
            style={invoiceStyles.pageBtn}
          >
            ← Назад
          </button>
          <span style={invoiceStyles.pageInfo}>
            {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} из {pagination.total}
          </span>
          <button
            onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
            disabled={pagination.offset + pagination.limit >= pagination.total}
            style={invoiceStyles.pageBtn}
          >
            Вперёд →
          </button>
        </div>
      )}

      {/* Invoice Details Modal */}
      {selectedInvoice && invoiceDetails && (
        <InvoiceDetailsModal
          invoice={invoiceDetails}
          onClose={() => { setSelectedInvoice(null); setInvoiceDetails(null); }}
          onCancel={handleCancelInvoice}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
          formatDate={formatDate}
        />
      )}
    </div>
  );
}

// Модальное окно с деталями инвойса
function InvoiceDetailsModal({ invoice, onClose, onCancel, getStatusColor, getStatusLabel, formatDate }) {
  const canCancel = invoice.status === 'pending';

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Скопировано!');
  };

  return (
    <div style={modalDetailStyles.overlay} onClick={onClose}>
      <div style={modalDetailStyles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={modalDetailStyles.closeBtn} onClick={onClose}>✕</button>
        <h2 style={modalDetailStyles.title}>📋 Детали инвойса</h2>
        <div style={{
          ...modalDetailStyles.statusBadge,
          backgroundColor: getStatusColor(invoice.status) + '20',
          color: getStatusColor(invoice.status),
        }}>
          {getStatusLabel(invoice.status)}
        </div>

        <div style={modalDetailStyles.section}>
          <h3 style={modalDetailStyles.sectionTitle}>Основная информация</h3>
          <div style={modalDetailStyles.row}>
            <span style={modalDetailStyles.label}>ID инвойса:</span>
            <span style={modalDetailStyles.value}>
              {invoice.invoice_id}
              <button style={modalDetailStyles.copyBtn} onClick={() => copyToClipboard(invoice.invoice_id)}>📋</button>
            </span>
          </div>
          {invoice.merchant_order_id && (
            <div style={modalDetailStyles.row}>
              <span style={modalDetailStyles.label}>Order ID:</span>
              <span style={modalDetailStyles.value}>{invoice.merchant_order_id}</span>
            </div>
          )}
          <div style={modalDetailStyles.row}>
            <span style={modalDetailStyles.label}>Пользователь:</span>
            <span style={modalDetailStyles.value}>{invoice.user_id || '-'}</span>
          </div>
          {invoice.description && (
            <div style={modalDetailStyles.row}>
              <span style={modalDetailStyles.label}>Описание:</span>
              <span style={modalDetailStyles.value}>{invoice.description}</span>
            </div>
          )}
        </div>

        {/* Payment Info */}
        <div style={modalDetailStyles.section}>
          <h3 style={modalDetailStyles.sectionTitle}>Платёжная информация</h3>
          <div style={modalDetailStyles.row}>
            <span style={modalDetailStyles.label}>Сеть:</span>
            <span style={modalDetailStyles.value}>{invoice.network_display_name || invoice.network}</span>
          </div>
          <div style={modalDetailStyles.row}>
            <span style={modalDetailStyles.label}>Валюта:</span>
            <span style={modalDetailStyles.value}>{invoice.currency}</span>
          </div>
          <div style={modalDetailStyles.row}>
            <span style={modalDetailStyles.label}>Сумма:</span>
            <span style={modalDetailStyles.valueHighlight}>{invoice.amount} {invoice.currency}</span>
          </div>
          <div style={modalDetailStyles.row}>
            <span style={modalDetailStyles.label}>Сумма к оплате:</span>
            <span style={modalDetailStyles.valueHighlight}>{invoice.amount_to_pay || invoice.unique_amount || invoice.amount} {invoice.currency}</span>
          </div>
          {invoice.payment_id && (
            <div style={modalDetailStyles.row}>
              <span style={modalDetailStyles.label}>Payment ID:</span>
              <span style={modalDetailStyles.value}>
                <code style={modalDetailStyles.code}>{invoice.payment_id}</code>
                <button style={modalDetailStyles.copyBtn} onClick={() => copyToClipboard(invoice.payment_id)}>📋</button>
              </span>
            </div>
          )}
          <div style={modalDetailStyles.row}>
            <span style={modalDetailStyles.label}>Адрес:</span>
            <span style={modalDetailStyles.value}>
              <code style={modalDetailStyles.codeSmall}>{invoice.address}</code>
              <button style={modalDetailStyles.copyBtn} onClick={() => copyToClipboard(invoice.address)}>📋</button>
            </span>
          </div>
          <div style={modalDetailStyles.row}>
            <span style={modalDetailStyles.label}>Получено:</span>
            <span style={modalDetailStyles.value}>{invoice.amount_received || 0} {invoice.currency}</span>
          </div>
        </div>

        {/* Fiat Info */}
        {(invoice.fiat_amount || invoice.usd_amount) && (
          <div style={modalDetailStyles.section}>
            <h3 style={modalDetailStyles.sectionTitle}>Фиатная информация</h3>
            {invoice.fiat_amount && (
              <div style={modalDetailStyles.row}>
                <span style={modalDetailStyles.label}>Фиатная сумма:</span>
                <span style={modalDetailStyles.value}>{invoice.fiat_amount} {invoice.fiat_currency_code}</span>
              </div>
            )}
            {invoice.usd_amount && (
              <div style={modalDetailStyles.row}>
                <span style={modalDetailStyles.label}>USD эквивалент:</span>
                <span style={modalDetailStyles.valueHighlight}>${invoice.usd_amount.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Dates */}
        <div style={modalDetailStyles.section}>
          <h3 style={modalDetailStyles.sectionTitle}>Даты</h3>
          <div style={modalDetailStyles.row}>
            <span style={modalDetailStyles.label}>Создан:</span>
            <span style={modalDetailStyles.value}>{formatDate(invoice.created_at)}</span>
          </div>
          <div style={modalDetailStyles.row}>
            <span style={modalDetailStyles.label}>Истекает:</span>
            <span style={modalDetailStyles.value}>{formatDate(invoice.expires_at)}</span>
          </div>
          {invoice.paid_at && (
            <div style={modalDetailStyles.row}>
              <span style={modalDetailStyles.label}>Оплачен:</span>
              <span style={modalDetailStyles.value}>{formatDate(invoice.paid_at)}</span>
            </div>
          )}
          {invoice.confirmed_at && (
            <div style={modalDetailStyles.row}>
              <span style={modalDetailStyles.label}>Подтверждён:</span>
              <span style={modalDetailStyles.value}>{formatDate(invoice.confirmed_at)}</span>
            </div>
          )}
        </div>

        {/* Transactions */}
        {invoice.transactions && invoice.transactions.length > 0 && (
          <div style={modalDetailStyles.section}>
            <h3 style={modalDetailStyles.sectionTitle}>Транзакции ({invoice.transactions.length})</h3>
            {invoice.transactions.map((tx, idx) => (
              <div key={idx} style={modalDetailStyles.txCard}>
                <div style={modalDetailStyles.row}>
                  <span style={modalDetailStyles.label}>Hash:</span>
                  <span style={modalDetailStyles.value}>
                    <code style={modalDetailStyles.codeSmall}>{tx.hash?.slice(0, 20)}...</code>
                    <button style={modalDetailStyles.copyBtn} onClick={() => copyToClipboard(tx.hash)}>📋</button>
                  </span>
                </div>
                <div style={modalDetailStyles.row}>
                  <span style={modalDetailStyles.label}>Сумма:</span>
                  <span style={modalDetailStyles.value}>{tx.amount}</span>
                </div>
                <div style={modalDetailStyles.row}>
                  <span style={modalDetailStyles.label}>Подтверждений:</span>
                  <span style={modalDetailStyles.value}>{tx.confirmations || 0}</span>
                </div>
                <div style={modalDetailStyles.row}>
                  <span style={modalDetailStyles.label}>Статус:</span>
                  <span style={modalDetailStyles.value}>{tx.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={modalDetailStyles.actions}>
          {canCancel && (
            <button 
              style={modalDetailStyles.cancelBtn} 
              onClick={() => onCancel(invoice.invoice_id)}
            >
              🚫 Отменить платёж
            </button>
          )}
          <button style={modalDetailStyles.closeModalBtn} onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

const modalDetailStyles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    background: 'linear-gradient(145deg, #1a1a2e 0%, #16162a 100%)',
    borderRadius: 16,
    padding: 24,
    maxWidth: 600,
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    position: 'relative',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    color: '#fff',
    width: 32,
    height: 32,
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: 16,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    margin: '0 0 16px 0',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '8px 16px',
    borderRadius: 20,
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
    padding: 16,
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  sectionTitle: {
    color: '#a0a0a0',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    margin: '0 0 12px 0',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  label: {
    color: '#888',
    fontSize: 13,
    minWidth: 120,
  },
  value: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'right',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  valueHighlight: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: 600,
  },
  code: {
    background: 'rgba(139, 92, 246, 0.2)',
    color: '#a78bfa',
    padding: '4px 8px',
    borderRadius: 4,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
  },
  codeSmall: {
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#ccc',
    padding: '2px 6px',
    borderRadius: 4,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    wordBreak: 'break-all',
  },
  copyBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    padding: 4,
    opacity: 0.7,
  },
  txCard: {
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  actions: {
    display: 'flex',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    padding: '12px 20px',
    background: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  closeModalBtn: {
    flex: 1,
    padding: '12px 20px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#fff',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 14,
  },
};

const invoiceStyles = {
  container: {
    padding: 20,
    maxWidth: 1200,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    marginBottom: 24,
  },
  backBtn: {
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
  },
  title: {
    margin: 0,
    fontSize: 24,
    color: '#fff',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    textAlign: 'center',
  },
  statValue: {
    display: 'block',
    fontSize: 24,
    fontWeight: 700,
    color: '#fff',
    fontFamily: "'JetBrains Mono', monospace",
  },
  statLabel: {
    display: 'block',
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  filterSelect: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 14,
    minWidth: 150,
  },
  filterInput: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 14,
    minWidth: 130,
  },
  refreshBtn: {
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    border: 'none',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  error: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  loading: {
    textAlign: 'center',
    color: '#6b7280',
    padding: 40,
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  },
  th: {
    textAlign: 'left',
    padding: '14px 16px',
    background: 'rgba(255,255,255,0.05)',
    color: '#9ca3af',
    fontWeight: 600,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  tr: {
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  td: {
    padding: '14px 16px',
    color: '#fff',
    verticalAlign: 'top',
  },
  invoiceId: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: '#9ca3af',
  },
  orderId: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  userId: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    color: '#a855f7',
  },
  amount: {
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
  },
  network: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  usdAmount: {
    fontWeight: 600,
    color: '#22c55e',
    fontFamily: "'JetBrains Mono', monospace",
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  },
  date: {
    fontSize: 12,
    color: '#9ca3af',
  },
  confirmedAt: {
    fontSize: 11,
    color: '#22c55e',
    marginTop: 2,
  },
  empty: {
    textAlign: 'center',
    color: '#6b7280',
    padding: 40,
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 24,
  },
  pageBtn: {
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
  },
  pageInfo: {
    color: '#9ca3af',
    fontSize: 14,
  },
  detailsBtn: {
    background: 'rgba(59, 130, 246, 0.2)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    color: '#3b82f6',
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
};

const NETWORKS = [
  { value: 'bitcoin', label: 'Bitcoin' },
  { value: 'litecoin', label: 'Litecoin' },
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'bsc', label: 'BNB Smart Chain' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'arbitrum', label: 'Arbitrum' },
  { value: 'tron', label: 'Tron' },
];

const NETWORK_CURRENCIES = {
  bitcoin: [{ value: 'BTC', label: 'BTC (Bitcoin)' }],
  litecoin: [{ value: 'LTC', label: 'LTC (Litecoin)' }],
  ethereum: [
    { value: 'ETH', label: 'ETH (Ethereum)' },
    { value: 'USDT', label: 'USDT (Tether ERC-20)' },
    { value: 'USDC', label: 'USDC (USD Coin ERC-20)' },
  ],
  bsc: [
    { value: 'BNB', label: 'BNB (Binance Coin)' },
    { value: 'USDT', label: 'USDT (Tether BEP-20)' },
    { value: 'USDC', label: 'USDC (USD Coin BEP-20)' },
  ],
  polygon: [
    { value: 'MATIC', label: 'MATIC (Polygon)' },
    { value: 'USDT', label: 'USDT (Tether)' },
    { value: 'USDC', label: 'USDC (USD Coin)' },
  ],
  arbitrum: [
    { value: 'ARBETH', label: 'ETH (Arbitrum)' },
    { value: 'USDT', label: 'USDT (Tether)' },
    { value: 'USDC', label: 'USDC (USD Coin)' },
  ],
  tron: [
    { value: 'TRX', label: 'TRX (Tron)' },
    { value: 'USDT', label: 'USDT (Tether TRC-20)' },
  ],
};

const PRESETS = [50, 100, 500, 1000];

// Поддерживаемые фиатные валюты
const FIAT_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴' },
  { code: 'AMD', name: 'Armenian Dram', symbol: '֏' },
  { code: 'UZS', name: 'Uzbek Som', symbol: 'сўм' },
  { code: 'KZT', name: 'Kazakh Tenge', symbol: '₸' },
  { code: 'GEL', name: 'Georgian Lari', symbol: '₾' },
  { code: 'AZN', name: 'Azerbaijani Manat', symbol: '₼' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
];

// ═══════════════════════════════════════════════════════════════
// КОМПОНЕНТ МОДАЛЬНОГО ОКНА ОПЛАТЫ (API интеграция)
// ═══════════════════════════════════════════════════════════════

function PaymentModal({ invoice, onClose }) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(invoice.status);
  const [timeLeft, setTimeLeft] = useState(invoice.timeRemaining || 3600);

  // Поллинг статуса
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`${CONFIG.MERCHANT_SERVER}/api/payments/${invoice.id}/status`);
        const data = await res.json();
        if (data.success) {
          setStatus(data.data.status);
          if (data.data.status === 'confirmed' || data.data.status === 'paid') {
            // Платёж подтверждён!
          }
        }
      } catch (err) {
        console.error('Status check failed:', err);
      }
    };

    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [invoice.id]);

  // Таймер
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const copyAddress = () => {
    navigator.clipboard.writeText(invoice.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    switch (status) {
      case 'confirmed': return '#22c55e';
      case 'paid': return '#3b82f6';
      case 'pending': return '#fbbf24';
      case 'expired': return '#ef4444';
      default: return '#9ca3af';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'confirmed': return '✓ Оплачено и подтверждено!';
      case 'paid': return '⏳ Ожидание подтверждений...';
      case 'pending': return '⏳ Ожидание оплаты';
      case 'expired': return '✕ Время истекло';
      default: return status;
    }
  };

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={modalStyles.closeBtn} onClick={onClose}>✕</button>
        
        <h2 style={modalStyles.title}>Оплата #{invoice.id.slice(0, 8)}</h2>
        
        {/* Статус */}
        <div style={{ ...modalStyles.status, backgroundColor: getStatusColor() + '20', color: getStatusColor() }}>
          {getStatusText()}
        </div>

        {status === 'pending' && (
          <>
            {/* Сумма для оплаты */}
            <div style={modalStyles.amount}>
              <span style={modalStyles.amountValue}>{invoice.amount_to_pay || invoice.amount}</span>
              <span style={modalStyles.amountCurrency}>{invoice.currency}</span>
            </div>
            <div style={modalStyles.network}>Сеть: {invoice.networkDisplayName || invoice.network}</div>

            {/* QR код */}
            <div style={modalStyles.qrContainer}>
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${invoice.address}`}
                alt="QR Code"
                style={modalStyles.qr}
              />
            </div>

            {/* Адрес */}
            <div style={modalStyles.addressContainer}>
              <div style={modalStyles.addressLabel}>Адрес для оплаты:</div>
              <div style={modalStyles.addressRow}>
                <code style={modalStyles.address}>{invoice.address}</code>
                <button style={modalStyles.copyBtn} onClick={copyAddress}>
                  {copied ? '✓' : '📋'}
                </button>
              </div>
            </div>

            {/* Уникальный ID платежа */}
            {invoice.payment_id && (
              <div style={modalStyles.paymentIdContainer}>
                <div style={modalStyles.paymentIdLabel}>Уникальный ID платежа (memo/tag):</div>
                <div style={modalStyles.paymentIdRow}>
                  <code style={modalStyles.paymentId}>{invoice.payment_id}</code>
                  <button 
                    style={modalStyles.copyBtn} 
                    onClick={() => {
                      navigator.clipboard.writeText(invoice.payment_id);
                    }}
                  >
                    📋
                  </button>
                </div>
                <div style={modalStyles.paymentIdHint}>
                  💡 Добавьте этот код как memo/tag если ваш кошелёк поддерживает
                </div>
              </div>
            )}

            {/* Предупреждение */}
            <div style={modalStyles.warning}>
              ⚠️ Отправьте точную сумму <strong>{invoice.amount_to_pay || invoice.amount} {invoice.currency}</strong> для автоматического зачисления
            </div>

            {/* Таймер */}
            <div style={modalStyles.timer}>
              Осталось: <strong>{formatTime(timeLeft)}</strong>
            </div>
          </>
        )}

        {status === 'confirmed' && (
          <div style={modalStyles.successMessage}>
            <div style={modalStyles.successIcon}>✓</div>
            <p>Ваш баланс пополнен!</p>
            <button style={modalStyles.doneBtn} onClick={onClose}>Готово</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [currentPage, setCurrentPage] = useState('deposit'); // 'deposit' | 'invoices'
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [network, setNetwork] = useState('ethereum');
  const [currency, setCurrency] = useState('ETH');
  const [fiatCurrency, setFiatCurrency] = useState('USD'); // Фиатная валюта для отображения
  const [loading, setLoading] = useState(null); // 'api' | 'hosted' | null
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState(null);

  const availableCurrencies = NETWORK_CURRENCIES[network] || [];

  const handleNetworkChange = (newNetwork) => {
    setNetwork(newNetwork);
    const currencies = NETWORK_CURRENCIES[newNetwork] || [];
    if (currencies.length > 0) {
      setCurrency(currencies[0].value);
    }
  };

  // Загрузка баланса (ВАЖНО: хуки должны быть до любых условных return!)
  useEffect(() => {
    if (currentPage === 'invoices') return;
    
    const loadBalance = async () => {
      try {
        const res = await fetch(`${CONFIG.MERCHANT_SERVER}/api/users/${CONFIG.USER_ID}/balance`);
        const data = await res.json();
        if (data.success) {
          setBalance(data.data.balance);
        }
      } catch (err) {
        console.error('Failed to load balance:', err);
      }
    };

    loadBalance();
    const interval = setInterval(loadBalance, 10000);
    return () => clearInterval(interval);
  }, [currentPage]);

  if (currentPage === 'invoices') {
    return (
      <div style={styles.container}>
        <InvoicesPage onBack={() => setCurrentPage('deposit')} />
        <div style={styles.testBadge}>🧪 ТЕСТОВЫЙ РЕЖИМ</div>
      </div>
    );
  }

  const validateForm = () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount < 10) {
      setError('Минимальная сумма: $10');
      return false;
    }
    setError('');
    return true;
  };

  // ═══════════════════════════════════════════════════════════
  // ВАРИАНТ 1: API интеграция (пользователь остаётся на сайте)
  // ═══════════════════════════════════════════════════════════
  const handleApiPayment = async () => {
    if (!validateForm()) return;

    setLoading('api');
    try {
      console.log('📤 [API] Создаём инвойс через сервер мерчанта...');
      
      // Запрос на сервер мерчанта → он создаёт инвойс через API платёжного шлюза
      const res = await fetch(`${CONFIG.MERCHANT_SERVER}/api/payments/create-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: CONFIG.USER_ID,
          amount: parseFloat(amount),
          currency,
          network,
          description: `Пополнение баланса на $${amount}`,
        }),
      });

      const data = await res.json();
      console.log('📥 [API] Ответ:', data);

      if (data.success) {
        setInvoice(data.data);
        console.log('✅ [API] Инвойс создан, показываем модальное окно');
      } else {
        throw new Error(data.error || 'Ошибка создания платежа');
      }
    } catch (err) {
      console.error('❌ [API] Ошибка:', err);
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // ВАРИАНТ 2: Hosted Checkout (редирект на платёжный шлюз)
  // Конвертация фиат → крипта происходит на стороне платёжного шлюза!
  // ═══════════════════════════════════════════════════════════
  const handleHostedCheckout = async () => {
    if (!validateForm()) return;

    setLoading('hosted');
    try {
      console.log('📤 [HOSTED] Получаем URL для редиректа...');
      
      // Получаем символ фиатной валюты
      const fiatInfo = FIAT_CURRENCIES.find(f => f.code === fiatCurrency);
      const fiatAmount = parseFloat(amount);
      
      console.log(`💱 Сумма: ${fiatAmount} ${fiatCurrency}, оплата в ${currency} на ${network}`);
      
      // Запрос на сервер мерчанта → он генерирует подписанный URL
      // Платёжный шлюз сам конвертирует фиат в крипту по текущему курсу
      const res = await fetch(`${CONFIG.MERCHANT_SERVER}/api/payments/checkout-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: CONFIG.USER_ID,
          fiat_amount: fiatAmount,    // Сумма в ФИАТЕ
          fiat_currency: fiatCurrency, // Код фиатной валюты
          currency,                    // Криптовалюта для оплаты
          network,                     // Сеть блокчейна
          description: `Пополнение баланса на ${fiatInfo?.symbol || ''}${fiatAmount} ${fiatCurrency}`,
        }),
      });

      const data = await res.json();
      console.log('📥 [HOSTED] Ответ:', data);

      if (data.success) {
        console.log('✅ [HOSTED] Редирект на:', data.data.checkout_url);
        // Редирект на платёжный шлюз
        window.location.href = data.data.checkout_url;
      } else {
        throw new Error(data.error || 'Ошибка создания платежа');
      }
    } catch (err) {
      console.error('❌ [HOSTED] Ошибка:', err);
      setError(err.message);
      setLoading(null);
    }
  };

  return (
    <div style={styles.container}>
      {/* Модальное окно оплаты (API интеграция) */}
      {invoice && (
        <PaymentModal 
          invoice={invoice} 
          onClose={() => setInvoice(null)} 
        />
      )}

      {/* Тестовый бейдж */}
      <div style={styles.testBadge}>🧪 ТЕСТОВЫЙ РЕЖИМ</div>

      {/* Хедер */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.logo}>🎰 Test Casino</div>
          <div style={styles.userInfo}>
            <button 
              onClick={() => setCurrentPage('invoices')}
              style={styles.adminBtn}
            >
              📋 Инвойсы
            </button>
            <span>User: <strong>{CONFIG.USER_ID}</strong></span>
            <div style={styles.balance}>
              Баланс: <span style={styles.balanceValue}>${balance.toFixed(2)} USD</span>
            </div>
          </div>
        </div>
      </header>

      {/* Основной контент */}
      <main style={styles.main}>
        <div style={styles.card}>
          <h1 style={styles.title}>💳 Пополнение баланса</h1>
          <p style={styles.subtitle}>Выберите сумму и способ оплаты</p>

          {error && <div style={styles.error}>{error}</div>}

          {/* 1. Фиатная валюта — ПЕРВОЕ */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Валюта пополнения</label>
            <select
              value={fiatCurrency}
              onChange={(e) => setFiatCurrency(e.target.value)}
              style={styles.select}
            >
              {FIAT_CURRENCIES.map((f) => (
                <option key={f.code} value={f.code}>{f.symbol} {f.code} — {f.name}</option>
              ))}
            </select>
          </div>

          {/* 2. Сумма в выбранной фиатной валюте */}
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Сумма ({FIAT_CURRENCIES.find(f => f.code === fiatCurrency)?.symbol || '$'} {fiatCurrency})
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              min="10"
              step="1"
              style={styles.input}
            />
            <div style={styles.presets}>
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset.toString())}
                  style={styles.presetBtn}
                >
                  {FIAT_CURRENCIES.find(f => f.code === fiatCurrency)?.symbol}{preset}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Сеть блокчейна */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Сеть для оплаты</label>
            <select
              value={network}
              onChange={(e) => handleNetworkChange(e.target.value)}
              style={styles.select}
            >
              {NETWORKS.map((n) => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </select>
          </div>

          {/* 4. Криптовалюта */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Криптовалюта для оплаты</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={styles.select}
            >
              {availableCurrencies.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <small style={styles.hint}>
              Сумма в криптовалюте будет рассчитана по текущему курсу
            </small>
          </div>

          {/* ДВЕ КНОПКИ */}
          <div style={styles.buttonsContainer}>
            {/* Кнопка 1: API интеграция */}
            <button
              type="button"
              onClick={handleApiPayment}
              disabled={loading !== null}
              style={{
                ...styles.btn,
                ...styles.btnApi,
                opacity: loading !== null ? 0.5 : 1,
              }}
            >
              {loading === 'api' ? '⏳ Создание...' : '💳 Оплатить на сайте'}
            </button>

            {/* Кнопка 2: Hosted Checkout */}
            <button
              type="button"
              onClick={handleHostedCheckout}
              disabled={loading !== null}
              style={{
                ...styles.btn,
                ...styles.btnHosted,
                opacity: loading !== null ? 0.5 : 1,
              }}
            >
              {loading === 'hosted' ? '⏳ Переход...' : '🔗 Перейти к оплате →'}
            </button>
          </div>

          {/* Описание способов */}
          <div style={styles.methodsInfo}>
            <div style={styles.methodInfo}>
              <strong>💳 Оплатить на сайте</strong>
              <span>API интеграция — вы остаётесь на этом сайте</span>
            </div>
            <div style={styles.methodInfo}>
              <strong>🔗 Перейти к оплате</strong>
              <span>Hosted Checkout — переход на платёжный шлюз</span>
            </div>
          </div>

          {/* Информация */}
          <div style={styles.infoSection}>
            <h3 style={styles.infoTitle}>Информация о платеже</h3>
            <div style={styles.infoItem}>
              <span>Комиссия:</span>
              <span style={styles.infoValue}>0%</span>
            </div>
            <div style={styles.infoItem}>
              <span>Время зачисления:</span>
              <span style={styles.infoValue}>~5 минут</span>
            </div>
            <div style={styles.infoItem}>
              <span>Минимальная сумма:</span>
              <span style={styles.infoValue}>$10</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
    minHeight: '100vh',
    color: '#fff',
    margin: 0,
    padding: 0,
  },
  testBadge: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    zIndex: 100,
    boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)',
  },
  header: {
    background: 'rgba(255,255,255,0.03)',
    padding: 20,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(10px)',
  },
  headerContent: {
    maxWidth: 1200,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    fontSize: 26,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '-0.5px',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    color: '#9ca3af',
  },
  balance: {
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    padding: '10px 18px',
    borderRadius: 10,
    fontWeight: 600,
    color: '#fff',
    boxShadow: '0 4px 15px rgba(34, 197, 94, 0.3)',
  },
  balanceValue: {
    fontSize: 18,
    fontFamily: "'JetBrains Mono', monospace",
  },
  adminBtn: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  main: {
    maxWidth: 520,
    margin: 'auto',
    padding: 20,
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 36,
    backdropFilter: 'blur(10px)',
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    marginBottom: 8,
    marginTop: 0,
  },
  subtitle: {
    color: '#9ca3af',
    marginBottom: 28,
    fontSize: 15,
  },
  error: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
    fontSize: 14,
  },
  formGroup: {
    marginBottom: 22,
  },
  label: {
    display: 'block',
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 8,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    background: 'rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 16,
    fontFamily: "'JetBrains Mono', monospace",
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '14px 16px',
    background: 'rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 16,
    outline: 'none',
    cursor: 'pointer',
    boxSizing: 'border-box',
  },
  hint: {
    display: 'block',
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
    fontStyle: 'italic',
  },
  presets: {
    display: 'flex',
    gap: 10,
    marginTop: 12,
  },
  presetBtn: {
    flex: 1,
    padding: '10px 8px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
  },
  buttonsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 24,
  },
  btn: {
    width: '100%',
    padding: 16,
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  btnApi: {
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: '#fff',
    boxShadow: '0 8px 25px rgba(59, 130, 246, 0.3)',
  },
  btnHosted: {
    background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    color: '#1a1a2e',
    boxShadow: '0 8px 25px rgba(251, 191, 36, 0.3)',
  },
  methodsInfo: {
    marginTop: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  methodInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    fontSize: 12,
    color: '#6b7280',
  },
  infoSection: {
    marginTop: 28,
    paddingTop: 24,
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  infoTitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginTop: 0,
  },
  infoItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 0',
    fontSize: 14,
    color: '#6b7280',
  },
  infoValue: {
    color: '#fff',
    fontFamily: "'JetBrains Mono', monospace",
  },
};

const modalStyles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(5px)',
  },
  modal: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderRadius: 20,
    padding: 32,
    maxWidth: 400,
    width: '90%',
    position: 'relative',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: '#fff',
    width: 32,
    height: 32,
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: 16,
  },
  title: {
    margin: '0 0 16px 0',
    fontSize: 20,
    fontWeight: 600,
    color: '#fff',
  },
  status: {
    padding: '10px 16px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    textAlign: 'center',
    marginBottom: 20,
  },
  amount: {
    textAlign: 'center',
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: 700,
    color: '#fff',
    fontFamily: "'JetBrains Mono', monospace",
  },
  amountCurrency: {
    fontSize: 20,
    color: '#9ca3af',
    marginLeft: 8,
  },
  network: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 14,
    marginBottom: 20,
  },
  qrContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 20,
  },
  qr: {
    padding: 12,
    background: '#fff',
    borderRadius: 12,
  },
  addressContainer: {
    marginBottom: 16,
  },
  addressLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  addressRow: {
    display: 'flex',
    gap: 8,
  },
  address: {
    flex: 1,
    padding: '12px',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    fontSize: 11,
    color: '#fff',
    wordBreak: 'break-all',
    fontFamily: "'JetBrains Mono', monospace",
  },
  copyBtn: {
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 16,
  },
  timer: {
    textAlign: 'center',
    color: '#fbbf24',
    fontSize: 14,
    marginTop: 16,
  },
  paymentIdContainer: {
    marginTop: 16,
    marginBottom: 16,
  },
  paymentIdLabel: {
    fontSize: 12,
    color: '#a855f7',
    marginBottom: 8,
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  paymentIdRow: {
    display: 'flex',
    gap: 8,
  },
  paymentId: {
    flex: 1,
    padding: '12px',
    background: 'rgba(168, 85, 247, 0.15)',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    borderRadius: 8,
    fontSize: 16,
    color: '#a855f7',
    fontWeight: 700,
    letterSpacing: '1px',
    fontFamily: "'JetBrains Mono', monospace",
    textAlign: 'center',
  },
  paymentIdHint: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 8,
  },
  warning: {
    marginTop: 16,
    padding: '12px',
    background: 'rgba(251, 191, 36, 0.1)',
    border: '1px solid rgba(251, 191, 36, 0.3)',
    borderRadius: 8,
    fontSize: 12,
    color: '#fbbf24',
    textAlign: 'center',
  },
  successMessage: {
    textAlign: 'center',
    padding: '20px 0',
  },
  successIcon: {
    width: 60,
    height: 60,
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    color: '#fff',
    margin: '0 auto 16px',
  },
  doneBtn: {
    marginTop: 16,
    padding: '14px 32px',
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
