#!/usr/bin/env bun
import { configSchemaJson } from "../src/config";

await Bun.write(
  "schema.json",
  `${JSON.stringify(configSchemaJson(), null, 2)}\n`,
);
