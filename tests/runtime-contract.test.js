const test=require("node:test"); const assert=require("node:assert/strict"); const {validateRuntimeRun}=require("../src/runtime-contract");
test("accepts a complete runtime run",()=>assert.equal(validateRuntimeRun({task:{input:"x"},result:{status:"success"},verification:{valid:true},audit:[]}),true));
test("rejects incomplete runtime runs",()=>assert.throws(()=>validateRuntimeRun({task:{input:"x"}}),/result.status/));
