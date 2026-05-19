import { z } from "zod";

export const A2UI_VERSION = "0.9";

export const a2uiComponentTypes = [
  "Card",
  "Column",
  "Row",
  "Text",
  "Icon",
  "Divider",
  "TextField",
  "CheckBox",
  "ChoicePicker",
  "Button",
  "Table",
  "Chart",
  "Wizard",
] as const;

export const a2uiValidationCheckSchema = z.object({
  type: z.enum(["required", "email", "minLength", "maxLength", "pattern"]),
  message: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
});

export const a2uiValueBindingSchema = z.object({
  path: z
    .string()
    .regex(/^\/(?:[^/~]|~0|~1)*(?:\/(?:[^/~]|~0|~1)*)*$/, "A2UI value paths must use JSON pointer syntax"),
});

export const a2uiActionEventSchema = z.object({
  event: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  endpoint: z.string().optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
});

export const a2uiOptionSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const a2uiTableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  format: z.enum(["text", "number", "date", "currency"]).optional(),
});

export const a2uiChartSeriesSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  color: z.string().optional(),
});

export const a2uiWizardStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  rootId: z.string(),
});

export const a2uiComponentSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(a2uiComponentTypes),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    text: z.string().optional(),
    label: z.string().optional(),
    placeholder: z.string().optional(),
    icon: z.string().optional(),
    child: z.string().optional(),
    children: z.array(z.string()).optional(),
    value: a2uiValueBindingSchema.optional(),
    checks: z.array(a2uiValidationCheckSchema).optional(),
    action: a2uiActionEventSchema.optional(),
    options: z.array(a2uiOptionSchema).optional(),
    columns: z.array(a2uiTableColumnSchema).optional(),
    rows: z.array(z.record(z.unknown())).optional(),
    chartType: z.enum(["line", "bar", "area", "pie", "radar", "scatter"]).optional(),
    data: z.array(z.record(z.unknown())).optional(),
    xKey: z.string().optional(),
    series: z.array(a2uiChartSeriesSchema).optional(),
    steps: z.array(a2uiWizardStepSchema).optional(),
  })
  .passthrough();

export const a2uiSurfacePayloadSchema = z.object({
  surfaceId: z.string().min(1),
  rootId: z.string().optional(),
  components: z.array(a2uiComponentSchema).default([]),
  dataModel: z.record(z.unknown()).default({}),
});

export const a2uiActionSchema = z
  .object({
    version: z.literal(A2UI_VERSION).optional(),
    createSurface: a2uiSurfacePayloadSchema.optional(),
    updateComponents: a2uiSurfacePayloadSchema.optional(),
    updateDataModel: z
      .object({
        surfaceId: z.string().min(1),
        dataModel: z.record(z.unknown()),
      })
      .optional(),
    deleteSurface: z
      .object({
        surfaceId: z.string().min(1),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    const actions = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"].filter(
      (key) => value[key as keyof typeof value] !== undefined,
    );
    if (actions.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A2UI messages must contain exactly one action",
      });
    }
  });

export type A2UIValidationCheck = z.infer<typeof a2uiValidationCheckSchema>;
export type A2UIComponent = z.infer<typeof a2uiComponentSchema>;
export type A2UISurfacePayload = z.infer<typeof a2uiSurfacePayloadSchema>;
export type A2UIAction = z.infer<typeof a2uiActionSchema>;
export type A2UIActionEvent = z.infer<typeof a2uiActionEventSchema>;

export function getA2UISurfacePayload(action: A2UIAction): A2UISurfacePayload | null {
  return action.createSurface ?? action.updateComponents ?? null;
}

export function validateA2UIComponentGraph(components: A2UIComponent[], rootId?: string) {
  const ids = new Set<string>();
  for (const component of components) {
    if (ids.has(component.id)) throw new Error(`Duplicate A2UI component id: ${component.id}`);
    ids.add(component.id);
  }

  const componentMap = new Map(components.map((component) => [component.id, component]));
  const roots = rootId ? [rootId] : components.length > 0 ? [components[0].id] : [];

  const visit = (id: string, ancestors: Set<string>) => {
    if (!componentMap.has(id)) throw new Error(`A2UI component reference not found: ${id}`);
    if (ancestors.has(id)) throw new Error(`Circular A2UI component reference detected at ${id}`);
    const component = componentMap.get(id)!;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);
    const childIds = [
      ...(component.child ? [component.child] : []),
      ...(component.children ?? []),
      ...(component.steps?.map((step) => step.rootId) ?? []),
    ];
    for (const childId of childIds) visit(childId, nextAncestors);
  };

  for (const root of roots) visit(root, new Set());
}
