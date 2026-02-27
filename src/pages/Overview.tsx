import { useAppContext } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, Radio, Timer } from "lucide-react";
import { Navigate } from "react-router-dom";
import { PageHelp, overviewHelp } from "@/components/PageHelp";

export default function Overview() {
  const { connection } = useAppContext();
  const tsdb = connection.tsdbStatus;
  const targets = connection.targets;
  const activeUp = targets?.activeTargets?.filter((t) => t.health === "up").length ?? 0;
  const activeTotal = targets?.activeTargets?.length ?? 0;

  if (!connection.isConnected) return <Navigate to="/" replace />;

  // Collect unique scrape intervals
  const intervals = new Set(targets?.activeTargets?.map((t) => t.scrapeInterval) ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground text-sm">
            Connected to <span className="font-mono text-foreground">{connection.config?.baseUrl}</span>
          </p>
        </div>
        <PageHelp {...overviewHelp} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Series"
          value={tsdb?.headStats?.numSeries?.toLocaleString() ?? "—"}
          icon={<Database className="h-4 w-4" />}
          severity={getSeverity(tsdb?.headStats?.numSeries)}
        />
        <StatCard
          title="Active Targets"
          value={`${activeUp} / ${activeTotal}`}
          icon={<Radio className="h-4 w-4" />}
          severity={activeUp === activeTotal ? "healthy" : "moderate"}
        />
        <StatCard
          title="Label Pairs"
          value={tsdb?.headStats?.numLabelPairs?.toLocaleString() ?? "—"}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          title="Scrape Intervals"
          value={intervals.size > 0 ? Array.from(intervals).join(", ") : "—"}
          icon={<Timer className="h-4 w-4" />}
        />
      </div>

      {tsdb?.seriesCountByMetricName && tsdb.seriesCountByMetricName.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Metrics by Series Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tsdb.seriesCountByMetricName.slice(0, 15).map((m) => (
                <div key={m.name} className="flex items-center justify-between text-sm">
                  <span className="font-mono truncate flex-1 mr-4">{m.name}</span>
                  <span className={`font-mono font-medium ${getColor(m.value)}`}>
                    {m.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tsdb?.labelValueCountByLabelName && tsdb.labelValueCountByLabelName.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Labels by Value Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tsdb.labelValueCountByLabelName.slice(0, 15).map((l) => (
                <div key={l.name} className="flex items-center justify-between text-sm">
                  <span className="font-mono truncate flex-1 mr-4">{l.name}</span>
                  <span className="font-mono font-medium">{l.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getSeverity(count?: number): "critical" | "moderate" | "healthy" | undefined {
  if (count == null) return undefined;
  if (count > 1_000_000) return "critical";
  if (count > 500_000) return "moderate";
  return "healthy";
}

function getColor(count: number): string {
  if (count > 10_000) return "text-severity-critical";
  if (count > 5_000) return "text-severity-moderate";
  return "text-severity-healthy";
}

function StatCard({
  title,
  value,
  icon,
  severity,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  severity?: "critical" | "moderate" | "healthy";
}) {
  const borderColor =
    severity === "critical"
      ? "border-severity-critical/30"
      : severity === "moderate"
        ? "border-severity-moderate/30"
        : severity === "healthy"
          ? "border-severity-healthy/30"
          : "";

  return (
    <Card className={borderColor}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wider">{title}</span>
        </div>
        <p className="text-2xl font-bold font-mono">{value}</p>
      </CardContent>
    </Card>
  );
}
