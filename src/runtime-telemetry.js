"use strict";

// Dependency-free telemetry for the runtime:
//   - a small Prometheus registry (counters + histograms) rendered in the
//     text exposition format (version 0.0.4),
//   - runtime telemetry that observes pipeline runs and finance workflow
//     results (runs, stage durations, approvals, blocks, planner fallbacks,
//     errors), combined with the existing ledger summary (runtime-metrics),
//   - OpenTelemetry-compatible trace export: one span per pipeline stage under
//     a root run span, shaped like OTLP/JSON and correlated by run ID.

const { createHash, randomBytes } = require("node:crypto");
const { metricsFromLedger } = require("./runtime-metrics");

const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";
const DEFAULT_DURATION_BUCKETS_MS = Object.freeze([1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);
const METRIC_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function escapeLabelValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function escapeHelp(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

function formatNumber(value) {
  if (value === Infinity) return "+Inf";
  if (value === -Infinity) return "-Inf";
  if (Number.isNaN(value)) return "NaN";
  return String(value);
}

function labelKey(labelNames, labels = {}) {
  for (const key of Object.keys(labels)) {
    if (!labelNames.includes(key)) throw new TypeError(`unknown label: ${key}`);
  }
  return JSON.stringify(labelNames.map(name => (labels[name] === undefined ? "" : String(labels[name]))));
}

function renderLabels(labelNames, values, extra = []) {
  const pairs = labelNames.map((name, index) => [name, values[index]]).concat(extra);
  if (!pairs.length) return "";
  return `{${pairs.map(([name, value]) => `${name}="${escapeLabelValue(value)}"`).join(",")}}`;
}

class PrometheusRegistry {
  constructor() {
    this.metrics = new Map();
  }

  _register(type, name, help, labelNames, extra = {}) {
    if (!METRIC_NAME.test(name)) throw new TypeError(`invalid metric name: ${name}`);
    if (!Array.isArray(labelNames) || labelNames.some(label => !LABEL_NAME.test(label) || label === "le")) throw new TypeError("invalid label names");
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing.type !== type) throw new TypeError(`metric ${name} already registered as ${existing.type}`);
      return existing;
    }
    const metric = { type, name, help: String(help || name), labelNames: [...labelNames], series: new Map(), ...extra };
    this.metrics.set(name, metric);
    return metric;
  }

  counter(name, help, labelNames = []) {
    const metric = this._register("counter", name, help, labelNames);
    return Object.freeze({
      inc: (labels = {}, value = 1) => {
        if (!Number.isFinite(value) || value < 0) throw new TypeError("counter increments must be non-negative");
        const key = labelKey(metric.labelNames, labels);
        metric.series.set(key, (metric.series.get(key) || 0) + value);
      },
      get: (labels = {}) => metric.series.get(labelKey(metric.labelNames, labels)) || 0,
    });
  }

  histogram(name, help, labelNames = [], buckets = DEFAULT_DURATION_BUCKETS_MS) {
    const sorted = [...buckets].map(Number).sort((a, b) => a - b);
    if (!sorted.length || sorted.some(bucket => !Number.isFinite(bucket))) throw new TypeError("buckets must be finite numbers");
    const metric = this._register("histogram", name, help, labelNames, { buckets: sorted });
    return Object.freeze({
      observe: (labels = {}, value) => {
        if (!Number.isFinite(value) || value < 0) throw new TypeError("observations must be non-negative numbers");
        const key = labelKey(metric.labelNames, labels);
        const series = metric.series.get(key) || { counts: metric.buckets.map(() => 0), sum: 0, count: 0 };
        metric.buckets.forEach((bucket, index) => { if (value <= bucket) series.counts[index] += 1; });
        series.sum += value;
        series.count += 1;
        metric.series.set(key, series);
      },
      get: (labels = {}) => metric.series.get(labelKey(metric.labelNames, labels)) || null,
    });
  }

  render() {
    const lines = [];
    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${escapeHelp(metric.help)}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);
      const entries = [...metric.series.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      for (const [key, value] of entries) {
        const labelValues = JSON.parse(key);
        if (metric.type === "counter") {
          lines.push(`${metric.name}${renderLabels(metric.labelNames, labelValues)} ${formatNumber(value)}`);
          continue;
        }
        metric.buckets.forEach((bucket, index) => {
          lines.push(`${metric.name}_bucket${renderLabels(metric.labelNames, labelValues, [["le", formatNumber(bucket)]])} ${value.counts[index]}`);
        });
        lines.push(`${metric.name}_bucket${renderLabels(metric.labelNames, labelValues, [["le", "+Inf"]])} ${value.count}`);
        lines.push(`${metric.name}_sum${renderLabels(metric.labelNames, labelValues)} ${formatNumber(value.sum)}`);
        lines.push(`${metric.name}_count${renderLabels(metric.labelNames, labelValues)} ${value.count}`);
      }
    }
    return lines.length ? `${lines.join("\n")}\n` : "";
  }
}

function renderLedgerGauges(ledger) {
  const summary = metricsFromLedger(ledger);
  const gauge = (name, help, samples) => [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} gauge`,
    ...samples.map(([labels, value]) => `${name}${labels} ${formatNumber(value)}`),
  ];
  return [
    ...gauge("opspilot_ledger_runs", "Completed runs retained in the execution ledger, by status.", [
      ['{status="success"}', summary.successful],
      ['{status="failed"}', summary.failed],
      ['{status="skipped"}', summary.skipped],
    ]),
    ...gauge("opspilot_ledger_verified_runs", "Retained ledger runs whose result passed verification.", [["", summary.verified]]),
    ...gauge("opspilot_ledger_retry_attempts", "Execution attempts recorded across retained ledger runs.", [["", summary.retryAttempts]]),
    ...gauge("opspilot_ledger_duration_ms", "Total stage duration across retained ledger runs, in milliseconds.", [["", summary.durationMs]]),
  ].join("\n") + "\n";
}

function createRuntimeTelemetry({ registry = new PrometheusRegistry(), buckets = DEFAULT_DURATION_BUCKETS_MS } = {}) {
  if (!(registry instanceof PrometheusRegistry)) throw new TypeError("registry must be a PrometheusRegistry");
  const runs = registry.counter("opspilot_runs_total", "Pipeline runs observed, by result status.", ["status"]);
  const stageDuration = registry.histogram("opspilot_stage_duration_ms", "Pipeline stage duration in milliseconds.", ["stage", "status"], buckets);
  const approvals = registry.counter("opspilot_approvals_total", "Human-approval events, by source and status.", ["source", "status"]);
  const blocks = registry.counter("opspilot_blocks_total", "Runs or requests stopped before execution, by reason.", ["reason"]);
  const fallbacks = registry.counter("opspilot_planner_fallbacks_total", "LLM planner fallbacks to the deterministic planner, by reason.", ["reason"]);
  const errors = registry.counter("opspilot_errors_total", "Errors observed, by error code.", ["code"]);
  const attempts = registry.counter("opspilot_execution_attempts_total", "Tool execution attempts, including retries.");

  // Tolerant by design: the HTTP server may observe partial or custom results.
  function observeRun(run) {
    if (!run || typeof run !== "object") return;
    const status = run.result?.status || run.status || "unknown";
    runs.inc({ status });
    for (const stage of Array.isArray(run.observability?.stages) ? run.observability.stages : []) {
      const durationMs = Number(stage.durationMs);
      if (typeof stage.stage === "string" && Number.isFinite(durationMs) && durationMs >= 0) {
        stageDuration.observe({ stage: stage.stage, status: String(stage.status || "unknown") }, durationMs);
      }
    }
    const attemptCount = Array.isArray(run.result?.attempts) ? run.result.attempts.length : Number(run.observability?.stages?.find?.(stage => stage.stage === "execute")?.metadata?.attempts) || 0;
    if (attemptCount > 0) attempts.inc({}, attemptCount);
    const screening = run.screening;
    if (screening && screening.decision === "block") blocks.inc({ reason: "injection_screening" });
    if (screening && screening.decision === "require_approval") {
      const approved = run.result?.status !== "skipped" || !/^human approval required/.test(String(run.result?.reason || ""));
      approvals.inc({ source: "injection_screening", status: approved ? "granted" : "required" });
      if (!approved) blocks.inc({ reason: "approval_required" });
    }
    const reason = String(run.result?.reason || "");
    if (run.result?.status === "skipped" && reason && !/^blocked: |^human approval required/.test(reason)) blocks.inc({ reason: "authorization" });
    const fallbackReason = run.plan?.planner?.fallbackReason;
    if (run.plan?.planner && fallbackReason) fallbacks.inc({ reason: fallbackReason });
    if (run.result?.status === "failed") errors.inc({ code: run.result.error?.code || "RUNTIME_UNCLASSIFIED" });
  }

  function observeFinanceResult(result) {
    if (!result || typeof result.status !== "string") return;
    if (result.status === "blocked") blocks.inc({ reason: "finance_policy" });
    if (result.status === "pending") approvals.inc({ source: "finance", status: "required" });
    if (result.status === "rejected") approvals.inc({ source: "finance", status: "rejected" });
    if (result.status === "prepared" && result.decision?.decision === "requires_approval") approvals.inc({ source: "finance", status: "granted" });
    if (result.runtime) observeRun(result.runtime);
  }

  function observeError(error) {
    errors.inc({ code: (error && (error.code || error.name)) || "RUNTIME_UNCLASSIFIED" });
  }

  function renderMetrics({ ledger = null } = {}) {
    const body = registry.render();
    return ledger ? body + renderLedgerGauges(ledger) : body;
  }

  return Object.freeze({ registry, observeRun, observeFinanceResult, observeError, renderMetrics, contentType: PROMETHEUS_CONTENT_TYPE });
}

// ---- Trace export (OTLP/JSON-shaped) --------------------------------------

const SPAN_KIND_INTERNAL = 1;
const STATUS_OK = 1;
const STATUS_ERROR = 2;

// Deterministic trace id per run so spans from every component that knows the
// run ID correlate without passing extra context around.
function traceIdForRun(runId) {
  return createHash("sha256").update(`opspilot:${runId}`).digest("hex").slice(0, 32);
}

function newSpanId() {
  return randomBytes(8).toString("hex");
}

function toUnixNano(ms) {
  return (BigInt(Math.round(ms)) * 1000000n).toString();
}

function attribute(key, value) {
  if (typeof value === "boolean") return { key, value: { boolValue: value } };
  if (typeof value === "number" && Number.isInteger(value)) return { key, value: { intValue: String(value) } };
  if (typeof value === "number") return { key, value: { doubleValue: value } };
  return { key, value: { stringValue: String(value) } };
}

function resourceEnvelope(spans, { serviceName = "opspilot", serviceVersion = "0.1.0" } = {}) {
  return {
    resourceSpans: [{
      resource: { attributes: [attribute("service.name", serviceName), attribute("service.version", serviceVersion)] },
      scopeSpans: [{ scope: { name: "opspilot.runtime", version: serviceVersion }, spans }],
    }],
  };
}

// Build OTLP-shaped spans for a pipeline run: a root `opspilot.run` span and
// one child span per stage. Uses recorded stage timings when available and
// otherwise lays stages out sequentially from their durations.
function buildRunSpans(run, { now = Date.now(), serviceName, serviceVersion } = {}) {
  if (!run || typeof run !== "object") throw new TypeError("run must be an object");
  const runId = typeof run.runId === "string" && run.runId ? run.runId : null;
  if (!runId) throw new TypeError("run.runId is required for trace correlation");
  const stages = Array.isArray(run.observability?.stages) ? run.observability.stages : [];
  const timings = Array.isArray(run.observability?.timings) ? run.observability.timings : [];
  const traceId = traceIdForRun(runId);
  const rootSpanId = newSpanId();
  const totalMs = stages.reduce((sum, stage) => sum + Math.max(0, Number(stage.durationMs) || 0), 0);
  let cursor = Number.isFinite(Number(timings[0]?.startedAtMs)) ? Number(timings[0].startedAtMs) : now - totalMs;
  const rootStart = cursor;
  const children = stages.map((stage, index) => {
    const timing = timings[index] && timings[index].stage === stage.stage ? timings[index] : null;
    const start = timing ? Number(timing.startedAtMs) : cursor;
    const end = timing ? Number(timing.finishedAtMs) : start + Math.max(0, Number(stage.durationMs) || 0);
    cursor = end;
    const attributes = [attribute("opspilot.run_id", runId), attribute("opspilot.stage", stage.stage), attribute("opspilot.stage.status", stage.status)];
    if (stage.metadata?.authorization) attributes.push(attribute("opspilot.authorization.allowed", Boolean(stage.metadata.authorization.allowed)));
    if (Number.isFinite(stage.metadata?.attempts)) attributes.push(attribute("opspilot.execution.attempts", stage.metadata.attempts));
    if (stage.metadata?.planner?.source) attributes.push(attribute("opspilot.planner.source", stage.metadata.planner.source));
    if (stage.metadata?.screening?.decision) attributes.push(attribute("opspilot.screening.decision", stage.metadata.screening.decision));
    return {
      traceId,
      spanId: newSpanId(),
      parentSpanId: rootSpanId,
      name: `opspilot.stage.${stage.stage}`,
      kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: toUnixNano(start),
      endTimeUnixNano: toUnixNano(end),
      attributes,
      status: stage.status === "failed" ? { code: STATUS_ERROR, message: `${stage.stage} failed` } : { code: STATUS_OK },
    };
  });
  const status = run.result?.status || "unknown";
  const rootAttributes = [attribute("opspilot.run_id", runId), attribute("opspilot.result.status", status)];
  if (typeof run.verification?.valid === "boolean") rootAttributes.push(attribute("opspilot.verified", run.verification.valid));
  if (run.result?.reason) rootAttributes.push(attribute("opspilot.skip_reason", run.result.reason));
  const root = {
    traceId,
    spanId: rootSpanId,
    name: "opspilot.run",
    kind: SPAN_KIND_INTERNAL,
    startTimeUnixNano: toUnixNano(rootStart),
    endTimeUnixNano: toUnixNano(Math.max(cursor, rootStart)),
    attributes: rootAttributes,
    status: status === "failed" ? { code: STATUS_ERROR, message: run.result?.error?.message || "run failed" } : { code: STATUS_OK },
  };
  return resourceEnvelope([root, ...children], { serviceName, serviceVersion });
}

// Convert spans recorded with the existing RuntimeTrace helper to OTLP shape.
function exportRuntimeTraceOtlp(trace, { runId = null, serviceName, serviceVersion } = {}) {
  if (!trace || typeof trace.export !== "function") throw new TypeError("trace must expose export()");
  const exported = trace.export();
  const traceId = runId ? traceIdForRun(runId) : String(exported.traceId).replace(/-/g, "").padEnd(32, "0").slice(0, 32);
  const spans = exported.spans.map(span => ({
    traceId,
    spanId: String(span.spanId).replace(/-/g, "").slice(0, 16),
    name: span.name,
    kind: SPAN_KIND_INTERNAL,
    startTimeUnixNano: toUnixNano(new Date(span.startedAt).getTime()),
    endTimeUnixNano: toUnixNano(new Date(span.finishedAt || span.startedAt).getTime()),
    attributes: [
      ...(runId ? [attribute("opspilot.run_id", runId)] : []),
      ...Object.entries(span.metadata || {}).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).map(([key, value]) => attribute(`opspilot.${key}`, value)),
    ],
    status: span.status === "failed" ? { code: STATUS_ERROR, message: span.error || "failed" } : { code: STATUS_OK },
  }));
  return resourceEnvelope(spans, { serviceName, serviceVersion });
}

// JSON-lines exporter: one OTLP/JSON document per run, written through an
// injectable `write` (e.g. a file stream or stdout). Offline, no collector.
function createJsonLinesTraceExporter({ write, serviceName, serviceVersion } = {}) {
  if (typeof write !== "function") throw new TypeError("write must be a function");
  return Object.freeze({
    exportRun(run) {
      const document = buildRunSpans(run, { serviceName, serviceVersion });
      write(`${JSON.stringify(document)}\n`);
      return document;
    },
  });
}

module.exports = {
  PROMETHEUS_CONTENT_TYPE,
  DEFAULT_DURATION_BUCKETS_MS,
  PrometheusRegistry,
  createRuntimeTelemetry,
  renderLedgerGauges,
  traceIdForRun,
  buildRunSpans,
  exportRuntimeTraceOtlp,
  createJsonLinesTraceExporter,
};
