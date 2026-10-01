"use strict";

function validatePolicyDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new TypeError("document must be an object");
  if (typeof document.id !== "string" || !document.id.trim()) throw new TypeError("document.id must be a non-empty string");
  if (typeof document.title !== "string" || !document.title.trim()) throw new TypeError("document.title must be a non-empty string");
  if (typeof document.text !== "string" || !document.text.trim()) throw new TypeError("document.text must be a non-empty string");
  return true;
}

function createPolicyKnowledge(documents = []) {
  if (!Array.isArray(documents)) throw new TypeError("documents must be an array");
  documents.forEach(validatePolicyDocument);
  const items = documents.map(document => Object.freeze({ ...document }));

  return Object.freeze({
    list() {
      return items.slice();
    },
    search(query) {
      if (typeof query !== "string" || !query.trim()) return [];
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      return items.filter(document => terms.every(term =>
        [document.id, document.title, document.text].some(value => value.toLowerCase().includes(term)),
      ));
    },
  });
}

module.exports = { validatePolicyDocument, createPolicyKnowledge };
