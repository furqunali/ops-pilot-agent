"use strict";

// Shared presentation helper for the runnable example scenarios.
//
// Every scenario funnels its work through the real five-stage pipeline and ends
// with a flattened runtime-report (see src/runtime-report.js). This renders that
// report as a human-readable block so `node examples/<name>.js` prints something
// legible instead of a raw object dump. It performs no I/O and mutates nothing.

function renderReport(report, { title } = {}) {
  if (!report || typeof report !== "object") {
    throw new TypeError("report must be an object");
  }
  const lines = [];
  if (title) {
    lines.push(title);
    lines.push("=".repeat(title.length));
  }
  lines.push(`task     : ${report.task}`);
  lines.push(`status   : ${report.status}`);
  lines.push(`verified : ${report.verified}`);
  if (report.error) lines.push(`error    : ${report.error}`);
  lines.push("output   :");
  lines.push(indent(stringify(report.output), 2));

  if (Array.isArray(report.steps) && report.steps.length) {
    lines.push("steps    :");
    for (const step of report.steps) {
      lines.push(`  ${step.id}. ${step.action.padEnd(8)} [${step.status}]`);
    }
  }
  if (Array.isArray(report.audit) && report.audit.length) {
    lines.push(`audit    : ${report.audit.map(event => `${event.stage}:${event.status}`).join(" ")}`);
  }
  return lines.join("\n");
}

function stringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return String(text)
    .split("\n")
    .map(line => pad + line)
    .join("\n");
}

module.exports = { renderReport };
