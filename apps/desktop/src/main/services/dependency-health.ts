import type { ServiceAction, ServiceState, ServiceStatus } from "./service-ledger";
import { defaultServiceLedger, updateServiceState } from "./service-ledger";

type DependencyStatusPayload = {
  services?: Record<string, { status: ServiceStatus; configured?: boolean }>;
};

function actionForStatus(status: ServiceStatus, fallback: ServiceAction): ServiceAction {
  if (status === "not-configured") return "open-settings";
  if (status === "unhealthy") return fallback;
  return "retry";
}

export function mapDependencyHealth(payload: DependencyStatusPayload): ServiceState[] {
  let services = defaultServiceLedger;
  for (const [id, result] of Object.entries(payload.services ?? {})) {
    services = updateServiceState(services, {
      id: id as ServiceState["id"],
      status: result.status,
      action: actionForStatus(
        result.status,
        id === "database" || id === "redis" || id === "objectStorage" ? "start-docker" : "open-docs",
      ),
    });
  }
  return services;
}

export async function fetchDependencyHealth(webOrigin: string) {
  const response = await fetch(`${webOrigin}/api/health/dependencies`);
  if (!response.ok) {
    return mapDependencyHealth({
      services: {
        web: { status: "unhealthy" },
      },
    });
  }

  return mapDependencyHealth((await response.json()) as DependencyStatusPayload);
}
