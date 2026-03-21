import { z } from "zod";

export const a2uiVersion = "v0.8" as const;

export const a2uiComponentTypeSchema = z.enum([
  "Column",
  "Row",
  "Card",
  "Text",
  "Markdown",
  "Badge",
  "Button",
  "ButtonGroup",
  "Divider",
  "Input",
  "Textarea",
  "Select",
  "List",
  "Table",
  "CodeBlock",
  "StepTimeline",
  "ArtifactHeader",
  "ReferenceList",
  "Notice"
]);

export const a2uiBindingSchema = z.union([
  z.object({
    mode: z.literal("literal"),
    value: z.unknown()
  }),
  z.object({
    mode: z.literal("path"),
    path: z.string()
  })
]);

export type A2UiBinding = z.infer<typeof a2uiBindingSchema>;

export interface A2UiComponentNode {
  id: string;
  type: z.infer<typeof a2uiComponentTypeSchema>;
  props?: Record<string, unknown>;
  children?: string[];
}

const componentNodeSchema: z.ZodType<A2UiComponentNode> = z.object({
  id: z.string(),
  type: a2uiComponentTypeSchema,
  props: z.record(z.string(), z.unknown()).optional(),
  children: z.array(z.string()).optional()
});

export const beginRenderingMessageSchema = z.object({
  version: z.literal(a2uiVersion),
  type: z.literal("beginRendering"),
  surfaceId: z.string(),
  catalogId: z.string(),
  title: z.string().optional()
});

export const surfaceUpdateMessageSchema = z.object({
  version: z.literal(a2uiVersion),
  type: z.literal("surfaceUpdate"),
  surfaceId: z.string(),
  rootComponentId: z.string(),
  components: z.array(componentNodeSchema)
});

export const dataModelUpdateMessageSchema = z.object({
  version: z.literal(a2uiVersion),
  type: z.literal("dataModelUpdate"),
  surfaceId: z.string(),
  data: z.record(z.string(), z.unknown())
});

export const deleteSurfaceMessageSchema = z.object({
  version: z.literal(a2uiVersion),
  type: z.literal("deleteSurface"),
  surfaceId: z.string()
});

export const a2uiMessageSchema = z.union([
  beginRenderingMessageSchema,
  surfaceUpdateMessageSchema,
  dataModelUpdateMessageSchema,
  deleteSurfaceMessageSchema
]);

export type A2UiMessage = z.infer<typeof a2uiMessageSchema>;

export const a2uiUserActionSchema = z.object({
  version: z.literal(a2uiVersion),
  type: z.literal("userAction"),
  sessionId: z.string(),
  runId: z.string().optional(),
  surfaceId: z.string(),
  action: z.object({
    name: z.string(),
    payload: z.record(z.string(), z.unknown()).optional()
  }),
  context: z.record(z.string(), z.unknown()).optional(),
  a2uiClientDataModel: z.record(z.string(), z.unknown()).optional()
});

export type A2UiUserAction = z.infer<typeof a2uiUserActionSchema>;

export function literal(value: unknown): A2UiBinding {
  return { mode: "literal", value };
}

export function bind(path: string): A2UiBinding {
  return { mode: "path", path };
}
