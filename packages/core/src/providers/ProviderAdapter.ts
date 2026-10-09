export interface KeyValidationResult {
  valid: boolean;
  reason?: "invalid" | "unreachable" | "rate-limited";
  message?: string;
}

export interface TokenCountResult {
  count: number;
  label: "exact" | "approximate";
  margin?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  model?: string;
  schema?: unknown;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface CompletionResult {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ProviderAdapter {
  readonly providerId: string;

  /**
   * Validates an API key using the injected getter closure.
   * Does NOT receive the raw key directly.
   */
  validateKey(getKey: () => Promise<string>): Promise<KeyValidationResult>;

  /**
   * Fetches the available models from the provider's remote endpoint.
   */
  listModels(getKey: () => Promise<string>): Promise<string[]>;

  /**
   * Optional token count method.
   */
  countTokens?(text: string, model?: string): Promise<TokenCountResult>;

  /**
   * Executes a chat completion call with retry/backoff support.
   */
  complete(
    messages: ChatMessage[],
    getKey: () => Promise<string>,
    options?: CompletionOptions
  ): Promise<CompletionResult>;
}
