import { EXTRACTION_PROMPT, parseExtraction, type RawScoreboard } from "./extract";

/**
 * Sonnet reads these scoreboards exactly right, including clan tags and symbols in
 * handles, on a glare-heavy phone photo of a monitor. There is no accuracy headroom
 * worth paying Opus for, and a human confirms every extraction anyway.
 */
export const EXTRACTION_MODEL = "claude-sonnet-4-6";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 60_000;

export function isVisionConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export class VisionError extends Error {}

/**
 * Reads a scoreboard image. The caller is responsible for having already downscaled it;
 * the model resizes anything over ~1568px on its longest edge regardless, so a full size
 * phone photo only buys upload time.
 */
export async function readScoreboard(
  base64Jpeg: string
): Promise<{ raw: RawScoreboard; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new VisionError("Screenshot reading is not configured.");

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg },
              },
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          },
        ],
      }),
    });
  } catch {
    throw new VisionError("Could not reach the screenshot reader. Try again.");
  }

  if (!res.ok) {
    // The upstream body can carry the API key back in an error echo, so it is logged
    // rather than returned to the browser.
    console.error("anthropic extraction failed", res.status, await res.text().catch(() => ""));
    throw new VisionError(
      res.status === 429
        ? "The screenshot reader is rate limited right now. Try again in a minute."
        : "The screenshot reader failed. Enter the scoreboard by hand."
    );
  }

  const body = (await res.json()) as {
    content: { type: string; text?: string }[];
  };
  const text = body.content.find((c) => c.type === "text")?.text ?? "";

  try {
    return { raw: parseExtraction(text), model: EXTRACTION_MODEL };
  } catch (err) {
    throw new VisionError(
      `Could not make sense of that screenshot: ${(err as Error).message} Enter it by hand, or try a clearer shot.`
    );
  }
}
