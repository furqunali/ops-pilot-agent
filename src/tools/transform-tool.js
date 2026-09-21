"use strict";

// Data-transform tool for OpsPilot.
//
// Turns a declarative transform spec into a tool-contract compliant tool that
// reshapes structured records (a single object, or an array of objects). It is
// built on two existing runtime modules:
//   - result-normalizer  -> normalizeOutput cleans transformed values into a
//                            deterministic, JSON-safe shape.
//   - data-redaction      -> redact strips sensitive fields on request.
//
// Supported operations (applied in this order):
//   1. filter  -> drop records that do not match a predicate object / function.
//   2. rename  -> rename keys in place ({ from: to }), other keys untouched.
//   3. map     -> field map: project into a new record ({ outKey: inKey }); when
//                 present only the mapped keys survive.
//   4. redact  -> redact sensitive keys via the data-redaction module.

const { normalizeOutput } = require("../result-normalizer");
const { redact } = require("../data-redaction");
const { validateTool } = require("../tool-contract");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertStringMap(value, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be an object`);
  for (const [key, mapped] of Object.entries(value)) {
    if (typeof mapped !== "string" || !mapped.trim()) {
      throw new TypeError(`${label}.${key} must map to a non-empty string`);
    }
  }
}

function validateSpec(spec) {
  if (!isPlainObject(spec)) throw new TypeError("spec must be an object");
  if (spec.name !== undefined && (typeof spec.name !== "string" || !spec.name.trim())) {
    throw new TypeError("spec.name must be a non-empty string");
  }
  if (spec.rename !== undefined) assertStringMap(spec.rename, "spec.rename");
  if (spec.map !== undefined) assertStringMap(spec.map, "spec.map");
  if (spec.filter !== undefined && typeof spec.filter !== "function" && !isPlainObject(spec.filter)) {
    throw new TypeError("spec.filter must be a function or an object");
  }
  if (spec.redact !== undefined && typeof spec.redact !== "boolean" && !isPlainObject(spec.redact)) {
    throw new TypeError("spec.redact must be a boolean or an options object");
  }
  return spec;
}

function matchesFilter(record, filter) {
  if (typeof filter === "function") return Boolean(filter(record));
  return Object.entries(filter).every(([key, expected]) => record[key] === expected);
}

function applyRename(record, rename) {
  const output = {};
  for (const [key, value] of Object.entries(record)) {
    output[Object.prototype.hasOwnProperty.call(rename, key) ? rename[key] : key] = value;
  }
  return output;
}

function applyMap(record, map) {
  const output = {};
  for (const [target, source] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(record, source)) output[target] = record[source];
  }
  return output;
}

function applyRedact(record, redactOpt) {
  const options = isPlainObject(redactOpt) ? redactOpt : {};
  return redact(record, options);
}

function transformRecord(record, spec) {
  if (!isPlainObject(record)) throw new TypeError("each record must be a plain object");
  let output = record;
  if (spec.rename) output = applyRename(output, spec.rename);
  if (spec.map) output = applyMap(output, spec.map);
  if (spec.redact) output = applyRedact(output, spec.redact);
  return output;
}

// Core transform. Accepts a single record or an array of records and returns the
// same cardinality it was given, normalized into a JSON-safe shape.
function transform(data, spec) {
  validateSpec(spec);
  const isArray = Array.isArray(data);
  if (!isArray && !isPlainObject(data)) {
    throw new TypeError("data must be an object or an array of objects");
  }
  let records = isArray ? data : [data];
  if (spec.filter) records = records.filter(record => matchesFilter(record, spec.filter));
  const transformed = records.map(record => transformRecord(record, spec));
  const result = isArray ? transformed : (transformed[0] ?? null);
  return normalizeOutput(result);
}

// Build a tool-contract compliant tool from a spec. execute() accepts either a
// JSON string (as the tool-executor supplies) or an already-parsed value.
function createTransformTool(spec = {}) {
  validateSpec(spec);
  const tool = {
    name: spec.name && spec.name.trim() ? spec.name.trim() : "transform",
    capabilities: ["read"],
    execute(input) {
      const data = typeof input === "string" ? JSON.parse(input) : input;
      return transform(data, spec);
    },
  };
  validateTool(tool);
  return tool;
}

// Register a transform tool into an existing ToolRegistry instance.
function registerTransformTool(registry, spec = {}) {
  if (!registry || typeof registry.register !== "function") {
    throw new TypeError("registry must expose a register(tool) method");
  }
  const tool = createTransformTool(spec);
  registry.register(tool);
  return tool;
}

module.exports = {
  transform,
  createTransformTool,
  registerTransformTool,
  validateSpec,
};
