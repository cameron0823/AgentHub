import { BrowserWindow, screen } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DesktopWindowState } from "../shared/desktop-api";

const MIN_WIDTH = 960;
const MIN_HEIGHT = 640;
const WINDOW_STATE_FILE = "window-state.json";

function statePath(userDataPath: string) {
  return path.join(userDataPath, WINDOW_STATE_FILE);
}

function isVisibleOnAnyDisplay(state: DesktopWindowState) {
  if (state.x === undefined || state.y === undefined) {
    return true;
  }

  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const area = display.workArea;
    const right = state.x! + state.width;
    const bottom = state.y! + state.height;
    return state.x! < area.x + area.width && right > area.x && state.y! < area.y + area.height && bottom > area.y;
  });
}

export function normalizeWindowState(input: Partial<DesktopWindowState>): DesktopWindowState {
  const state: DesktopWindowState = {
    width: Math.max(MIN_WIDTH, Math.round(Number(input.width) || 1280)),
    height: Math.max(MIN_HEIGHT, Math.round(Number(input.height) || 860)),
    maximized: Boolean(input.maximized),
  };

  if (Number.isFinite(input.x)) {
    state.x = Math.round(Number(input.x));
  }

  if (Number.isFinite(input.y)) {
    state.y = Math.round(Number(input.y));
  }

  if (!isVisibleOnAnyDisplay(state)) {
    delete state.x;
    delete state.y;
  }

  return state;
}

export async function readWindowState(userDataPath: string): Promise<DesktopWindowState | null> {
  try {
    const raw = await readFile(statePath(userDataPath), "utf8");
    return normalizeWindowState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeWindowState(userDataPath: string, state: DesktopWindowState) {
  await mkdir(userDataPath, { recursive: true });
  await writeFile(statePath(userDataPath), `${JSON.stringify(normalizeWindowState(state), null, 2)}\n`, "utf8");
}

export function getWindowState(window: BrowserWindow): DesktopWindowState {
  const bounds = window.getBounds();
  return normalizeWindowState({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: window.isMaximized(),
  });
}

export async function persistWindowState(userDataPath: string, window: BrowserWindow) {
  await writeWindowState(userDataPath, getWindowState(window));
}
