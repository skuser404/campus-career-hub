'use client';

import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@cch/shared';
import { BarChart3, Table2 } from 'lucide-react';
import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/states';
import { useAnalytics } from '@/hooks/use-admin';

/**
 * Analytics.
 *
 * Two decisions worth stating, because both are easy to get wrong:
 *
 *  1. Views and applications are plotted as SMALL MULTIPLES, not as two series
 *     on one chart. Views outnumber applications by roughly two orders of
 *     magnitude — on a shared axis the applications line would be pinned flat to
 *     zero and tell you nothing. The tempting fix is a second y-axis, which is
 *     worse: a dual-axis chart lets you slide one scale against the other until
 *     the two lines "correlate", which is a way of lying with a true dataset.
 *     Two charts, one axis each, aligned on the same x.
 *
 *  2. Colour never carries meaning alone. Every chart has a legend or direct
 *     labels, and a table view sits behind a toggle for anyone the charts do not
 *     serve.
 */

const AXIS = {
  stroke: 'var(--muted-foreground)',
  fontSize: 11,
} as const;

export default function AdminAnalyticsPage() {
  const [days, setDays] = React.useState(30);
  const [showTable, setShowTable] = React.useState(false);

  const { data, isLoading, isError, refetch } = useAnalytics(days);

  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const hasActivity =
    data && (data.totals.totalViews > 0 || data.totals.totalApplications > 0);

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Every number here is counted from a real table — nothing is estimated."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTable((s) => !s)}
              aria-pressed={showTable}
            >
              {showTable ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
              {showTable ? 'Charts' : 'Table'}
            </Button>

            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-36" aria-label="Time range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-72 rounded-xl" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      ) : !hasActivity ? (
        <EmptyState
          icon={BarChart3}
          title="No activity yet"
          description="Once students start viewing and applying to opportunities, their behaviour will show up here."
        />
      ) : showTable ? (
        <DataTables data={data} />
      ) : (
        <div className="space-y-6">
          {/* ── Small multiples: same x-axis, independent y-scales ────────── */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Views</CardTitle>
                <CardDescription>
                  Opportunity page views over the last {days} days.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.timeSeries} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    {/* Horizontal rules only, and recessive. Vertical gridlines on a
                        time series add clutter without aiding a single reading. */}
                    <CartesianGrid stroke="var(--border)" vertical={false} />

                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      {...AXIS}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />

                    <Tooltip content={<ChartTooltip />} />

                    <Area
                      type="monotone"
                      dataKey="views"
                      name="Views"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      fill="url(#viewsFill)"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Applications</CardTitle>
                <CardDescription>
                  Marked as applied over the last {days} days.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart
                    data={data.timeSeries}
                    margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="appsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid stroke="var(--border)" vertical={false} />

                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      {...AXIS}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />

                    <Tooltip content={<ChartTooltip />} />

                    <Area
                      type="monotone"
                      dataKey="applications"
                      name="Applications"
                      stroke="var(--chart-2)"
                      strokeWidth={2}
                      fill="url(#appsFill)"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Category breakdown ─────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By category</CardTitle>
                <CardDescription>Published opportunities and the applications they drew.</CardDescription>
              </CardHeader>

              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={data.byCategory}
                    margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                    barGap={2}
                  >
                    <CartesianGrid stroke="var(--border)" vertical={false} />

                    <XAxis dataKey="name" {...AXIS} tickLine={false} axisLine={false} />
                    <YAxis {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />

                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />

                    {/* Two series, so a legend is mandatory — identity must never
                        rest on colour alone. */}
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={28}
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}
                    />

                    <Bar
                      dataKey="jobs"
                      name="Opportunities"
                      fill="var(--chart-1)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      dataKey="applications"
                      name="Applications"
                      fill="var(--chart-2)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* ── Application funnel ─────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Application outcomes</CardTitle>
                <CardDescription>Where every application currently stands.</CardDescription>
              </CardHeader>

              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    layout="vertical"
                    data={data.applicationFunnel.map((s) => ({
                      ...s,
                      label:
                        APPLICATION_STATUS_LABELS[s.status as ApplicationStatus] ?? s.status,
                    }))}
                    margin={{ top: 4, right: 32, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid stroke="var(--border)" horizontal={false} />

                    <XAxis type="number" {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      {...AXIS}
                      tickLine={false}
                      axisLine={false}
                      width={90}
                    />

                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />

                    {/*
                     * ONE series, so no legend — the title names it. Identity is
                     * carried by the y-axis labels, not by colour, which is why a
                     * single hue is correct here. Painting each status a different
                     * colour would imply a categorical distinction the axis already
                     * makes, and would burn palette slots for nothing.
                     */}
                    <Bar dataKey="count" name="Applications" radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {data.applicationFunnel.map((s) => (
                        <Cell key={s.status} fill="var(--chart-1)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* ── Top opportunities ──────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Most viewed</CardTitle>
              <CardDescription>
                A high view count with few applications usually means the eligibility line is
                unclear, or the deadline already passed.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr>
                      <th className="pb-2 text-left font-medium">Role</th>
                      <th className="pb-2 text-left font-medium">Company</th>
                      <th className="pb-2 text-right font-medium">Views</th>
                      <th className="pb-2 text-right font-medium">Saves</th>
                      <th className="pb-2 text-right font-medium">Applied</th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.topJobs.map((job) => (
                      <tr key={job.id} className="border-b border-border last:border-0">
                        <td className="max-w-xs py-2.5">
                          <span className="line-clamp-1">{job.role}</span>
                        </td>
                        <td className="py-2.5 text-muted-foreground">{job.companyName}</td>
                        <td className="py-2.5 text-right tabular-nums">{job.views}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {job.saves}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {job.applications}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Tooltip. Themed, and the value never wears the series colour — a coloured dot
 *  beside it carries identity, while the number stays in ordinary ink. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium text-foreground">
        {label && /^\d{4}-\d{2}-\d{2}$/.test(label) ? longDate(label) : label}
      </p>

      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium tabular-nums text-foreground">
            {entry.value.toLocaleString('en-IN')}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The table view. Not an afterthought — it is the accessible equivalent of every
 *  chart above, and the only thing that works in a screen reader. */
function DataTables({ data }: { data: NonNullable<ReturnType<typeof useAnalytics>['data']> }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-border bg-card">
                <tr>
                  <th className="pb-2 text-left font-medium">Date</th>
                  <th className="pb-2 text-right font-medium">Views</th>
                  <th className="pb-2 text-right font-medium">Applications</th>
                </tr>
              </thead>
              <tbody>
                {[...data.timeSeries].reverse().map((p) => (
                  <tr key={p.date} className="border-b border-border last:border-0">
                    <td className="py-2">{longDate(p.date)}</td>
                    <td className="py-2 text-right tabular-nums">{p.views}</td>
                    <td className="py-2 text-right tabular-nums">{p.applications}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By category</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="pb-2 text-left font-medium">Category</th>
                <th className="pb-2 text-right font-medium">Opportunities</th>
                <th className="pb-2 text-right font-medium">Applications</th>
              </tr>
            </thead>
            <tbody>
              {data.byCategory.map((c) => (
                <tr key={c.categoryId} className="border-b border-border last:border-0">
                  <td className="py-2">{c.name}</td>
                  <td className="py-2 text-right tabular-nums">{c.jobs}</td>
                  <td className="py-2 text-right tabular-nums">{c.applications}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
