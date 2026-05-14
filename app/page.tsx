import { InputForm } from "@/components/InputForm";
import { t } from "@/lib/strings";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        {t("tagline")}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted">{t("sub")}</p>
      <div className="mt-8">
        <InputForm />
      </div>
    </div>
  );
}
