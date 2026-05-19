type SchemaObject = Record<string, unknown>;

const authSecurity = [{ bearerAuth: [] }, { apiKeyAuth: [] }];

const objectSchema: SchemaObject = {
  type: "object",
  additionalProperties: true,
};

const stringArraySchema: SchemaObject = {
  type: "array",
  items: { type: "string" },
};

const metadataSchema: SchemaObject = {
  type: "object",
  additionalProperties: true,
};

const limitParameter = {
  name: "limit",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
  description: "Maximum number of records to return.",
};

function dataEnvelope(dataSchema: SchemaObject): SchemaObject {
  return {
    type: "object",
    required: ["data"],
    properties: { data: dataSchema },
    additionalProperties: false,
  };
}

function listEnvelope(itemSchema: SchemaObject = objectSchema): SchemaObject {
  return dataEnvelope({ type: "array", items: itemSchema });
}

function jsonResponse(description: string, schema: SchemaObject) {
  return {
    description,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function eventStreamResponse(description: string) {
  return {
    description,
    content: {
      "text/event-stream": {
        schema: { type: "string", description: "Server-sent event stream." },
      },
    },
  };
}

function jsonRequestBody(schema: SchemaObject, required = true) {
  return {
    required,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

const createAgentSchema: SchemaObject = {
  type: "object",
  required: ["name", "systemPrompt"],
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    avatar: { type: "string" },
    systemPrompt: { type: "string", minLength: 1 },
    model: { type: "string", default: "ollama:qwen2.5:7b" },
    temperature: { type: "number" },
    maxTokens: { type: "integer", minimum: 1 },
    tools: stringArraySchema,
    tags: stringArraySchema,
  },
  additionalProperties: false,
};

const createSessionSchema: SchemaObject = {
  type: "object",
  properties: {
    agentId: { type: ["string", "null"], format: "uuid" },
    title: { type: "string", minLength: 1, default: "New Chat" },
    model: { type: "string", default: "ollama:qwen2.5:7b" },
    metadata: metadataSchema,
  },
  additionalProperties: false,
};

const createTaskSchema: SchemaObject = {
  type: "object",
  required: ["title", "prompt"],
  properties: {
    title: { type: "string", minLength: 1 },
    prompt: { type: "string", minLength: 1 },
    agentId: { type: ["string", "null"], format: "uuid" },
    dependsOn: { type: "array", items: { type: "string", format: "uuid" } },
    priority: { type: "integer", minimum: -2, maximum: 2, default: 0 },
    maxRetries: { type: "integer", minimum: 0, maximum: 5, default: 2 },
    metadata: metadataSchema,
  },
  additionalProperties: false,
};

const createKnowledgeBaseSchema: SchemaObject = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    embeddingModel: { type: "string", default: "nomic-embed-text" },
    chunkSize: { type: "integer", minimum: 1, default: 1000 },
    chunkOverlap: { type: "integer", minimum: 0, default: 200 },
  },
  additionalProperties: false,
};

const createProjectSchema: SchemaObject = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    metadata: metadataSchema,
  },
  additionalProperties: false,
};

const chatMessageSchema: SchemaObject = {
  type: "object",
  required: ["role", "content"],
  properties: {
    role: { type: "string", enum: ["system", "user", "assistant"] },
    content: { type: "string" },
  },
  additionalProperties: false,
};

const chatCompletionsRequestSchema: SchemaObject = {
  type: "object",
  required: ["model", "messages"],
  properties: {
    model: { type: "string", description: "Qualified provider model ID or owned AgentHub agent UUID." },
    messages: { type: "array", minItems: 1, maxItems: 200, items: chatMessageSchema },
    stream: { type: "boolean", default: false },
    temperature: { type: "number", default: 0.7 },
    max_tokens: { type: "integer", minimum: 1, default: 4096 },
  },
  additionalProperties: false,
};

const chatCompletionSchema: SchemaObject = {
  type: "object",
  required: ["id", "object", "created", "model", "choices"],
  properties: {
    id: { type: "string" },
    object: { type: "string", enum: ["chat.completion"] },
    created: { type: "integer" },
    model: { type: "string" },
    choices: { type: "array", items: objectSchema },
    usage: { type: "object", additionalProperties: true },
  },
  additionalProperties: true,
};

const commonErrors = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "422": { $ref: "#/components/responses/ValidationError" },
};

const listResponses = {
  "200": jsonResponse("Successful response.", listEnvelope()),
  ...commonErrors,
};

export const agentHubOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "AgentHub Public API",
    version: "0.1.0",
    description:
      "OpenAPI contract for AgentHub's authenticated v1 REST resources, OpenAI-compatible chat completions, and Agent Gateway SSE fallback.",
  },
  servers: [{ url: "/", description: "Current AgentHub deployment" }],
  security: authSecurity,
  tags: [
    { name: "Agents" },
    { name: "Sessions" },
    { name: "Tasks" },
    { name: "Knowledge" },
    { name: "Files" },
    { name: "Tools" },
    { name: "Projects" },
    { name: "Webhooks" },
    { name: "Chat" },
    { name: "Gateway" },
  ],
  paths: {
    "/api/v1/agents": {
      get: {
        operationId: "listAgents",
        tags: ["Agents"],
        summary: "List agents owned by the API key user.",
        parameters: [limitParameter],
        responses: listResponses,
      },
      post: {
        operationId: "createAgent",
        tags: ["Agents"],
        summary: "Create an agent.",
        requestBody: jsonRequestBody(createAgentSchema),
        responses: {
          "201": jsonResponse("Agent created.", dataEnvelope(objectSchema)),
          ...commonErrors,
        },
      },
    },
    "/api/v1/sessions": {
      get: {
        operationId: "listSessions",
        tags: ["Sessions"],
        summary: "List chat sessions owned by the API key user.",
        parameters: [limitParameter],
        responses: listResponses,
      },
      post: {
        operationId: "createSession",
        tags: ["Sessions"],
        summary: "Create a chat session, optionally scoped to an owned agent.",
        requestBody: jsonRequestBody(createSessionSchema),
        responses: {
          "201": jsonResponse("Session created.", dataEnvelope(objectSchema)),
          "404": { $ref: "#/components/responses/NotFound" },
          ...commonErrors,
        },
      },
    },
    "/api/v1/tasks": {
      get: {
        operationId: "listTasks",
        tags: ["Tasks"],
        summary: "List agent tasks owned by the API key user.",
        parameters: [limitParameter],
        responses: listResponses,
      },
      post: {
        operationId: "createTask",
        tags: ["Tasks"],
        summary: "Create an agent task and queue it when it has no dependencies.",
        requestBody: jsonRequestBody(createTaskSchema),
        responses: {
          "201": jsonResponse("Task created.", dataEnvelope(objectSchema)),
          "404": { $ref: "#/components/responses/NotFound" },
          ...commonErrors,
        },
      },
    },
    "/api/v1/kb": {
      get: {
        operationId: "listKnowledgeBases",
        tags: ["Knowledge"],
        summary: "List knowledge bases owned by the API key user.",
        parameters: [limitParameter],
        responses: listResponses,
      },
      post: {
        operationId: "createKnowledgeBase",
        tags: ["Knowledge"],
        summary: "Create a knowledge base.",
        requestBody: jsonRequestBody(createKnowledgeBaseSchema),
        responses: {
          "201": jsonResponse("Knowledge base created.", dataEnvelope(objectSchema)),
          ...commonErrors,
        },
      },
    },
    "/api/v1/files": {
      get: {
        operationId: "listFiles",
        tags: ["Files"],
        summary: "List uploaded files and return the presign upload endpoint.",
        parameters: [limitParameter],
        responses: {
          "200": jsonResponse("File list and upload helper.", {
            type: "object",
            required: ["data", "upload"],
            properties: {
              data: { type: "array", items: objectSchema },
              upload: {
                type: "object",
                required: ["presignEndpoint"],
                properties: { presignEndpoint: { type: "string", enum: ["/api/upload/presigned"] } },
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          }),
          ...commonErrors,
        },
      },
    },
    "/api/v1/tools": {
      get: {
        operationId: "listTools",
        tags: ["Tools"],
        summary: "List built-in runtime tools and installed skill tools.",
        parameters: [limitParameter],
        responses: {
          "200": jsonResponse(
            "Built-in and installed tools.",
            dataEnvelope({
              type: "object",
              required: ["builtIns", "skills"],
              properties: {
                builtIns: { type: "array", items: objectSchema },
                skills: { type: "array", items: objectSchema },
              },
              additionalProperties: false,
            }),
          ),
          ...commonErrors,
        },
      },
    },
    "/api/v1/projects": {
      get: {
        operationId: "listProjects",
        tags: ["Projects"],
        summary: "List projects owned by the API key user.",
        parameters: [limitParameter],
        responses: listResponses,
      },
      post: {
        operationId: "createProject",
        tags: ["Projects"],
        summary: "Create a project.",
        requestBody: jsonRequestBody(createProjectSchema),
        responses: {
          "201": jsonResponse("Project created.", dataEnvelope(objectSchema)),
          ...commonErrors,
        },
      },
    },
    "/api/v1/webhooks": {
      get: {
        operationId: "listWebhooks",
        tags: ["Webhooks"],
        summary: "List channel webhook accounts and recent webhook audit events.",
        parameters: [limitParameter],
        responses: {
          "200": jsonResponse(
            "Webhook accounts and recent events.",
            dataEnvelope({
              type: "object",
              required: ["accounts", "recentEvents"],
              properties: {
                accounts: { type: "array", items: objectSchema },
                recentEvents: { type: "array", items: objectSchema },
              },
              additionalProperties: false,
            }),
          ),
          ...commonErrors,
        },
      },
    },
    "/api/v1/chat/completions": {
      post: {
        operationId: "createChatCompletion",
        tags: ["Chat"],
        summary: "Create an OpenAI-compatible chat completion or SSE stream.",
        requestBody: jsonRequestBody(chatCompletionsRequestSchema),
        responses: {
          "200": {
            description: "Chat completion response. When stream=true, response is text/event-stream.",
            content: {
              "application/json": { schema: chatCompletionSchema },
              "text/event-stream": { schema: { type: "string", description: "OpenAI-compatible SSE chunks." } },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          ...commonErrors,
        },
      },
    },
    "/api/v1/ws": {
      get: {
        operationId: "openAgentGateway",
        tags: ["Gateway"],
        summary: "Probe the Agent Gateway SSE fallback.",
        responses: {
          "200": eventStreamResponse("Gateway SSE fallback stream."),
          "426": jsonResponse("Raw WebSocket upgrade is unavailable in this runtime.", {
            $ref: "#/components/schemas/ErrorEnvelope",
          }),
          ...commonErrors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Use `Authorization: Bearer ah_...`.",
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Alternative API key header.",
      },
    },
    schemas: {
      ErrorEnvelope: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["message", "code"],
            properties: {
              message: { type: "string" },
              code: { type: "string" },
              issues: { type: "array", items: objectSchema },
            },
            additionalProperties: true,
          },
        },
        additionalProperties: false,
      },
    },
    responses: {
      BadRequest: jsonResponse("Bad request.", { $ref: "#/components/schemas/ErrorEnvelope" }),
      Unauthorized: jsonResponse("Missing or invalid API key.", { $ref: "#/components/schemas/ErrorEnvelope" }),
      ValidationError: jsonResponse("Validation failed.", { $ref: "#/components/schemas/ErrorEnvelope" }),
      NotFound: jsonResponse("Resource not found.", { $ref: "#/components/schemas/ErrorEnvelope" }),
    },
  },
} as const;
