import { NextResponse } from "next/server";
import { progress, runMap } from "@/lib/runMap";

type Params = { params: Promise<{ runId: string }> };

export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const { runId } = await params;
  const state = runMap.get(runId);
  if (!state) {
    return NextResponse.json({ error: "Unknown runId" }, { status: 404 });
  }
  return NextResponse.json({
    runId: state.runId,
    status: state.status,
    progress: progress(state),
    results: state.results,
    input: state.input,
  });
}
