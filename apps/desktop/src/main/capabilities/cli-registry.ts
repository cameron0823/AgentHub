import { validateCommandPath } from "./stdio-mcp";

export type DesktopCliRegistration = {
  id: string;
  label: string;
  command: string;
  allowedArgs?: string[];
};

const registrations = new Map<string, DesktopCliRegistration>();

export function registerDesktopCli(registration: DesktopCliRegistration) {
  const command = validateCommandPath(registration.command);
  const nextRegistration = { ...registration, command };
  registrations.set(registration.id, nextRegistration);
  return nextRegistration;
}

export function listDesktopCliRegistrations() {
  return Array.from(registrations.values());
}

export function clearDesktopCliRegistrations() {
  registrations.clear();
}
