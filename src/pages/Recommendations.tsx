import { useAppContext } from "@/lib/store";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Copy, Check, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const DYNAMIC_PATTERNS = ["url", "path", "uri", "id", "uuid", "uid", "session", "request_id", "pod", "pid", "container_id", "trace_id", "span_id"];

interface Finding {
  id: string;
  severity: "critical" | "high" | "moderate" | "low";
  category: string;
  title: string;
  description: string;
  impact: string;
  fix: string;
  yaml?: string;
}

export default function Recommendations() {
  const { connection } = useAppContext();
  const tsdb = connection.tsdbStatus;
  const targets = connection.targets;
  const metrics = tsdb?.seriesCountByMetricName ?? [];
  const labels = tsdb?.labelValueCountByLabelName ?? [];

  const findings = useMemo<Finding[]>(() => {
    const results: Finding[] = [];

    // High cardinality metrics
    metrics.filter((m) => m.value > 10_000).forEach((m) => {
      results.push({
        id: `card-${m.name}`,
        severity: m.value > 50_000 ? "critical" : "high",
        category: "Cardinality",
        title: `High cardinality: ${m.name}`,
        description: `This metric has ${m.value.toLocaleString()} series, contributing significantly to TSDB size and memory usage.`,
        impact: `${m.value.toLocaleString()} series`,
        fix: "Consider dropping high-cardinality labels or the metric entirely.",
        yaml: `- sourceLabels: [__name__]\n  regex: "${m.name}"\n  action: drop`,
      });
    });

    // Histogram abuse
    metrics.filter((m) => m.name.endsWith("_bucket") && m.value > 5_000).forEach((m) => {
      results.push({
        id: `hist-${m.name}`,
        severity: m.value > 20_000 ? "critical" : "high",
        category: "Histograms",
        title: `Expensive histogram: ${m.name}`,
        description: `Bucket metric with ${m.value.toLocaleString()} series. Consider keeping only _sum and _count.`,
        impact: `${m.value.toLocaleString()} series from buckets alone`,
        fix: "Drop _bucket and retain _sum/_count for rate calculations.",
        yaml: `- sourceLabels: [__name__]\n  regex: "${m.name}"\n  action: drop`,
      });
    });

    // Dynamic labels
    labels.filter((l) => DYNAMIC_PATTERNS.some((p) => l.name.toLowerCase().includes(p)) && l.value > 100).forEach((l) => {
      results.push({
        id: `label-${l.name}`,
        severity: l.value > 10_000 ? "critical" : l.value > 1_000 ? "high" : "moderate",
        category: "Labels",
        title: `Dynamic label: ${l.name}`,
        description: `Label "${l.name}" has ${l.value.toLocaleString()} unique values and matches a known dynamic pattern.`,
        impact: `${l.value.toLocaleString()} unique values causing series multiplication`,
        fix: "Drop this label via metric_relabel_configs.",
        yaml: `- action: labeldrop\n  regex: "${l.name}"`,
      });
    });

    // Fast scrape intervals
    targets?.activeTargets?.forEach((t) => {
      const interval = t.scrapeInterval;
      const match = interval.match(/^(\d+)(s|ms|m)$/);
      if (match) {
        const secs = match[2] === "s" ? parseInt(match[1]) : match[2] === "ms" ? parseInt(match[1]) / 1000 : parseInt(match[1]) * 60;
        if (secs < 15) {
          const job = t.labels?.job ?? t.scrapePool;
          if (!results.find((r) => r.id === `scrape-${job}`)) {
            results.push({
              id: `scrape-${job}`,
              severity: secs < 5 ? "high" : "moderate",
              category: "Scrapes",
              title: `Fast scrape interval: ${job} (${interval})`,
              description: `Job "${job}" is scraping at ${interval}, which may cause unnecessary load.`,
              impact: "Increased CPU, memory, and TSDB write pressure",
              fix: "Consider increasing scrape interval to 30s or 60s.",
            });
          }
        }
      }
    });

    return results.sort((a, b) => {
      const order = { critical: 0, high: 1, moderate: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    });
  }, [metrics, labels, targets]);

  const [filter, setFilter] = useState<string | null>(null);
  const filtered = filter ? findings.filter((f) => f.category === filter) : findings;
  const categories = [...new Set(findings.map((f) => f.category))];

  if (!connection.isConnected) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Smart Recommendations
        </h1>
        <p className="text-muted-foreground text-sm">
          Prioritized findings with actionable remediation steps.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant={filter === null ? "default" : "outline"} size="sm" onClick={() => setFilter(null)}>
          All ({findings.length})
        </Button>
        {categories.map((c) => (
          <Button key={c} variant={filter === c ? "default" : "outline"} size="sm" onClick={() => setFilter(c)}>
            {c} ({findings.filter((f) => f.category === c).length})
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No findings detected. Your Prometheus instance looks healthy!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => (
            <FindingCard key={f.id} finding={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (finding.yaml) {
      navigator.clipboard.writeText(finding.yaml);
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const severityColors: Record<string, string> = {
    critical: "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
    high: "bg-severity-high/15 text-severity-high border-severity-high/30",
    moderate: "bg-severity-moderate/15 text-severity-moderate border-severity-moderate/30",
    low: "bg-severity-healthy/15 text-severity-healthy border-severity-healthy/30",
  };

  return (
    <Collapsible>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/30 transition-colors py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <Badge className={severityColors[finding.severity] + " text-xs shrink-0"}>
                  {finding.severity}
                </Badge>
                <Badge variant="outline" className="text-xs shrink-0">{finding.category}</Badge>
                <span className="text-sm font-medium truncate">{finding.title}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            <p className="text-sm text-muted-foreground">{finding.description}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground uppercase">Impact</span>
                <p className="font-medium">{finding.impact}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase">Suggested Fix</span>
                <p className="font-medium">{finding.fix}</p>
              </div>
            </div>
            {finding.yaml && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase">Remediation Config</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCopy}>
                    {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre className="bg-secondary/50 border border-border rounded-md p-3 text-xs font-mono overflow-x-auto">
                  {finding.yaml}
                </pre>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
