import { SettingsView } from "@/components/SettingsView";

export default function SettingsPage() {
  const engineMode =
    (process.env.ENGINE_MODE as "fixture" | "live" | undefined) ?? "fixture";
  return <SettingsView engineMode={engineMode} />;
}
