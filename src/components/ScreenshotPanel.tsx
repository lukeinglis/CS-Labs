"use client";

import { useRef, useState } from "react";
import { extractScoreboard } from "@/app/submit/actions";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import type { DraftMatch } from "@/lib/draft";

/**
 * Anthropic downsamples anything longer than this on its longest edge, so sending more
 * pixels buys nothing and a 5MB phone photo would not fit in a server action anyway.
 */
const MAX_EDGE = 1568;
const JPEG_QUALITY = 0.85;

export type Extraction = {
  blobUrl: string;
  extractionModel: string;
  /** The draft exactly as the model read it, kept to diff against on save. */
  original: DraftMatch;
};

/**
 * Resizes in the browser. This has to happen client side: a server action body caps at
 * a couple of megabytes and a Vercel function at 4.5MB, both well under a modern phone
 * photo. `from-image` honours the EXIF rotation that phones set instead of rotating the
 * pixels, without which half the uploads would arrive sideways.
 */
async function downscaleToJpegBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot resize the image.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) throw new Error("This browser could not read the image.");

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

export default function ScreenshotPanel({
  passphrase,
  playedAt,
  onExtracted,
}: {
  passphrase: string;
  playedAt: string;
  onExtracted: (draft: DraftMatch, extraction: Extraction) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "reading">("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);

  async function handleFile(file: File) {
    setStatus("reading");
    setErrors([]);
    setWarnings([]);

    try {
      const base64 = await downscaleToJpegBase64(file);
      setPreview(`data:image/jpeg;base64,${base64}`);

      const result = await extractScoreboard({ passphrase, imageBase64: base64, playedAt });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setWarnings(result.warnings);
      onExtracted(result.draft, {
        blobUrl: result.blobUrl,
        extractionModel: result.extractionModel,
        original: result.draft,
      });
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setStatus("idle");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start from a screenshot</CardTitle>
        <span className="text-xs uppercase tracking-wider text-gray-500">optional</span>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-400">
          Upload the end of match scoreboard and the numbers get filled in for you. Check them
          before you save. A mid match shot works too.
        </p>

        <input
          ref={input}
          type="file"
          accept="image/*"
          aria-label="Scoreboard screenshot"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Clearing lets the same file be picked again after a failed read.
            e.target.value = "";
            if (file) handleFile(file);
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={status === "reading" || !passphrase}
            onClick={() => input.current?.click()}
            className="rounded-lg border border-accent/40 px-4 py-2 font-heading text-sm font-bold uppercase tracking-wider text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "reading" ? "Reading the scoreboard" : "Choose a screenshot"}
          </button>
          {!passphrase && (
            <span className="text-xs text-gray-500">Enter the passphrase first.</span>
          )}
        </div>

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="The scoreboard that was read"
            className="max-h-64 w-auto rounded-lg border border-white/10"
          />
        )}

        {errors.map((e) => (
          <p key={e} className="text-sm text-loss">
            {e}
          </p>
        ))}

        {warnings.length > 0 && (
          <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Worth a second look
            </p>
            {warnings.map((w) => (
              <p key={w} className="text-sm text-amber-200/80">
                {w}
              </p>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
