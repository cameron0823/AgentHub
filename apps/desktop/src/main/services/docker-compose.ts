import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DOCKER_COMPOSE_PS = "docker compose ps";
const DOCKER_COMPOSE_UP = "docker compose up -d";

type DockerComposeOptions = {
  repoRoot: string;
};

export async function detectDockerCompose(options: DockerComposeOptions) {
  try {
    const { stdout } = await execFileAsync("docker", ["compose", "ps"], {
      cwd: options.repoRoot,
      timeout: 10_000,
    });
    return {
      available: true,
      command: DOCKER_COMPOSE_PS,
      output: stdout,
    };
  } catch (error) {
    return {
      available: false,
      command: DOCKER_COMPOSE_PS,
      error: error instanceof Error ? error.message : String(error),
      action: "open-docs" as const,
    };
  }
}

export async function startCoreDockerServices(options: DockerComposeOptions & { confirmStart: boolean }) {
  if (!options.confirmStart) {
    return {
      started: false,
      command: DOCKER_COMPOSE_UP,
      action: "start-docker" as const,
      reason: "User confirmation required before starting local services",
    };
  }

  const { stdout } = await execFileAsync(
    "docker",
    ["compose", "up", "-d", "postgresql", "redis", "minio", "minio-init"],
    {
      cwd: options.repoRoot,
      timeout: 120_000,
    },
  );

  return {
    started: true,
    command: DOCKER_COMPOSE_UP,
    output: stdout,
  };
}
