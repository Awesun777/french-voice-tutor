import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

type ResolvedProvider = {
  name: string;
  url: string;
  key: string;
  model: string;
  maxTokens: number;
  thinking?: Record<string, unknown>;
  // Strict `json_schema` response_format is an OpenAI/Gemini feature. DeepSeek
  // rejects it ("This response_format type is unavailable now"), so callers that
  // ask for json_schema get downgraded to json_object with the schema inlined
  // into the prompt when this is false.
  supportsJsonSchema: boolean;
};

/**
 * Build the ordered list of LLM backends to try, based on which keys are
 * configured. invokeLLM attempts them in order and falls back to the next one
 * whenever a provider errors out (429 daily cap, 5xx, network failure, …).
 *
 * Priority:
 * 1. OpenAI (OPENAI_API_KEY) — gpt-4o-mini. Fast and cheap; primary provider.
 *    Rejects the Forge "thinking" param and caps output lower, so both differ.
 * 2. DeepSeek (DEEPSEEK_API_KEY) — deepseek-v4-flash. The fallback that keeps
 *    the app working when OpenAI hits its daily request cap. It's a reasoning
 *    model, so the reasoning chain counts against max_tokens — it needs the
 *    full 32k budget or the JSON answer truncates. Doesn't support json_schema.
 * 3. Forge (BUILT_IN_FORGE_API_KEY) — gemini-2.5-flash, the Manus gateway.
 */
function resolveProviders(): ResolvedProvider[] {
  const providers: ResolvedProvider[] = [];
  if (ENV.openAiApiKey) {
    providers.push({ name: "openai", url: "https://api.openai.com/v1/chat/completions", key: ENV.openAiApiKey, model: "gpt-4o-mini", maxTokens: 16384, supportsJsonSchema: true });
  }
  if (ENV.deepseekApiKey) {
    providers.push({ name: "deepseek", url: "https://api.deepseek.com/chat/completions", key: ENV.deepseekApiKey, model: "deepseek-v4-flash", maxTokens: 32768, supportsJsonSchema: false });
  }
  if (ENV.forgeApiKey) {
    const url = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
      ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
      : "https://forge.manus.im/v1/chat/completions";
    providers.push({ name: "forge", url, key: ENV.forgeApiKey, model: "gemini-2.5-flash", maxTokens: 32768, thinking: { budget_tokens: 128 }, supportsJsonSchema: true });
  }
  if (providers.length === 0) {
    throw new Error(
      "No LLM provider configured: set OPENAI_API_KEY / DEEPSEEK_API_KEY (self-hosted) or BUILT_IN_FORGE_API_KEY (Manus)."
    );
  }
  return providers;
}

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

/**
 * Build the provider-specific request body. Kept per-provider (not shared)
 * because response_format and the max_tokens cap differ between backends — e.g.
 * DeepSeek needs json_schema downgraded to json_object, OpenAI does not.
 */
function buildPayload(provider: ResolvedProvider, params: InvokeParams): Record<string, unknown> {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    maxTokens,
    max_tokens,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: provider.model,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  // Respect a caller-provided token budget, capped to what the provider allows.
  const requested = maxTokens ?? max_tokens;
  payload.max_tokens = requested ? Math.min(requested, provider.maxTokens) : provider.maxTokens;
  if (provider.thinking) {
    payload.thinking = provider.thinking;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    if (
      normalizedResponseFormat.type === "json_schema" &&
      !provider.supportsJsonSchema
    ) {
      // Provider (e.g. DeepSeek) can't enforce a strict schema. Fall back to
      // json_object mode — which still guarantees syntactically valid JSON —
      // and inline the schema into the prompt so the model returns the exact
      // shape the caller expects. json_object mode also requires the literal
      // word "json" to appear in the messages, which the instruction below
      // satisfies.
      payload.response_format = { type: "json_object" };
      (payload.messages as Array<Record<string, unknown>>).push({
        role: "system",
        content:
          "Return ONLY a valid JSON object that conforms exactly to this JSON schema " +
          "(identical field names and types, include every required field, no extra fields):\n" +
          JSON.stringify(normalizedResponseFormat.json_schema.schema),
      });
    } else {
      payload.response_format = normalizedResponseFormat;
    }
  }

  return payload;
}

/** Fire a single provider request; throws (with the provider name) on any non-OK response. */
async function callProvider(provider: ResolvedProvider, params: InvokeParams): Promise<InvokeResult> {
  const response = await fetch(provider.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.key}`,
    },
    body: JSON.stringify(buildPayload(provider, params)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `${provider.name} invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}

/**
 * Invoke the LLM, trying each configured provider in priority order and
 * falling back to the next whenever one errors out (daily-cap 429, 5xx,
 * network failure, etc.). Returns the first successful response; throws only
 * when every provider has failed.
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const providers = resolveProviders();
  let lastError: unknown;

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      return await callProvider(provider, params);
    } catch (err) {
      lastError = err;
      const next = providers[i + 1];
      if (next) {
        console.warn(
          `[LLM] ${provider.name} failed, falling back to ${next.name}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

  throw new Error(
    `All LLM providers failed. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
