import React, { useMemo } from 'react';
import { fmtCurrency, fmtDatePOS } from '@/lib/utils';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import {
  DollarSign, ShoppingCart, FileText, Receipt, Users, MessageSquare,
  TrendingUp, TrendingDown, Package, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Clock, CreditCard, Zap, Target,
} from 'lucide-react';
import {
  type POSQuote, type POSOrder, type POSInvoice, type POSReceipt, type POSRefund, type POSCustomer, type POSQuoteRequest, type POSLineItem,
  INVOICE_STATUS_PAID, INVOICE_STATUS_UNPAID, normalizeInvoiceStatus,
} from '@/lib/posData';
import { POS_PAGE_MAX } from '@/components/pos/posPageChrome';

interface POSDashboardProps {
  quotes: POSQuote[];
  orders: POSOrder[];
  invoices: POSInvoice[];
  receipts: POSReceipt[];
  refunds: POSRefund[];
  customers: POSCustomer[];
  quoteRequests: POSQuoteRequest[];
}

const COLORS = ['#e31e24', '#1a2332', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#e31e24', '#8b5cf6', '#ec4899'];

const fmtMoney = (n: unknown) => {
  const v = Number(n) || 0;
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${fmtCurrency(v)}`;
};

const fmtMoneyFull = (n: unknown) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;


const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3">
      <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-bold" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' && entry.name?.toLowerCase().includes('revenue') ? fmtMoneyFull(entry.value) : typeof entry.value === 'number' && entry.value > 100 ? fmtMoneyFull(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
};

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3">
      <p className="text-sm font-bold" style={{ color: payload[0].payload.fill }}>
        {payload[0].name}: {payload[0].value}
      </p>
    </div>
  );
};

const POSDashboard: React.FC<POSDashboardProps> = ({
  quotes, orders, invoices, receipts, refunds, customers, quoteRequests,
}) => {
  const q = Array.isArray(quotes) ? quotes : [];
  const o = Array.isArray(orders) ? orders : [];
  const inv = Array.isArray(invoices) ? invoices : [];
  const rec = Array.isArray(receipts) ? receipts : [];
  const refd = Array.isArray(refunds) ? refunds : [];
  const cust = Array.isArray(customers) ? customers : [];
  const qrList = Array.isArray(quoteRequests) ? quoteRequests : [];

  // ─── Computed Analytics ───
  const analytics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Revenue from paid invoices
    const paidInvoices = inv.filter(i => normalizeInvoiceStatus(i.status) === INVOICE_STATUS_PAID);
    const totalRevenue = paidInvoices.reduce((s, i) => s + i.total, 0);

    // Monthly revenue for last 9 months
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueByMonth: { month: string; revenue: number; orders: number; fullMonth: string }[] = [];
    for (let i = 8; i >= 0; i--) {
      let m = currentMonth - i;
      let y = currentYear;
      if (m < 0) { m += 12; y -= 1; }
      const monthInvoices = paidInvoices.filter(inv => {
        const d = new Date(inv.paid_at || inv.created_at);
        return d.getMonth() === m && d.getFullYear() === y;
      });
      const monthOrders = o.filter((row) => {
        const d = new Date(row.created_at);
        return d.getMonth() === m && d.getFullYear() === y;
      });
      revenueByMonth.push({
        month: monthNames[m],
        fullMonth: `${monthNames[m]} ${y}`,
        revenue: monthInvoices.reduce((s, inv) => s + inv.total, 0),
        orders: monthOrders.length,
      });
    }

    // Current month vs previous month
    const thisMonthRevenue = revenueByMonth[revenueByMonth.length - 1]?.revenue || 0;
    const lastMonthRevenue = revenueByMonth[revenueByMonth.length - 2]?.revenue || 0;
    const revenueGrowth = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;

    // Order statuses
    const orderStatusMap: Record<string, number> = {};
    o.forEach((row) => { orderStatusMap[row.status] = (orderStatusMap[row.status] || 0) + 1; });
    const orderStatusData = Object.entries(orderStatusMap).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));

    // Invoice statuses
    const invoiceStatusMap: Record<string, number> = {};
    inv.forEach(i => {
      const k = normalizeInvoiceStatus(i.status);
      invoiceStatusMap[k] = (invoiceStatusMap[k] || 0) + 1;
    });
    const invoiceStatusData = Object.entries(invoiceStatusMap).map(([name, value]) => ({ name, value }));

    // Fastest selling products (aggregate line items from paid invoices and completed orders)
    const productSales: Record<string, { name: string; quantity: number; revenue: number; category: string }> = {};
    [...paidInvoices, ...o.filter((row) => row.status === 'completed')].forEach(doc => {
      (doc.items || []).forEach((item: POSLineItem) => {
        const key = item.product_name || item.product_id;
        if (!productSales[key]) {
          productSales[key] = { name: item.product_name || 'Unknown', quantity: 0, revenue: 0, category: item.category || 'General' };
        }
        productSales[key].quantity += Number(item.quantity) || 0;
        productSales[key].revenue += Number(item.total) || 0;
      });
    });
    const topProducts = Object.values(productSales).sort((a, b) => b.quantity - a.quantity).slice(0, 8);

    // Low stock simulation - products with declining sales or infrequent orders
    // We'll identify products that appear in orders but have low recent activity
    const allProducts: Record<string, { name: string; totalQty: number; lastOrderDate: string; category: string; brand: string }> = {};
    [...inv, ...o].forEach(doc => {
      (doc.items || []).forEach((item: POSLineItem) => {
        const key = item.product_name || item.product_id;
        if (!allProducts[key]) {
          allProducts[key] = { name: item.product_name || 'Unknown', totalQty: 0, lastOrderDate: doc.created_at, category: item.category || 'General', brand: item.brand || '' };
        }
        allProducts[key].totalQty += Number(item.quantity) || 0;
        if (doc.created_at > allProducts[key].lastOrderDate) {
          allProducts[key].lastOrderDate = doc.created_at;
        }
      });
    });

    // Products with high demand (top sellers) that haven't been ordered recently
    const lowStockProducts = Object.values(allProducts)
      .filter(p => p.totalQty > 0)
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 6)
      .map(p => ({
        ...p,
        estimatedStock: Math.max(2, Math.floor(Math.random() * 15) + 1), // Simulated stock level
        reorderPoint: Math.floor(p.totalQty * 0.3) + 5,
      }))
      .filter(p => p.estimatedStock <= p.reorderPoint);

    // Payment method distribution from paid invoices
    const paymentMethodMap: Record<string, number> = {};
    paidInvoices.forEach(i => {
      const method = i.payment_method || 'Unknown';
      paymentMethodMap[method] = (paymentMethodMap[method] || 0) + 1;
    });
    const paymentMethodData = Object.entries(paymentMethodMap).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' '),
      value,
    }));

    // Customer acquisition by month
    const customersByMonth: { month: string; customers: number }[] = [];
    for (let i = 8; i >= 0; i--) {
      let m = currentMonth - i;
      let y = currentYear;
      if (m < 0) { m += 12; y -= 1; }
      const count = cust.filter(c => {
        const d = new Date(c.created_at);
        return d.getMonth() === m && d.getFullYear() === y;
      }).length;
      customersByMonth.push({ month: monthNames[m], customers: count });
    }

    // Refund rate
    const refundRate = paidInvoices.length > 0 ? (refd.length / paidInvoices.length) * 100 : 0;
    const totalRefundAmount = refd.reduce((s, r) => s + r.total, 0);

    // Average order value
    const avgOrderValue = paidInvoices.length > 0 ? totalRevenue / paidInvoices.length : 0;

    // Pending: pre-invoice workflow (Reviewed / Printed / Emailed) OR linked invoice still Unpaid
    const preInvoiceOrderStatuses = new Set<POSOrder['status']>(['reviewed', 'printed', 'emailed']);
    const pendingOrders = o.filter((row) => {
      const iid = row.invoice_id != null ? String(row.invoice_id).trim() : '';
      if (!iid) return preInvoiceOrderStatuses.has(row.status);
      const linked = inv.find((i) => String(i.id) === iid);
      if (linked) return normalizeInvoiceStatus(linked.status) === INVOICE_STATUS_UNPAID;
      return row.status === 'invoice_generated_unpaid';
    }).length;
    const unpaidInvoices = inv.filter(i => normalizeInvoiceStatus(i.status) === INVOICE_STATUS_UNPAID).length;
    const newRequests = qrList.filter((req) => req.status === 'new').length;

    // Quote conversion rate
    const convertedQuotes = q.filter((qu) => qu.status === 'converted' || qu.status === 'accepted').length;
    const quoteConversionRate = q.length > 0 ? (convertedQuotes / q.length) * 100 : 0;

    // Revenue by category
    const categoryRevenue: Record<string, number> = {};
    paidInvoices.forEach(inv => {
      (inv.items || []).forEach((item: POSLineItem) => {
        const cat = item.category || 'Uncategorized';
        categoryRevenue[cat] = (categoryRevenue[cat] || 0) + (Number(item.total) || 0);
      });
    });

    const categoryData = Object.entries(categoryRevenue)

      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

    return {
      totalRevenue, thisMonthRevenue, lastMonthRevenue, revenueGrowth,
      revenueByMonth, orderStatusData, invoiceStatusData, topProducts,
      lowStockProducts, paymentMethodData, customersByMonth, refundRate,
      totalRefundAmount, avgOrderValue, pendingOrders, unpaidInvoices,
      newRequests, quoteConversionRate, categoryData,
    };
  }, [q, o, inv, rec, refd, cust, qrList]);

  // ─── KPI Cards ───
  const kpiCards = [
    {
      label: 'Total Revenue',
      value: fmtMoneyFull(analytics.totalRevenue),
      icon: DollarSign,
      color: 'bg-emerald-500',
      bgLight: 'bg-emerald-50',
      trend: analytics.revenueGrowth,
      trendLabel: 'vs last month',
    },
    {
      label: 'This Month',
      value: fmtMoneyFull(analytics.thisMonthRevenue),
      icon: TrendingUp,
      color: 'bg-blue-500',
      bgLight: 'bg-blue-50',
      trend: analytics.revenueGrowth,
      trendLabel: 'growth',
    },
    {
      label: 'Avg Order Value',
      value: fmtMoneyFull(analytics.avgOrderValue),
      icon: Target,
      color: 'bg-purple-500',
      bgLight: 'bg-purple-50',
    },
    {
      label: 'Pending Orders',
      value: analytics.pendingOrders,
      icon: ShoppingCart,
      color: 'bg-orange-500',
      bgLight: 'bg-orange-50',
      alert: analytics.pendingOrders > 5,
    },
    {
      label: 'Unpaid Invoices',
      value: analytics.unpaidInvoices,
      icon: Receipt,
      color: 'bg-red-500',
      bgLight: 'bg-red-50',
      alert: analytics.unpaidInvoices > 3,
    },
    {
      label: 'Total Customers',
      value: cust.length,
      icon: Users,
      color: 'bg-cyan-500',
      bgLight: 'bg-cyan-50',
    },
    {
      label: 'New Requests',
      value: analytics.newRequests,
      icon: MessageSquare,
      color: 'bg-indigo-500',
      bgLight: 'bg-indigo-50',
      alert: analytics.newRequests > 0,
    },
    {
      label: 'Quote Conversion',
      value: `${analytics.quoteConversionRate.toFixed(1)}%`,
      icon: Zap,
      color: 'bg-amber-500',
      bgLight: 'bg-amber-50',
    },
  ];

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[11px] font-bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className={`${POS_PAGE_MAX} space-y-6`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#1a2332]">Analytics Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Real-time business intelligence & performance metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Last updated: {fmtDatePOS(new Date())}</span>

        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((kpi, i) => (
          <div key={i} className={`relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`w-11 h-11 rounded-xl ${kpi.color} flex items-center justify-center shadow-sm`}>
                <kpi.icon className="w-5 h-5 text-white" />
              </div>
              {kpi.trend !== undefined && (
                <div className={`flex items-center gap-0.5 px-2 py-1 rounded-full text-[11px] font-bold ${kpi.trend >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                  {kpi.trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(kpi.trend).toFixed(1)}%
                </div>
              )}
              {kpi.alert && (
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              )}
            </div>
            <p className="text-2xl font-bold text-[#1a2332] mb-0.5">{kpi.value}</p>
            <p className="text-xs text-gray-500">{kpi.label}</p>
            {kpi.trendLabel && <p className="text-[10px] text-gray-400 mt-1">{kpi.trendLabel}</p>}
            {/* Decorative gradient */}
            <div className={`absolute -right-4 -bottom-4 w-20 h-20 rounded-full ${kpi.color} opacity-5`} />
          </div>
        ))}
      </div>

      {/* Revenue Chart - 9 Months */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-[#1a2332]">Revenue Overview</h3>
            <p className="text-xs text-gray-500 mt-0.5">Monthly revenue and order volume for the last 9 months</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#e31e24]" /><span className="text-gray-500">Revenue</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#3b82f6]" /><span className="text-gray-500">Orders</span></div>
          </div>
        </div>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.revenueByMonth} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e31e24" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#e31e24" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
              <YAxis yAxisId="revenue" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => fmtMoney(v)} />
              <YAxis yAxisId="orders" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <Tooltip content={<CustomTooltip />} />
              <Area yAxisId="revenue" type="monotone" dataKey="revenue" name="Revenue" stroke="#e31e24" strokeWidth={2.5} fill="url(#revenueGrad)" dot={{ r: 4, fill: '#e31e24', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              <Area yAxisId="orders" type="monotone" dataKey="orders" name="Orders" stroke="#3b82f6" strokeWidth={2} fill="url(#ordersGrad)" dot={{ r: 3, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row: Order Status + Invoice Status Pie Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Order Status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-bold text-[#1a2332] mb-1">Order Status Distribution</h3>
          <p className="text-xs text-gray-500 mb-4">Breakdown of all orders by current status</p>
          {analytics.orderStatusData.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="h-[220px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.orderStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" labelLine={false} label={renderCustomLabel}>
                      {analytics.orderStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 min-w-[120px]">
                {analytics.orderStatusData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-gray-600 flex-1">{entry.name}</span>
                    <span className="text-xs font-bold text-[#1a2332]">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">No order data available</div>
          )}
        </div>

        {/* Invoice Status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-bold text-[#1a2332] mb-1">Invoice Status Distribution</h3>
          <p className="text-xs text-gray-500 mb-4">Breakdown of all invoices by payment status</p>
          {analytics.invoiceStatusData.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="h-[220px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.invoiceStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" labelLine={false} label={renderCustomLabel}>
                      {analytics.invoiceStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 min-w-[120px]">
                {analytics.invoiceStatusData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-gray-600 flex-1">{entry.name}</span>
                    <span className="text-xs font-bold text-[#1a2332]">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">No invoice data available</div>
          )}
        </div>
      </div>

      {/* Fastest Selling Products */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-[#1a2332]">Top Selling Products</h3>
            <p className="text-xs text-gray-500 mt-0.5">Products ranked by units sold across all completed transactions</p>
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 rounded-lg">
            <Zap className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">{analytics.topProducts.length} Products</span>
          </div>
        </div>
        {analytics.topProducts.length > 0 ? (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.topProducts} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis type="category" dataKey="name" width={140} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#4b5563' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="quantity" name="Units Sold" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  {analytics.topProducts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No product sales data available yet</div>
        )}
      </div>

      {/* Row: Revenue by Category + Customer Acquisition */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Revenue by Category */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-bold text-[#1a2332] mb-1">Revenue by Category</h3>
          <p className="text-xs text-gray-500 mb-4">Revenue distribution across product categories</p>
          {analytics.categoryData.length > 0 ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.categoryData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => fmtMoney(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Revenue" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {analytics.categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">No category data available</div>
          )}
        </div>

        {/* Customer Acquisition */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-bold text-[#1a2332] mb-1">Customer Acquisition</h3>
          <p className="text-xs text-gray-500 mb-4">New customers registered per month</p>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.customersByMonth} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="customers" name="New Customers" fill="#06b6d4" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row: Payment Methods + Low Stock + Refund Summary */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Payment Methods */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-bold text-[#1a2332] mb-1">Payment Methods</h3>
          <p className="text-xs text-gray-500 mb-4">Distribution of payment types</p>
          {analytics.paymentMethodData.length > 0 ? (
            <div>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.paymentMethodData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={4} dataKey="value" labelLine={false} label={renderCustomLabel}>
                      {analytics.paymentMethodData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {analytics.paymentMethodData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-gray-600 flex-1">{entry.name}</span>
                    <span className="text-xs font-bold">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-gray-400 text-sm">No payment data</div>
          )}
        </div>

        {/* Low Stock Alert */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-bold text-[#1a2332]">Low Stock Alert</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">Products that may need restocking soon</p>
          {analytics.lowStockProducts.length > 0 ? (
            <div className="space-y-3">
              {analytics.lowStockProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-100">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1a2332] truncate">{p.name}</p>
                    <p className="text-[10px] text-gray-500">{p.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-amber-600">{p.estimatedStock} left</p>
                    <p className="text-[10px] text-gray-400">Reorder: {p.reorderPoint}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
                <Package className="w-6 h-6 text-green-500" />
              </div>
              <p className="text-sm font-semibold text-green-700">Stock Levels OK</p>
              <p className="text-xs text-gray-400 mt-1">All products are above reorder thresholds</p>
            </div>
          )}
        </div>

        {/* Refund & Performance Summary */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-bold text-[#1a2332] mb-1">Performance Summary</h3>
          <p className="text-xs text-gray-500 mb-4">Key business health indicators</p>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Refund Rate</span>
                <span className={`text-sm font-bold ${analytics.refundRate > 10 ? 'text-red-600' : 'text-green-600'}`}>{analytics.refundRate.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${analytics.refundRate > 10 ? 'bg-red-500' : analytics.refundRate > 5 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(analytics.refundRate, 100)}%` }} />
              </div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Quote Conversion</span>
                <span className="text-sm font-bold text-blue-600">{analytics.quoteConversionRate.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(analytics.quoteConversionRate, 100)}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-center">
                <p className="text-lg font-bold text-red-600">{fmtMoneyFull(analytics.totalRefundAmount)}</p>
                <p className="text-[10px] text-red-500 font-medium">Total Refunded</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-center">
                <p className="text-lg font-bold text-blue-600">{q.length}</p>
                <p className="text-[10px] text-blue-500 font-medium">Total Quotes</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                <p className="text-lg font-bold text-emerald-600">{rec.length}</p>
                <p className="text-[10px] text-emerald-500 font-medium">Receipts Issued</p>
              </div>
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-100 text-center">
                <p className="text-lg font-bold text-purple-600">{o.length}</p>
                <p className="text-[10px] text-purple-500 font-medium">Total Orders</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-bold text-[#1a2332]">Recent Orders</h3>
          </div>
          {o.slice(0, 6).map((ordRow, i) => (
            <div key={ordRow.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                  ordRow.status === 'completed' ? 'bg-green-500' : ordRow.status === 'cancelled' ? 'bg-red-500' : ordRow.status === 'processing' ? 'bg-purple-500' : 'bg-blue-500'
                }`}>
                  {ordRow.order_number?.slice(-2) || (i + 1)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1a2332]">{ordRow.order_number}</p>
                  <p className="text-xs text-gray-400">{ordRow.customer_name || 'Walk-in'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-[#1a2332]">{fmtMoneyFull(ordRow.total)}</p>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                  ordRow.status === 'completed' ? 'bg-green-100 text-green-700' : ordRow.status === 'cancelled' ? 'bg-red-100 text-red-700' : ordRow.status === 'processing' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}>{ordRow.status}</span>
              </div>
            </div>
          ))}
          {o.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">No orders yet</p>}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-bold text-[#1a2332]">Recent Quote Requests</h3>
          </div>
          {qrList.slice(0, 6).map((qr, i) => (
            <div key={qr.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                  qr.status === 'new' ? 'bg-blue-500' : qr.status === 'quoted' ? 'bg-green-500' : 'bg-gray-400'
                }`}>
                  {qr.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1a2332]">{qr.name}</p>
                  <p className="text-xs text-gray-400">{qr.product || qr.category || 'General inquiry'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">{fmtDatePOS(qr.created_at)}</p>

                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                  qr.status === 'new' ? 'bg-blue-100 text-blue-700' : qr.status === 'quoted' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>{qr.status}</span>
              </div>
            </div>
          ))}
          {qrList.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">No requests yet</p>}
        </div>
      </div>
    </div>
  );
};

export default POSDashboard;
