import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { next } from "@agenthub/eslint-config/next";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default next({ rootDir });
