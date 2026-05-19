import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const AUTH_SECRET_FILE = "desktop-nextauth-secret";

export async function getOrCreateDesktopAuthSecret(userDataPath: string) {
  const secretPath = path.join(userDataPath, AUTH_SECRET_FILE);

  try {
    const existing = (await readFile(secretPath, "utf8")).trim();
    if (existing.length >= 32) {
      return existing;
    }
  } catch {
    // Missing secret is expected on first desktop launch.
  }

  const secret = randomBytes(32).toString("hex");
  await mkdir(userDataPath, { recursive: true });
  await writeFile(secretPath, `${secret}\n`, { encoding: "utf8", mode: 0o600 });
  return secret;
}
