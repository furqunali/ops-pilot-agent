const { runTaskPipeline } = require("./runtime-pipeline");

function runTask(input, tool = null) {
  return runTaskPipeline(input, tool);
}

module.exports = { runTask };
