"use strict";

function validateKnowledge(knowledge) {
  if (!knowledge || typeof knowledge.search !== "function") {
    throw new TypeError("knowledge must expose search()");
  }
}

function attachPolicyEvidence(decision, knowledge, query) {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    throw new TypeError("decision must be an object");
  }
  validateKnowledge(knowledge);
  if (typeof query !== "string" || !query.trim()) {
    throw new TypeError("query must be a non-empty string");
  }

  const matches = knowledge.search(query.trim());
  if (!Array.isArray(matches)) throw new TypeError("knowledge.search() must return an array");

  const evidence = matches.map(document => ({
    id: document.id,
    title: document.title,
  }));

  return Object.freeze({
    ...decision,
    evidence,
    evidenceQuery: query.trim(),
  });
}

module.exports = { attachPolicyEvidence };
