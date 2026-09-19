/**
 * Lightweight translation helper for menu bulk import.
 *
 * No API keys are used. We attempt two free, key-less public endpoints:
 *   1. Google translate_a/single (client=gtx)
 *   2. MyMemory translated.net
 *
 * translateText NEVER throws — it returns null on total failure.
 */

type Lang = "zh" | "en" | "th";

// Map our internal lang codes to what the endpoints expect.
const GOOGLE_LANG: Record<Lang, string> = { zh: "zh-CN", en: "en", th: "th" };

async function withTimeout(ms: number): Promise<AbortController> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  // Ensure the timer does not keep the process alive.
  if (typeof timer === "object" && "unref" in timer) {
    (timer as unknown as { unref: () => void }).unref();
  }
  return ctrl;
}

async function googleTranslate(text: string, from: Lang, to: Lang): Promise<string | null> {
  const sl = GOOGLE_LANG[from];
  const tl = GOOGLE_LANG[to];
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=` +
    encodeURIComponent(text);

  const ctrl = await withTimeout(8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    const segments = Array.isArray(data) ? (data as unknown[])[0] : undefined;
    if (!Array.isArray(segments)) return null;
    const out = (segments as unknown[])
      .map((seg) => {
        const arr = seg as unknown[];
        return arr && typeof arr[0] === "string" ? arr[0] : "";
      })
      .join("");
    const trimmed = out.trim();
    return trimmed || null;
  } catch {
    return null;
  } finally {
    clearTimeout(ctrl.signal as unknown as ReturnType<typeof setTimeout>);
  }
}

async function myMemoryTranslate(text: string, from: Lang, to: Lang): Promise<string | null> {
  const langpair = `${from}|${to}`;
  const url =
    `https://api.mymemory.translated.net/get?q=` +
    encodeURIComponent(text) +
    `&langpair=` +
    encodeURIComponent(langpair);

  const ctrl = await withTimeout(8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      responseStatus?: number | string;
      responseData?: { translatedText?: string };
    };

    if (data.responseStatus !== undefined && data.responseStatus !== 200) {
      return null;
    }
    const t = data.responseData?.translatedText;
    if (typeof t !== "string") return null;
    if (t.includes("MYMEMORY WARNING")) return null;
    const trimmed = t.trim();
    return trimmed || null;
  } catch {
    return null;
  } finally {
    clearTimeout(ctrl.signal as unknown as ReturnType<typeof setTimeout>);
  }
}

/**
 * Translate a single string. Returns the translated text, or null on failure.
 * Never throws.
 */
export async function translateText(
  text: string,
  from: Lang,
  to: Lang,
): Promise<string | null> {
  if (!text || !text.trim()) return null;
  if (from === to) return text.trim();

  const attempts = [() => googleTranslate(text, from, to), () => myMemoryTranslate(text, from, to)];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result) return result;
    } catch {
      // swallow and try next
    }
  }
  return null;
}
