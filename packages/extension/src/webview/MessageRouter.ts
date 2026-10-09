import {
  WebviewToHostMsgSchema,
  HostToWebviewMsgSchema,
  type WebviewToHostMsg,
  type HostToWebviewMsg,
} from "@token-optimizer/core";

export type MessageHandler<T extends WebviewToHostMsg["type"]> = (
  msg: Extract<WebviewToHostMsg, { type: T }>
) => void | Promise<void>;

export interface PostMessageTarget {
  postMessage(message: unknown): Thenable<boolean> | Promise<boolean>;
}

/**
 * Redacts potential secret tokens and API keys from error messages or logs.
 */
export function sanitizeLogText(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/(AIza[0-9A-Za-z-_]{35})/g, "AIza***")
    .replace(/(gsk_[A-Za-z0-9_-]+)/g, "gsk_***")
    .replace(/(xai-[A-Za-z0-9_-]+)/g, "xai-***")
    .replace(/("key"\s*:\s*)"[^"]+"/gi, '$1"***"');
}

export class MessageRouter {
  private handlers = new Map<
    string,
    Array<(msg: WebviewToHostMsg) => void | Promise<void>>
  >();
  private target: PostMessageTarget | null = null;
  private isDisposed = false;

  constructor(target?: PostMessageTarget) {
    if (target) {
      this.target = target;
    }
  }

  setTarget(target: PostMessageTarget): void {
    this.target = target;
  }

  register<T extends WebviewToHostMsg["type"]>(
    type: T,
    handler: MessageHandler<T>
  ): () => void {
    const list = this.handlers.get(type) || [];
    list.push(handler as unknown as (msg: WebviewToHostMsg) => void | Promise<void>);
    this.handlers.set(type, list);

    return () => {
      const current = this.handlers.get(type) || [];
      this.handlers.set(
        type,
        current.filter((h) => h !== handler)
      );
    };
  }

  /**
   * Inbound message handler from webview.
   * Zod-validates the message against WebviewToHostMsgSchema.
   * Malformed messages are logged at debug level (message type only, never payload) and dropped.
   * Handlers run concurrently with a timeout so a hung handler cannot block others.
   */
  async handleInbound(rawMessage: unknown): Promise<boolean> {
    if (this.isDisposed) {
      return false;
    }

    const parseResult = WebviewToHostMsgSchema.safeParse(rawMessage);
    if (!parseResult.success) {
      // Record type if present, never payload (Principle II & Constitution review finding 5)
      const rawType =
        typeof rawMessage === "object" && rawMessage !== null && "type" in rawMessage
          ? String((rawMessage as { type?: unknown }).type)
          : "unknown";
      console.debug(`[MessageRouter] Dropped invalid inbound message of type: ${rawType}`);
      return false;
    }

    const message = parseResult.data;
    const typeHandlers = this.handlers.get(message.type);
    if (!typeHandlers || typeHandlers.length === 0) {
      return true;
    }

    // Run handlers concurrently with a 10s per-handler timeout
    const results = await Promise.allSettled(
      typeHandlers.map(async (handler) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Handler timed out")), 10000);
        });

        try {
          await Promise.race([Promise.resolve(handler(message)), timeoutPromise]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      })
    );

    for (const res of results) {
      if (res.status === "rejected") {
        const sanitizedErr = sanitizeLogText(
          res.reason instanceof Error ? res.reason.message : String(res.reason)
        );
        console.error(
          `[MessageRouter] Handler error for message type '${message.type}': ${sanitizedErr}`
        );
      }
    }

    return true;
  }

  /**
   * Outbound message sender to webview.
   * Validates against HostToWebviewMsgSchema before dispatching.
   * Returns false if target is not set or schema validation fails.
   */
  async send(msg: HostToWebviewMsg): Promise<boolean> {
    if (this.isDisposed || !this.target) {
      console.warn("[MessageRouter] Target not set or router disposed; cannot send message.");
      return false;
    }

    const parseResult = HostToWebviewMsgSchema.safeParse(msg);
    if (!parseResult.success) {
      console.error(
        `[MessageRouter] Attempted to send invalid HostToWebviewMsg '${msg.type}':`,
        parseResult.error.message
      );
      return false;
    }

    try {
      return await this.target.postMessage(parseResult.data);
    } catch (err) {
      const sanitized = sanitizeLogText(String(err));
      console.error(`[MessageRouter] postMessage failed: ${sanitized}`);
      return false;
    }
  }

  /**
   * Cleans up handlers and target when panel or provider is disposed.
   */
  dispose(): void {
    this.isDisposed = true;
    this.handlers.clear();
    this.target = null;
  }
}
