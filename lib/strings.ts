import { brand } from "@/brand.config";

const dictionary = {
  appName: brand.appName,
  tagline: "See how AI answers describe your brand.",
  sub: `Run one prompt across ChatGPT and Claude. Get the answers, mention rate, and citations in under a minute.`,
} as const;

type Key = keyof typeof dictionary;

export function t(key: Key): string {
  return dictionary[key];
}
