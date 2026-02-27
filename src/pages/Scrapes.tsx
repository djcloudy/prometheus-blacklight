import { useAppContext } from "@/lib/store";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Timer } from "lucide-react";
import { PageHelp, scrapesHelp } from "@/components/PageHelp";
import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Scrapes() {
  const { connection } = useAppContext();
  const targets = connection.targets?.activeTargets ?? [];

  // Group by job
  const byJob = useMemo(() => {
    const jobs: Record<string, {
      targets: typeof targets;
      avgDuration: number;
      interval: string;
      healthyCount: number;
    }> = {};
    for (const t of targets) {
      const job = t.labels?.job ?? t.scrapePool ?? "unknown";
      if (!jobs[job]) jobs[job] = { targets: [], avgDuration: 0, interval: t.scrapeInterval, healthyCount: 0 };
      jobs[job].targets.push(t);
      if (t.health === "up") jobs[job].healthyCount++;
    }
    for (const j of Object.values(jobs)) {
      const durations = j.targets.map((t) => t.lastScrapeDuration).filter(Boolean);
      j.avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    }
    return Object.entries(jobs).sort((a, b) => b[1].targets.length - a[1].targets.length);
  }, [targets]);

  if (!connection.isConnected) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Timer className="h-6 w-6" />
            Scrape Efficiency
          </h1>
          <p className="text-muted-foreground text-sm">
            Analyzes scrape performance across all targets.
          </p>
        </div>
        <PageHelp {...scrapesHelp} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground uppercase">Total Targets</span>
            <p className="text-2xl font-bold font-mono">{targets.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground uppercase">Jobs</span>
            <p className="text-2xl font-bold font-mono">{byJob.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground uppercase">Unhealthy</span>
            <p className="text-2xl font-bold font-mono text-severity-critical">
              {targets.filter((t) => t.health !== "up").length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Jobs Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Targets</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Avg Duration</TableHead>
                <TableHead>Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byJob.map(([job, info]) => {
                const intervalSecs = parseInterval(info.interval);
                const isFast = intervalSecs !== null && intervalSecs < 15;
                return (
                  <TableRow key={job}>
                    <TableCell className="font-mono text-sm">{job}</TableCell>
                    <TableCell className="font-mono">{info.targets.length}</TableCell>
                    <TableCell>
                      <span className={`font-mono ${isFast ? "text-severity-moderate" : ""}`}>
                        {info.interval}
                      </span>
                      {isFast && (
                        <Badge className="ml-2 bg-severity-moderate/15 text-severity-moderate border-severity-moderate/30 text-xs">
                          Fast
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">
                      {info.avgDuration > 0 ? `${(info.avgDuration * 1000).toFixed(0)}ms` : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={info.healthyCount === info.targets.length ? "text-severity-healthy" : "text-severity-critical"}>
                        {info.healthyCount}/{info.targets.length}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Targets</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map((t, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs max-w-xs truncate">{t.scrapeUrl}</TableCell>
                  <TableCell className="font-mono text-sm">{t.labels?.job ?? t.scrapePool}</TableCell>
                  <TableCell className="font-mono text-sm">{t.scrapeInterval}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {t.lastScrapeDuration ? `${(t.lastScrapeDuration * 1000).toFixed(0)}ms` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        t.health === "up"
                          ? "bg-severity-healthy/15 text-severity-healthy border-severity-healthy/30"
                          : "bg-severity-critical/15 text-severity-critical border-severity-critical/30"
                      }
                    >
                      {t.health}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function parseInterval(s: string): number | null {
  const m = s.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  switch (m[2]) {
    case "ms": return v / 1000;
    case "s": return v;
    case "m": return v * 60;
    case "h": return v * 3600;
    default: return null;
  }
}
