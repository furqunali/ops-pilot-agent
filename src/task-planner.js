const { Task } = require("./task-model");

function planTask(input) {
  const task = input instanceof Task ? input : new Task(input);
  return {
    task: task.input,
    steps: [
      { id: 1, action: "parse", status: "ready" },
      { id: 2, action: "plan", status: "ready" },
      { id: 3, action: "execute", status: "requires-tool" },
      { id: 4, action: "verify", status: "pending" },
      { id: 5, action: "report", status: "pending" },
    ],
  };
}

module.exports = { planTask };
