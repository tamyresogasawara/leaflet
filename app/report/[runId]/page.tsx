import { ReportClient } from "@/components/pdf/ReportClient";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <ReportClient runId={runId} />;
}
