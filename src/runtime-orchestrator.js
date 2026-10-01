const { runTaskPipeline } = require("./runtime-pipeline");

function runTask(input, tool = null, options = {}) {
  return runTaskPipeline(input, tool, options);
}

module.exports = { runTask };
