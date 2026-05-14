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
