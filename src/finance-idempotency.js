"use strict";

// Idempotent wrapper around the Finance reference workflow.
//
// A payment-preparation request that carries an idempotency key prepares at
// most once: a retry with the same key and payment returns the original
// outcome and records a `finance.execution_replayed` audit event; the same key
// with a different payment is rejected with RUNTIME_IDEMPOTENCY_CONFLICT.
// Only terminal outcomes are remembered (prepared / blocked / rejected), so a
// request that is pending approval can be retried with the same key once the
// approval is available.

const { runFinanceWorkflow } = require("./finance-reference-workflow");
const { createFinanceAuditEvent, EVENT_TYPES } = require("./finance-audit");
const { recordFinanceAudit } = require("./finance-ledger");

const TERMINAL_STATUSES = Object.freeze(["prepared", "blocked", "rejected", "already_prepared"]);
const SCOPE = "finance.prepare_payment";

function summarizeFinanceResult(result, runId) {
  return {
    status: result.status,
    decision: result.decision ?? null,
    payment: result.payment ?? null,
    approval: result.approval ?? null,
    runId: result.runtime?.runId ?? runId ?? null,
    priorRunId: result.priorRunId ?? null,
  };
}

async function runFinanceWorkflowIdempotent({ idempotencyKey = null, idempotencyStore, ...options } = {}) {
  if (!idempotencyStore || typeof idempotencyStore.execute !== "function") throw new TypeError("idempotencyStore must expose execute()");
  if (idempotencyKey === null || idempotencyKey === undefined) {
    return Object.freeze({ ...runFinanceWorkflow(options), idempotency: null });
  }
  const tenantId = options.tenantId ?? null;
  const scope = tenantId ? `${SCOPE}:${tenantId}` : SCOPE;
  // The fingerprint covers what the caller asked for. Approval decisions are
  // deliberately excluded so a pending request can be completed with the
  // same key once a reviewer has decided.
  const payload = { payment: options.payment ?? null, tenantId, requesterId: options.requesterId ?? null };
  const outcome = await idempotencyStore.execute(idempotencyKey, payload, () => runFinanceWorkflow(options), {
    scope,
    shouldStore: result => TERMINAL_STATUSES.includes(result?.status),
    serialize: result => summarizeFinanceResult(result, options.runId),
  });
  if (outcome.replayed && options.ledger && typeof options.ledger.append === "function") {
    recordFinanceAudit(options.ledger, createFinanceAuditEvent(EVENT_TYPES.EXECUTION_REPLAYED, {
      idempotencyKey,
      tenantId,
      status: outcome.result?.status ?? null,
      priorRunId: outcome.result?.runId ?? null,
    }, options.runId ?? null));
  }
  return Object.freeze({
    ...outcome.result,
    idempotency: Object.freeze({ key: idempotencyKey, scope, replayed: outcome.replayed, stored: outcome.replayed ? true : outcome.stored }),
  });
}

module.exports = { TERMINAL_STATUSES, summarizeFinanceResult, runFinanceWorkflowIdempotent };
