import { useAppContext } from "@/lib/store";
import { Navigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, TrendingUp, AlertTriangle, RefreshCw, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import { queryInstant } from "@/lib/prometheus";
import type { PrometheusConfig } from "@/lib/prometheus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricResult {
  metric: Record<string, string>;
  value: [number, string];
}

interface ChurnData {
  headSeries: number | null;
  headChunks: number | null;
  chunksCreatedRate: number | null;
  seriesCreatedRate: number | null;
  seriesRemovedRate: number | null;
  netChurnRate: number | null;
  topScrapeSeriesAdded: MetricResult[];
  topScrapePostRelabel: MetricResult[];
  loading: boolean;
  error: string | null;
}

const INITIAL: ChurnData = {
  headSeries: null,
  headChunks: null,
  chunksCreatedRate: null,
  seriesCreatedRate: null,
  seriesRemovedRate: null,
  netChurnRate: null,
  topScrapeSeriesAdded: [],
  topScrapePostRelabel: [],
  loading: false,
  error: null,
};

async function safeQuery(config: PrometheusConfig, query: string): Promise<MetricResult[]> {
  try {
    const data = await queryInstant(config, query);
    return data?.result ?? [];
  } catch {
    return [];
  }
}

async function scalarQuery(config: PrometheusConfig, query: string): Promise<number | null> {
  const results = await safeQuery(config, query);
  if (results.length === 0) return null;
  const v = parseFloat(results[0].value[1]);
  return isNaN(v) ? null : v;
}

export default function Churn() {
  const { connection } = useAppContext();
  const [data, setData] = useState<ChurnData>(INITIAL);
  const config = connection.config;

  const fetchData = useCallback(async () => {
    if (!config) return;
    setData((d) => ({ ...d, loading: true, error: null }));
    try {
      const [
        headSeries,
        headChunks,
        chunksCreatedRate,
        seriesCreatedRate,
        seriesRemovedRate,
        topScrapeSeriesAdded,
        topScrapePostRelabel,
      ] = await Promise.all([
        scalarQuery(config, "prometheus_tsdb_head_series"),
        scalarQuery(config, "prometheus_tsdb_head_chunks"),
        scalarQuery(config, "rate(prometheus_tsdb_head_chunks_created_total[5m])"),
        scalarQuery(config, "rate(prometheus_tsdb_head_series_created_total[5m])"),
        scalarQuery(config, "rate(prometheus_tsdb_head_series_removed_total[5m])"),
        safeQuery(config, "topk(10, scrape_series_added)"),
        safeQuery(config, "topk(10, scrape_samples_post_metric_relabeling)"),
      ]);

      const netChurnRate =
        seriesCreatedRate != null && seriesRemovedRate != null
          ? seriesCreatedRate - seriesRemovedRate
          : null;

      setData({
        headSeries,
        headChunks,
        chunksCreatedRate,
        seriesCreatedRate,
        seriesRemovedRate,
        netChurnRate,
        topScrapeSeriesAdded,
        topScrapePostRelabel,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setData((d) => ({ ...d, loading: false, error: e.message }));
    }
  }, [config]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!connection.isConnected) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Flame className="h-6 w-6 text-severity-churn" />
            Churn &amp; Memory Pressure
          </h1>
          <p className="text-muted-foreground text-sm">
            Why memory spikes happen — series creation/removal rates and head block pressure.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={data.loading}>
          {data.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1.5">Refresh</span>
        </Button>
      </div>

      {data.error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {data.error}
          </CardContent>
        </Card>
      )}

      {/* Head block gauges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GaugeCard
          title="Head Series"
          value={data.headSeries}
          subtitle="prometheus_tsdb_head_series"
          severity={getSeriesSeverity(data.headSeries)}
        />
        <GaugeCard
          title="Head Chunks"
          value={data.headChunks}
          subtitle="prometheus_tsdb_head_chunks"
          severity={getChunkSeverity(data.headChunks)}
        />
        <GaugeCard
          title="Chunk Creation Rate"
          value={data.chunksCreatedRate}
          subtitle="rate(…chunks_created_total[5m])"
          format="rate"
        />
      </div>

      {/* Churn rates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-severity-churn" />
            Series Churn Rates
          </CardTitle>
          <CardDescription>
            Net churn = created − removed. Positive = head is growing; negative = GC is winning.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChurnRateCard
              label="Created / sec"
              value={data.seriesCreatedRate}
              color="text-severity-critical"
            />
            <ChurnRateCard
              label="Removed / sec"
              value={data.seriesRemovedRate}
              color="text-severity-healthy"
            />
            <ChurnRateCard
              label="Net Churn / sec"
              value={data.netChurnRate}
              color={
                data.netChurnRate != null && data.netChurnRate > 0
                  ? "text-severity-critical"
                  : "text-severity-healthy"
              }
              badge={
                data.netChurnRate != null
                  ? data.netChurnRate > 10
                    ? "critical"
                    : data.netChurnRate > 1
                      ? "moderate"
                      : "healthy"
                  : undefined
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Top targets by scrape_series_added */}
      {data.topScrapeSeriesAdded.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Churny Targets — scrape_series_added</CardTitle>
            <CardDescription>
              Targets adding the most new series per scrape. High values indicate label churn or dynamic workloads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TargetTable results={data.topScrapeSeriesAdded} />
          </CardContent>
        </Card>
      )}

      {/* Top targets by scrape_samples_post_metric_relabeling */}
      {data.topScrapePostRelabel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Targets — scrape_samples_post_metric_relabeling</CardTitle>
            <CardDescription>
              Actual sample count per target after relabeling. Identifies heaviest producers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TargetTable results={data.topScrapePostRelabel} />
          </CardContent>
        </Card>
      )}

      {/* Link to cardinality drilldown */}
      <Card className="border-severity-churn/20">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Flame className="h-5 w-5 text-severity-churn" />
            <div>
              <p className="text-sm font-medium">Drill into Cardinality</p>
              <p className="text-xs text-muted-foreground">
                Use the Multiplier Tree to identify which labels cause the most series explosion.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/cardinality">
              Multiplier Tree
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function GaugeCard({
  title,
  value,
  subtitle,
  severity,
  format = "count",
}: {
  title: string;
  value: number | null;
  subtitle: string;
  severity?: "critical" | "moderate" | "healthy";
  format?: "count" | "rate";
}) {
  const borderColor =
    severity === "critical"
      ? "border-severity-critical/30"
      : severity === "moderate"
        ? "border-severity-moderate/30"
        : severity === "healthy"
          ? "border-severity-healthy/30"
          : "";

  const formatted =
    value == null
      ? "—"
      : format === "rate"
        ? `${value.toFixed(1)} /s`
        : value.toLocaleString();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className={borderColor}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              {title}
            </p>
            <p className="text-2xl font-bold font-mono">{formatted}</p>
          </CardContent>
        </Card>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <code className="text-xs">{subtitle}</code>
      </TooltipContent>
    </Tooltip>
  );
}

function ChurnRateCard({
  label,
  value,
  color,
  badge,
}: {
  label: string;
  value: number | null;
  color: string;
  badge?: "critical" | "moderate" | "healthy";
}) {
  return (
    <div className="rounded-lg border border-border/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <span className={`text-xl font-bold font-mono ${color}`}>
          {value == null ? "—" : value.toFixed(2)}
        </span>
        {badge && <SeverityBadge severity={badge} />}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: "critical" | "moderate" | "healthy" }) {
  const classes: Record<string, string> = {
    critical: "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
    moderate: "bg-severity-moderate/15 text-severity-moderate border-severity-moderate/30",
    healthy: "bg-severity-healthy/15 text-severity-healthy border-severity-healthy/30",
  };
  const labels: Record<string, string> = {
    critical: "Critical",
    moderate: "Moderate",
    healthy: "Healthy",
  };
  return <Badge className={`${classes[severity]} text-xs`}>{labels[severity]}</Badge>;
}

function TargetTable({ results }: { results: MetricResult[] }) {
  return (
    <div className="space-y-1.5">
      {results.map((r, i) => {
        const job = r.metric.job ?? "unknown";
        const instance = r.metric.instance ?? "";
        const val = parseFloat(r.value[1]);
        return (
          <div
            key={`${job}-${instance}-${i}`}
            className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0 mr-4">
              <Badge variant="outline" className="text-xs shrink-0">
                {job}
              </Badge>
              <span className="font-mono text-xs truncate text-muted-foreground">
                {instance}
              </span>
            </div>
            <span className="font-mono font-medium text-right w-24 shrink-0">
              {isNaN(val) ? "—" : val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function getSeriesSeverity(v: number | null): "critical" | "moderate" | "healthy" | undefined {
  if (v == null) return undefined;
  if (v > 2_000_000) return "critical";
  if (v > 500_000) return "moderate";
  return "healthy";
}

function getChunkSeverity(v: number | null): "critical" | "moderate" | "healthy" | undefined {
  if (v == null) return undefined;
  if (v > 10_000_000) return "critical";
  if (v > 3_000_000) return "moderate";
  return "healthy";
}
