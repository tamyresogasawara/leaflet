import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  Citation,
  EngineClient,
  EngineName,
  EngineQuery,
} from "./types";

type Fixture = {
  answerText: string;
  citations: Citation[];
};

async function loadRandomFixture(engine: EngineName): Promise<Fixture> {
  const dir = path.join(process.cwd(), "fixtures", engine);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const pick = files[Math.floor(Math.random() * files.length)] ?? "default.json";
  const raw = await readFile(path.join(dir, pick), "utf-8");
  return JSON.parse(raw) as Fixture;
}

function applyBrand(text: string, brand: string): string {
  if (!brand.trim()) return text;
  return text.replace(/Acme Inc\./g, brand).replace(/\bAcme\b/g, brand);
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class FixtureEngineClient implements EngineClient {
  constructor(public readonly name: EngineName) {}

  async run(q: EngineQuery): Promise<Fixture> {
    const fixture = await loadRandomFixture(this.name);
    // 2–4s per the v0 brief — gives the loading screen time to demonstrate
    // the progressive engine-card pattern.
    const base = this.name === "openai" ? 2000 : 2600;
    await delay(base + Math.random() * 1400);
    return {
      answerText: applyBrand(fixture.answerText, q.brand),
      citations: fixture.citations,
    };
  }
}
