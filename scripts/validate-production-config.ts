import { validateProductionConfiguration } from "../src/lib/env";

process.stdout.write(`${JSON.stringify(validateProductionConfiguration())}\n`);
