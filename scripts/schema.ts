import * as fs from "node:fs";
import { configSchemaJson } from "../src/config";

fs.writeFileSync(
  "schema.json",
  `${JSON.stringify(configSchemaJson(), null, 2)}\n`,
);
