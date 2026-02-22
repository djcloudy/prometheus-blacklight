
# Prometheus Blacklight — Implementation Plan

## Overview
A forensic performance analyzer for Prometheus instances. Dark-mode-first, precision-engineered UI that connects directly to Prometheus APIs and surfaces cardinality, churn, histogram abuse, and scrape inefficiency — with an interactive simulation engine.

## Design System
- **Dark mode default** with a hacker-meets-Linear aesthetic — deep charcoal backgrounds, sharp typography, high-contrast data
- **Severity color system**: Red (critical/high cardinality), Amber (moderate), Green (healthy), Purple (histogram abuse), Orange (churn risk)
- **Sidebar navigation** with icon + label for each analysis module
- **Data-dense layouts**: sortable tables, expandable drill-downs, copyable code snippets

## Connection Setup
- **Endpoint configuration page**: Enter Prometheus base URL + optional basic auth credentials
- **Direct browser API calls** to Prometheus (assumes CORS-friendly or same-network access)
- **Connection health check** on connect — validates `/api/v1/status/tsdb`, `/api/v1/targets`, `/api/v1/status/config`
- Credentials stored in session/local storage only

## Feature 1: Overview Dashboard
- Pull TSDB status, target summary, and config on connect
- Display: total series count, sample ingestion rate, active targets, scrape intervals in use
- **Health summary cards** with severity-coded scores for cardinality, churn, histograms, and scrape efficiency
- Quick-link cards to each analysis module with top finding previews

## Feature 2: High Cardinality Analysis
- Query top metrics by series count, top labels by cardinality, top label values
- **Cardinality Multiplier Tree**: Interactive expandable tree showing how labels multiply series (e.g., `http_client_duration_bucket × service_name(3) × url(248) × ...= 80,640`)
- **Treemap visualization** of metric family impact using Recharts
- Per-job and per-namespace breakdown tables with sorting and filtering
- Severity badges on each metric

## Feature 3: Histogram Abuse Detector
- Auto-detect `_bucket` metrics with excessive dimensions or bucket counts
- **Histogram Risk Score** per metric with severity rating
- Show estimated ingestion savings if `_bucket` is dropped (keep `_sum`/`_count`)
- Flag high-cardinality labels applied to histograms
- Copyable `metricRelabelings` YAML to drop problematic buckets

## Feature 4: Label Churn & Explosion Detection
- Detect dynamic/unbounded labels matching patterns: `url`, `id`, `uuid`, `path`, `session`, `pod`, `pid`
- **Churn Risk Index** per label
- Show label value counts and flag unbounded growth
- Suggest `labeldrop` rules or OTel processor configs
- Copyable remediation snippets

## Feature 5: Scrape Efficiency Analyzer
- Analyze `scrape_duration_seconds`, `scrape_samples_post_metric_relabeling`, `scrape_series_added`
- Detect: targets scraping too fast, high scrape duration ratios, duplicate scraping
- **Scrape Optimization Score** per job
- Recommended interval adjustments with estimated resource savings
- Table with all targets, sortable by efficiency metrics

## Feature 6: "What If" Simulation Engine
- Interactive tool to simulate dropping a label, dropping `_bucket`, increasing scrape interval, or removing a metric family
- Estimate: % series reduction, % samples/sec reduction, directional WAL/TSDB impact
- Before/after comparison view
- Stack multiple simulations to see cumulative impact

## Feature 7: Smart Diagnostics & Recommendations
- Rules engine that runs across all analysis areas and produces a prioritized findings list
- Each finding: Severity badge, description of why it matters, estimated impact, suggested fix
- Copyable YAML/PromQL snippets for each recommendation
- Filterable by severity and category

## Feature 8: Performance Impact Estimator
- Estimate current resource footprint: samples/sec, CPU cost proxy, memory usage estimate, TSDB growth rate
- Based on series count × scrape interval × label multiplicity
- Show on overview and as context within each analysis view

## Data Persistence
- Save recent analyses, endpoint configs, and simulation results to **browser local storage**
- Quick re-connect to previously analyzed endpoints
- No backend database required

## Navigation Structure
Sidebar with sections:
1. **Connect** — endpoint setup
2. **Overview** — health dashboard
3. **Cardinality** — high cardinality analysis
4. **Histograms** — histogram abuse detection
5. **Labels** — churn & explosion detection
6. **Scrapes** — scrape efficiency
7. **Simulate** — what-if engine
8. **Recommendations** — aggregated findings

## Technical Approach
- React + TypeScript + Tailwind (dark mode)
- Recharts for treemaps, heatmaps, and charts
- Direct fetch calls to Prometheus HTTP API
- PromQL queries built and executed client-side
- Local storage for persistence
- No backend required for V1
