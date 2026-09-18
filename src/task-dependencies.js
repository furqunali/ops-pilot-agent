"use strict";

function normalizeDependencyMap(dependencies = {}) {
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
    throw new TypeError("dependencies must be an object");
  }
  const output = {};
  for (const [taskId, parents] of Object.entries(dependencies)) {
    if (!Array.isArray(parents)) throw new TypeError(`dependencies for ${taskId} must be an array`);
    output[taskId] = [...new Set(parents.map(String))];
  }
  return output;
}

function detectCycles(dependencies) {
  const graph = normalizeDependencyMap(dependencies);
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function visit(node, path) {
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      cycles.push(path.slice(start).concat(node));
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const parent of graph[node] || []) visit(parent, path.concat(parent));
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of Object.keys(graph)) visit(node, [node]);
  return cycles;
}

function topologicalOrder(dependencies) {
  const graph = normalizeDependencyMap(dependencies);
  const cycles = detectCycles(graph);
  if (cycles.length) throw new Error(`dependency cycle detected: ${cycles[0].join(" -> ")}`);
  const nodes = new Set(Object.keys(graph));
  for (const parents of Object.values(graph)) for (const parent of parents) nodes.add(parent);

  const indegree = new Map([...nodes].map(node => [node, 0]));
  const children = new Map([...nodes].map(node => [node, []]));
  for (const [node, parents] of Object.entries(graph)) {
    for (const parent of parents) {
      indegree.set(node, indegree.get(node) + 1);
      children.get(parent).push(node);
    }
  }

  const ready = [...nodes].filter(node => indegree.get(node) === 0).sort();
  const result = [];
  while (ready.length) {
    const node = ready.shift();
    result.push(node);
    for (const child of children.get(node)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) ready.push(child);
    }
    ready.sort();
  }
  return result;
}

function dependencyStatus(taskId, completed, dependencies) {
  const graph = normalizeDependencyMap(dependencies);
  const parents = graph[taskId] || [];
  const completedSet = new Set(completed || []);
  return {
    ready: parents.every(parent => completedSet.has(parent)),
    dependencies: parents,
    missing: parents.filter(parent => !completedSet.has(parent)),
  };
}

module.exports = { normalizeDependencyMap, detectCycles, topologicalOrder, dependencyStatus };
