const VALID_STATUSES = new Set(["ready", "requires-tool", "pending"]);

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.steps)) throw new TypeError("plan.steps must be an array");
  if (plan.steps.length === 0) throw new TypeError("plan.steps must not be empty");
  for (const step of plan.steps) {
    if (!Number.isInteger(step.id) || step.id < 1) throw new TypeError("step.id must be a positive integer");
    if (typeof step.action !== "string" || !step.action.trim()) throw new TypeError("step.action must be non-empty");
    if (!VALID_STATUSES.has(step.status)) throw new TypeError("step.status is invalid");
  }
  return true;
}

function authorizeExecution(plan, tool) {
  validatePlan(plan);
  const executionStep = plan.steps.find(step => step.action === "execute");
  if (!executionStep) return { allowed: false, reason: "execution step missing" };
  if (executionStep.status !== "requires-tool") return { allowed: false, reason: "execution step is not awaiting a tool" };
  if (!tool) return { allowed: false, reason: "tool is required" };
  return { allowed: true, reason: null };
}

module.exports = { validatePlan, authorizeExecution };
