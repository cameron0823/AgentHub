import { createServer } from "node:net";

export const LOOPBACK_HOST = "127.0.0.1";

export async function isPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function getDynamicPort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }
        reject(new Error("Could not allocate a dynamic desktop web port"));
      });
    });
    server.listen(0, "127.0.0.1");
  });
}

function parsePort(value: string | undefined) {
  if (!value) {
    return null;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid AGENTHUB_DESKTOP_PORT: ${value}`);
  }
  return port;
}

export async function selectDesktopPort(env = process.env) {
  const configuredPort = parsePort(env.AGENTHUB_DESKTOP_PORT);
  if (configuredPort) {
    if (await isPortAvailable(configuredPort)) {
      return configuredPort;
    }
    throw new Error(`Configured AGENTHUB_DESKTOP_PORT is not available: ${configuredPort}`);
  }

  for (const candidate of [3001, 3002]) {
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }

  return getDynamicPort();
}
