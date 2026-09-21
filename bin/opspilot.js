#!/usr/bin/env node
"use strict";

const { runCli } = require("../src/cli-runner");

const { code } = runCli(process.argv.slice(2));
process.exitCode = code;
