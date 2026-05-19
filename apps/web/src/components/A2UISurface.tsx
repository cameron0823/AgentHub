"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { defaultA2UIActionRegistry, type A2UIClientEvent } from "@/lib/a2ui/actions";
import {
  getA2UISurfacePayload,
  type A2UIAction,
  type A2UIComponent,
  type A2UIValidationCheck,
} from "@/lib/a2ui/schema";
import { getValueByPath, setValueByPath } from "@/lib/a2ui/state";

interface A2UISurfaceProps {
  action: A2UIAction;
  sessionId?: string | null;
  onEvent?: (event: A2UIClientEvent) => void | Promise<void>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function validateValue(value: unknown, checks: A2UIValidationCheck[] | undefined) {
  const text = asString(value);
  for (const check of checks ?? []) {
    if (check.type === "required" && text.trim().length === 0) return check.message ?? "Required";
    if (check.type === "email" && text.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      return check.message ?? "Enter a valid email";
    }
    if (check.type === "minLength" && text.length < Number(check.value ?? 0)) {
      return check.message ?? `Must be at least ${check.value} characters`;
    }
    if (check.type === "maxLength" && text.length > Number(check.value ?? Number.POSITIVE_INFINITY)) {
      return check.message ?? `Must be at most ${check.value} characters`;
    }
    if (check.type === "pattern" && check.value && !new RegExp(String(check.value)).test(text)) {
      return check.message ?? "Invalid format";
    }
  }
  return null;
}

function formatCell(value: unknown, format?: string) {
  if (format === "number" && typeof value === "number") return value.toLocaleString();
  if (format === "currency" && typeof value === "number") {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
  }
  if (format === "date" && value) return new Date(String(value)).toLocaleDateString();
  return asString(value);
}

export function A2UISurface({ action, sessionId, onEvent }: A2UISurfaceProps) {
  const payload = getA2UISurfacePayload(action);
  const [dataModel, setDataModel] = useState<Record<string, unknown>>(payload?.dataModel ?? {});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [wizardStep, setWizardStep] = useState(0);

  const components = useMemo(
    () => new Map((payload?.components ?? []).map((component) => [component.id, component])),
    [payload?.components],
  );
  const rootId = payload?.rootId ?? payload?.components[0]?.id;
  const surfaceId =
    payload?.surfaceId ?? action.updateDataModel?.surfaceId ?? action.deleteSurface?.surfaceId ?? "a2ui";
  const wizardStorageKey = sessionId ? `wizard_${sessionId}_${surfaceId}` : null;

  useEffect(() => {
    if (!action.updateDataModel) return;
    setDataModel((current) => ({ ...current, ...action.updateDataModel!.dataModel }));
  }, [action]);

  useEffect(() => {
    if (!wizardStorageKey) return;
    const raw = window.localStorage.getItem(wizardStorageKey);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (typeof saved.step === "number") setWizardStep(saved.step);
      if (saved.dataModel && typeof saved.dataModel === "object") setDataModel(saved.dataModel);
    } catch {
      window.localStorage.removeItem(wizardStorageKey);
    }
  }, [wizardStorageKey]);

  useEffect(() => {
    if (!wizardStorageKey) return;
    window.localStorage.setItem(wizardStorageKey, JSON.stringify({ step: wizardStep, dataModel, status: "active" }));
  }, [wizardStorageKey, wizardStep, dataModel]);

  if (action.deleteSurface || !payload || !rootId) return null;

  const updateBoundValue = (component: A2UIComponent, value: unknown) => {
    if (!component.value?.path) return;
    setDataModel((current) => setValueByPath(current, component.value!.path, value));
    setErrors((current) => ({ ...current, [component.id]: validateValue(value, component.checks) }));
  };

  const validateComponentTree = (rootComponentId = rootId) => {
    const nextErrors: Record<string, string | null> = {};
    const visit = (id: string) => {
      const component = components.get(id);
      if (!component) return;
      if (component.value?.path) {
        nextErrors[component.id] = validateValue(getValueByPath(dataModel, component.value.path), component.checks);
      }
      for (const childId of [...(component.child ? [component.child] : []), ...(component.children ?? [])])
        visit(childId);
    };
    visit(rootComponentId);
    setErrors((current) => ({ ...current, ...nextErrors }));
    return Object.values(nextErrors).every((value) => !value);
  };

  const dispatch = async (component: A2UIComponent) => {
    if (!component.action || !validateComponentTree(rootId)) return;
    const event = {
      surfaceId,
      event: component.action.event,
      dataModel,
      context: component.action.context,
      endpoint: component.action.endpoint,
      method: component.action.method,
    };
    if (onEvent) await onEvent(event);
    await defaultA2UIActionRegistry.dispatch(event);
  };

  const renderComponent = (id: string): JSX.Element | null => {
    const component = components.get(id);
    if (!component) return null;
    const children = (component.children ?? []).map((childId) => <div key={childId}>{renderComponent(childId)}</div>);
    const child = component.child ? renderComponent(component.child) : null;
    const value = component.value?.path ? getValueByPath(dataModel, component.value.path) : undefined;
    const error = errors[component.id];

    if (component.type === "Card") {
      return (
        <section className="not-prose rounded-lg border border-white/10 bg-white/5 p-3" data-testid="a2ui-card">
          {component.title && <div className="text-sm font-semibold text-foreground">{component.title}</div>}
          {component.subtitle && <div className="mt-1 text-xs text-muted-foreground">{component.subtitle}</div>}
          <div className="mt-3 space-y-3">
            {child}
            {children}
          </div>
        </section>
      );
    }

    if (component.type === "Column")
      return (
        <div className="not-prose space-y-3">
          {child}
          {children}
        </div>
      );
    if (component.type === "Row")
      return (
        <div className="not-prose flex flex-wrap items-end gap-3">
          {child}
          {children}
        </div>
      );
    if (component.type === "Text")
      return <p className="not-prose text-sm text-foreground">{component.text ?? component.label}</p>;
    if (component.type === "Icon")
      return (
        <span className="not-prose inline-flex text-sm text-muted-foreground">
          {component.icon ?? component.text ?? "*"}
        </span>
      );
    if (component.type === "Divider") return <hr className="not-prose border-white/10" />;

    if (component.type === "TextField") {
      return (
        <label className="not-prose block text-sm" data-testid="a2ui-text-field">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {component.label ?? component.title}
          </span>
          <input
            value={asString(value)}
            placeholder={component.placeholder}
            onChange={(event) => updateBoundValue(component, event.target.value)}
            className="agenthub-field w-full px-3 py-2"
          />
          {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
        </label>
      );
    }

    if (component.type === "CheckBox") {
      return (
        <label className="not-prose flex items-center gap-2 text-sm" data-testid="a2ui-checkbox">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => updateBoundValue(component, event.target.checked)}
            className="h-4 w-4"
          />
          <span>{component.label ?? component.title}</span>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </label>
      );
    }

    if (component.type === "ChoicePicker") {
      return (
        <label className="not-prose block text-sm" data-testid="a2ui-choice-picker">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {component.label ?? component.title}
          </span>
          <select
            value={asString(value)}
            onChange={(event) => updateBoundValue(component, event.target.value)}
            className="agenthub-field w-full px-3 py-2"
          >
            <option value="">Select...</option>
            {(component.options ?? []).map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
          {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
        </label>
      );
    }

    if (component.type === "Button") {
      return (
        <button
          type="button"
          data-testid="a2ui-action-button"
          onClick={() => void dispatch(component)}
          className="not-prose rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {component.label ?? component.title ?? "Submit"}
        </button>
      );
    }

    if (component.type === "Table") {
      const rows = (component.rows ?? []).filter((row) =>
        JSON.stringify(row).toLowerCase().includes(filter.toLowerCase()),
      );
      const sortedRows = sort
        ? [...rows].sort((a, b) => {
            const left = asString(a[sort.key]);
            const right = asString(b[sort.key]);
            return sort.direction === "asc" ? left.localeCompare(right) : right.localeCompare(left);
          })
        : rows;
      return (
        <div className="not-prose space-y-2" data-testid="a2ui-table">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter table"
            className="agenthub-field w-full px-3 py-2 text-sm"
          />
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-white/5 text-muted-foreground">
                <tr>
                  {(component.columns ?? []).map((column) => (
                    <th key={column.key} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSort((current) => ({
                            key: column.key,
                            direction: current?.key === column.key && current.direction === "asc" ? "desc" : "asc",
                          }))
                        }
                      >
                        {column.label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, index) => (
                  <tr key={index} className="border-t border-white/10">
                    {(component.columns ?? []).map((column) => (
                      <td key={column.key} className="px-3 py-2">
                        {formatCell(row[column.key], column.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (component.type === "Chart") {
      const data = component.data ?? [];
      const series = component.series ?? [];
      const chartType = component.chartType ?? "line";
      const chart =
        chartType === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={component.xKey} />
            <YAxis />
            <Tooltip />
            {series.map((item) => (
              <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color ?? "#60a5fa"} />
            ))}
          </BarChart>
        ) : chartType === "pie" ? (
          <PieChart>
            <Tooltip />
            <Pie
              data={data}
              dataKey={series[0]?.key ?? "value"}
              nameKey={component.xKey ?? "name"}
              fill={series[0]?.color ?? "#60a5fa"}
            />
          </PieChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={component.xKey} />
            <YAxis />
            <Tooltip />
            {series.map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color ?? "#60a5fa"}
              />
            ))}
          </LineChart>
        );
      return (
        <div className="not-prose h-64 rounded-lg border border-white/10 bg-white/[0.03] p-2" data-testid="a2ui-chart">
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        </div>
      );
    }

    if (component.type === "Wizard") {
      const steps = component.steps ?? [];
      const currentStep = steps[Math.min(wizardStep, Math.max(steps.length - 1, 0))];
      const canGoBack = wizardStep > 0;
      const isLast = wizardStep >= steps.length - 1;
      return (
        <section className="not-prose rounded-lg border border-white/10 bg-white/5 p-3" data-testid="a2ui-wizard">
          <div className="mb-3 flex flex-wrap gap-1">
            {steps.map((step, index) => (
              <span
                key={step.id}
                className={`rounded-full px-2 py-1 text-[10px] ${index === wizardStep ? "bg-primary text-primary-foreground" : "bg-white/10 text-muted-foreground"}`}
              >
                {index + 1}. {step.title}
              </span>
            ))}
          </div>
          {currentStep && (
            <div>
              <h4 className="text-sm font-semibold">{currentStep.title}</h4>
              {currentStep.description && (
                <p className="mt-1 text-xs text-muted-foreground">{currentStep.description}</p>
              )}
              <div className="mt-3">{renderComponent(currentStep.rootId)}</div>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={() => setWizardStep((step) => Math.max(0, step - 1))}
              className="agenthub-secondary-button px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => {
                if (currentStep && !validateComponentTree(currentStep.rootId)) return;
                if (isLast) {
                  void defaultA2UIActionRegistry.dispatch({
                    surfaceId,
                    event: "wizard.complete",
                    dataModel,
                    context: { wizardId: component.id },
                  });
                  onEvent?.({ surfaceId, event: "wizard.complete", dataModel, context: { wizardId: component.id } });
                  if (wizardStorageKey)
                    window.localStorage.setItem(
                      wizardStorageKey,
                      JSON.stringify({ step: wizardStep, dataModel, status: "completed" }),
                    );
                } else {
                  setWizardStep((step) => Math.min(steps.length - 1, step + 1));
                }
              }}
              className="agenthub-primary-button rounded-md px-3 py-1.5 text-xs"
            >
              {isLast ? "Complete" : "Next"}
            </button>
          </div>
        </section>
      );
    }

    return null;
  };

  return (
    <div className="not-prose mt-3 space-y-3" data-testid="a2ui-surface" data-a2ui-surface-id={surfaceId}>
      {renderComponent(rootId)}
    </div>
  );
}
