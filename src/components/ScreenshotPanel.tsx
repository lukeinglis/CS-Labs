"use client";

import { useRef, useState } from "react";
import { extractScoreboard } from "@/app/submit/actions";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import type { DraftMatch } from "@/lib/draft";
import { readPhotoTakenAt } from "@/lib/exif";

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
  /** When the camera says the photo was taken, or null if it carried no date. */
  photoTakenAt: string | null;
};

/**
 * EXIF sits in the first marker segment, so a slice off the front is enough and a 5MB
 * photo never has to be held in memory twice. It has to be read from the file the user
 * picked: the canvas downscale re-encodes the pixels and drops every tag with them.
 */
const EXIF_SCAN_BYTES = 256 * 1024;

async function readTakenAt(file: File): Promise<string | null> {
  try {
    const head = await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer();
    return readPhotoTakenAt(new Uint8Array(head));
  } catch {
    return null;
  }
}

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
  reading,
  onExtracted,
}: {
  passphrase: string;
  /** True while nothing has been read yet, which is when this panel is the whole page. */
  reading: boolean;
  onExtracted: (draft: DraftMatch, extraction: Extraction) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "reading">("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    setStatus("reading");
    setErrors([]);
    setWarnings([]);

    try {
      const takenAt = await readTakenAt(file);
      const base64 = await downscaleToJpegBase64(file);
      setPreview(`data:image/jpeg;base64,${base64}`);

      const result = await extractScoreboard({ passphrase, imageBase64: base64 });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setWarnings(result.warnings);
      onExtracted(result.draft, {
        blobUrl: result.blobUrl,
        extractionModel: result.extractionModel,
        original: result.draft,
        photoTakenAt: takenAt,
      });
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setStatus("idle");
    }
  }

  const busy = status === "reading";
  const locked = busy || !passphrase;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{reading ? "Upload the scoreboard" : "The screenshot"}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
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

        {/* The dropzone shrinks to a swap button once a scoreboard has been read, so the
            thing to review is what fills the page from then on. */}
        {reading ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!locked) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file && !locked) handleFile(file);
            }}
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragging ? "border-accent bg-accent/5" : "border-white/15"
            }`}
          >
            <p className="font-heading text-base font-bold uppercase tracking-wider text-white">
              {busy ? "Reading the scoreboard" : "Drop the end of match scoreboard here"}
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Every number gets filled in for you, players included. A mid match shot works
              too. You just check it over before saving.
            </p>
            <button
              type="button"
              disabled={locked}
              onClick={() => input.current?.click()}
              className="mt-5 rounded-lg bg-accent px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wider text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Working on it" : "Choose a screenshot"}
            </button>
            {!passphrase && (
              <p className="mt-3 text-xs text-gray-500">
                Enter your name and the passphrase above first.
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={locked}
            onClick={() => input.current?.click()}
            className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:border-accent/30 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Reading the scoreboard" : "Read a different screenshot"}
          </button>
        )}

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
