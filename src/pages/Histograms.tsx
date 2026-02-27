import { useAppContext } from "@/lib/store";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, Copy, Check } from "lucide-react";
import { PageHelp, histogramsHelp } from "@/components/PageHelp";
import { useState, useMemo } from "react";
import { toast } from "@/hooks/use-toast";

export default function Histograms() {
  const { connection } = useAppContext();
  const tsdb = connection.tsdbStatus;
  const metrics = tsdb?.seriesCountByMetricName ?? [];

  // Detect bucket metrics
  const bucketMetrics = useMemo(() => {
    return metrics
      .filter((m) => m.name.endsWith("_bucket"))
      .map((m) => {
        const baseName = m.name.replace(/_bucket$/, "");
        const sumMetric = metrics.find((x) => x.name === `${baseName}_sum`);
        const countMetric = metrics.find((x) => x.name === `${baseName}_count`);
        const bucketSeries = m.value;
        const sumSeries = sumMetric?.value ?? 0;
        const countSeries = countMetric?.value ?? 0;
        const estimatedBuckets = sumSeries > 0 ? Math.round(bucketSeries / sumSeries) : 0;
        const savingsPercent = bucketSeries > 0 ? Math.round(((bucketSeries - sumSeries - countSeries) / (bucketSeries + sumSeries + countSeries)) * 100) : 0;

        // Risk score: higher is worse
        const riskScore = Math.min(100, Math.round((bucketSeries / 1000) * (estimatedBuckets / 10) * 5));

        return {
          name: m.name,
          baseName,
          bucketSeries,
          sumSeries,
          countSeries,
          estimatedBuckets,
          savingsPercent,
          riskScore,
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [metrics]);

  if (!connection.isConnected) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-6 w-6 text-severity-histogram" />
            Histogram Abuse Detection
          </h1>
          <p className="text-muted-foreground text-sm">
            Detects excessive bucket metrics and estimates ingestion savings.
          </p>
        </div>
        <PageHelp {...histogramsHelp} />
      </div>

      {bucketMetrics.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No <code className="font-mono">_bucket</code> metrics found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {bucketMetrics.map((h) => (
            <HistogramCard key={h.name} histogram={h} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistogramCard({ histogram }: { histogram: any }) {
  const [copied, setCopied] = useState(false);

  const yaml = `- sourceLabels: [__name__]
  regex: "${histogram.baseName}_bucket"
  action: drop`;

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml);
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const severityLevel = histogram.riskScore > 70 ? "critical" : histogram.riskScore > 40 ? "moderate" : "healthy";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-mono">{histogram.name}</CardTitle>
          <RiskBadge score={histogram.riskScore} />
        </div>
        <CardDescription>Base: {histogram.baseName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground text-xs uppercase">Bucket Series</span>
            <p className="font-mono font-medium">{histogram.bucketSeries.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase">Est. Buckets</span>
            <p className="font-mono font-medium">{histogram.estimatedBuckets}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase">Sum/Count Series</span>
            <p className="font-mono font-medium">{(histogram.sumSeries + histogram.countSeries).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase">Savings if Dropped</span>
            <p className={`font-mono font-medium ${histogram.savingsPercent > 50 ? "text-severity-critical" : "text-severity-moderate"}`}>
              ~{histogram.savingsPercent}%
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase">Drop Relabeling Config</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="bg-secondary/50 border border-border rounded-md p-3 text-xs font-mono overflow-x-auto">
            {yaml}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

function RiskBadge({ score }: { score: number }) {
  if (score > 70)
    return <Badge className="bg-severity-critical/15 text-severity-critical border-severity-critical/30">Risk: {score}</Badge>;
  if (score > 40)
    return <Badge className="bg-severity-moderate/15 text-severity-moderate border-severity-moderate/30">Risk: {score}</Badge>;
  return <Badge className="bg-severity-healthy/15 text-severity-healthy border-severity-healthy/30">Risk: {score}</Badge>;
}
