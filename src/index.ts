#!/usr/bin/env bun
import { main } from "./cli/main";

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
