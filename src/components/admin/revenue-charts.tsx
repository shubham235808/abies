'use client';

import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardTitle } from '@/components/ui/card';

// EXPANSION-1d — Management Command Centre's revenue trend + breakdown
// (docs/EXPANSION-1-VISUAL-GAP-ANALYSIS.md #14), computed server-side in
// modules/admin/dashboard.service.ts from real Payment rows. recharts per
// the user's explicit choice over a hand-rolled SVG chart.
const PURPOSE_LABELS: Record<string, string> = {
  CONSULTATION: 'Consultations',
  DIAGNOSTIC_ORDER: 'Diagnostics',
  MEDICINE_ORDER: 'Medicines',
  PANCHAKARMA_BOOKING: 'Panchakarma',
  PACKAGE: 'Packages',
};

const PIE_COLORS = ['#7A1783', '#D6336C', '#1971C2', '#E8590C', '#2F9E44'];

function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatRupees(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export function RevenueTrendChart({ trend }: { trend: { date: string; amount: number }[] }) {
  const hasData = trend.some((p) => p.amount > 0);
  return (
    <Card>
      <CardTitle className="text-base">Revenue — last 30 days</CardTitle>
      {!hasData ? (
        <p className="mt-2 text-sm text-brand-neutral-500">No revenue in this window yet.</p>
      ) : (
        <div className="mt-3 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7A1783" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#7A1783" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                tick={{ fontSize: 11, fill: '#6b6470' }}
                interval={Math.ceil(trend.length / 6)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: '#6b6470' }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `₹${v}`} />
              <Tooltip
                formatter={(value) => formatRupees(Number(value))}
                labelFormatter={(label) => formatDateLabel(String(label))}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Area type="monotone" dataKey="amount" stroke="#7A1783" strokeWidth={2} fill="url(#revenueFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export function RevenueBreakdownChart({ byPurpose }: { byPurpose: Record<string, number> }) {
  const data = Object.entries(byPurpose)
    .filter(([, amount]) => amount > 0)
    .map(([purpose, amount]) => ({ name: PURPOSE_LABELS[purpose] ?? purpose, amount }));

  return (
    <Card>
      <CardTitle className="text-base">Revenue by category</CardTitle>
      {data.length === 0 ? (
        <p className="mt-2 text-sm text-brand-neutral-500">No revenue recorded yet.</p>
      ) : (
        <div className="mt-3 flex items-center gap-4">
          <div className="h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="amount" nameKey="name" innerRadius={35} outerRadius={70} paddingAngle={2}>
                  {data.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatRupees(Number(value))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1.5 text-sm">
            {data.map((entry, i) => (
              <li key={entry.name} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} aria-hidden="true" />
                <span className="text-brand-neutral-700">{entry.name}</span>
                <span className="ml-auto font-medium text-brand-neutral-900">{formatRupees(entry.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
