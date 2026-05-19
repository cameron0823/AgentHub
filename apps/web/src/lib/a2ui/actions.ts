export interface A2UIClientEvent {
  surfaceId: string;
  event: string;
  dataModel: Record<string, unknown>;
  context?: Record<string, unknown>;
  endpoint?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}

export type A2UIClientEventHandler = (event: A2UIClientEvent) => void | Promise<void>;

export class ActionHandlerRegistry {
  private readonly handlers = new Map<string, A2UIClientEventHandler>();

  register(eventName: string, handler: A2UIClientEventHandler) {
    this.handlers.set(eventName, handler);
    return () => this.handlers.delete(eventName);
  }

  async dispatch(event: A2UIClientEvent) {
    const handler = this.handlers.get(event.event) ?? this.handlers.get("*");
    if (!handler) return false;
    await handler(event);
    return true;
  }
}

export const defaultA2UIActionRegistry = new ActionHandlerRegistry();

if (typeof window !== "undefined") {
  const dispatchBrowserEvent = (event: A2UIClientEvent) => {
    window.dispatchEvent(new CustomEvent<A2UIClientEvent>("agenthub:a2ui-event", { detail: event }));
  };

  const resolveTarget = (event: A2UIClientEvent) => {
    const target = event.endpoint ?? event.context?.href ?? event.context?.url ?? event.context?.path;
    return typeof target === "string" && target.trim().length > 0 ? target.trim() : null;
  };

  const postEventPayload = async (event: A2UIClientEvent, endpoint: string) => {
    const method = event.method ?? "POST";
    const url = new URL(endpoint, window.location.origin);
    const isRead = method === "GET";
    await fetch(url.toString(), {
      method,
      headers: isRead ? undefined : { "Content-Type": "application/json" },
      body: isRead
        ? undefined
        : JSON.stringify({
            type: "a2uiEvent",
            surfaceId: event.surfaceId,
            event: event.event,
            dataModel: event.dataModel,
            context: event.context ?? {},
          }),
    });
  };

  defaultA2UIActionRegistry.register("navigate", (event) => {
    const target = resolveTarget(event);
    if (!target) return;
    window.location.assign(new URL(target, window.location.origin).toString());
  });

  defaultA2UIActionRegistry.register("router.push", (event) => {
    const target = resolveTarget(event);
    if (!target) return;
    window.history.pushState({}, "", new URL(target, window.location.origin).toString());
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  defaultA2UIActionRegistry.register("form.submit", async (event) => {
    const endpoint = resolveTarget(event);
    if (!endpoint) {
      dispatchBrowserEvent(event);
      return;
    }
    await postEventPayload(event, endpoint);
    dispatchBrowserEvent(event);
  });

  defaultA2UIActionRegistry.register("api.call", async (event) => {
    const endpoint = resolveTarget(event);
    if (!endpoint) {
      dispatchBrowserEvent(event);
      return;
    }
    await postEventPayload(event, endpoint);
    dispatchBrowserEvent(event);
  });

  defaultA2UIActionRegistry.register("agent.callback", dispatchBrowserEvent);

  defaultA2UIActionRegistry.register("*", dispatchBrowserEvent);
}
