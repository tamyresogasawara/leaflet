export type EngineName = "openai" | "anthropic";

export type EngineErrorCode = "auth" | "rate_limit" | "timeout" | "unknown";

export type Citation = {
  url: string;
  title?: string;
};

export type MentionAnalysis = {
  brand: { mentioned: boolean; count: number; firstIndex: number | null };
  competitors: Record<
    string,
    { mentioned: boolean; count: number; firstIndex: number | null }
  >;
};

export type EngineResult = {
  engine: EngineName;
  status: "running" | "done" | "error";
  /**
   * Index into the run's `input.prompts` array. Always present on v2+
   * results. v1 saved analyses migrate to `promptIndex: 0` for every entry.
   */
  promptIndex: number;
  /**
   * Denormalized prompt text — the exact string this engine answered.
   * Lets a result be rendered standalone without joining back to the
   * Analysis input. v1 saved analyses migrate this from input.prompt.
   */
  prompt: string;
  answerText?: string;
  citations?: Citation[];
  mentions?: MentionAnalysis;
  ranAt?: string;
  error?: { code: EngineErrorCode; message: string };
};

export type EngineQuery = {
  prompt: string;
  brand: string;
  competitors: string[];
  key?: string;
};

export interface EngineClient {
  readonly name: EngineName;
  run(q: EngineQuery): Promise<{
    answerText: string;
    citations: Citation[];
  }>;
}
