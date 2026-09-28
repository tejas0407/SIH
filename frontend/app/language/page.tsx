"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import EmblemPlaceholder from "@/components/gov/EmblemPlaceholder";
import { LANGUAGES, STRINGS, useLang, type Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Shown right after sign-in: the reviewer picks the regional language the
 * portal pairs with English. Every label on the page previews the selection,
 * so the choice is visible before it is confirmed.
 */
export default function LanguagePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-surface" />}>
      <Chooser />
    </Suspense>
  );
}

function Chooser() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("next") || "/";
  // Only ever continue to a path on this site.
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  const { lang, hydrated, hydrate, setLang } = useLang();
  const [choice, setChoice] = useState<Lang | null>(null);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const selected = choice ?? lang;
  const say = (key: keyof typeof STRINGS) => STRINGS[key][selected];

  const confirm = () => {
    setLang(selected);
    router.replace(next);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-3xl">
        <header className="mb-6 flex items-center gap-3">
          <EmblemPlaceholder className="h-10 w-10 shrink-0 text-ink" />
          <div className="leading-tight">
            <div className="text-[9px] uppercase tracking-[0.14em] text-amber-500">
              <span className="font-vernacular">{say("ministry")}</span> · {STRINGS.ministry.en}
            </div>
            <h1 className="text-xl font-semibold">
              <span className="font-vernacular">{say("choose_language")}</span>
              <span className="mx-2 font-normal text-ink-faint">/</span>
              {STRINGS.choose_language.en}
            </h1>
          </div>
        </header>

        <p className="mb-5 text-sm text-ink-muted">
          <span className="font-vernacular">{say("choose_language_hint")}</span>
          <br />
          {STRINGS.choose_language_hint.en}
        </p>

        <div
          role="radiogroup"
          aria-label="Choose your language"
          className="flex flex-wrap gap-3"
        >
          {LANGUAGES.map((option) => {
            const active = option.code === selected;
            return (
              <button
                key={option.code}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${option.native} — ${option.english}`}
                lang={option.code}
                onClick={() => setChoice(option.code)}
                className={`relative flex min-h-[6.5rem] flex-1 basis-[calc(50%-0.75rem)] flex-col items-start justify-between rounded-lg border bg-panel p-4 text-left transition-colors sm:basis-[calc(25%-0.75rem)] ${
                  active
                    ? "border-focus shadow-[0_0_0_3px_var(--focus-wash)]"
                    : "border-rule hover:border-rule-strong"
                }`}
              >
                <span className="font-vernacular text-2xl font-semibold leading-tight text-ink">
                  {option.native}
                </span>
                <span className="text-xs text-ink-muted">{option.english}</span>
                {active && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-focus text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" className="btn btn-primary" onClick={confirm}>
            <span className="font-vernacular">{say("continue")}</span>
            <span className="opacity-60">/</span>
            {STRINGS.continue.en}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </main>
  );
}
