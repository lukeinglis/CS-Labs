/**
 * Just enough EXIF to answer one question: when was this photo taken?
 *
 * A scoreboard carries no date of its own. The timer in the corner is how long the match
 * ran, not when it was played, so the only trustworthy clock is the one in the camera
 * that took the picture. Reading it means a screenshot uploaded days later still files
 * itself under the night it was actually played, instead of under the upload.
 *
 * This is a few dozen lines rather than a dependency because the need is one tag, and
 * the full spec is enormous. Anything unexpected returns null and the caller falls back.
 */

const JPEG_SOI = 0xffd8;
const MARKER_APP1 = 0xe1;
/** Entropy-coded image data starts here, so there are no more headers to find. */
const MARKER_SOS = 0xda;
const MARKER_EOI = 0xd9;

const TIFF_LITTLE_ENDIAN = 0x4949;
const TIFF_BIG_ENDIAN = 0x4d4d;
const TIFF_MAGIC = 42;

const TAG_DATE_TIME = 0x0132; // IFD0: when the file was last written.
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003; // Exif IFD: when the shutter fired.

const TYPE_ASCII = 2;
const ENTRY_BYTES = 12;
/** "YYYY:MM:DD HH:MM:SS" plus a NUL. */
const DATE_BYTES = 20;

/**
 * Finds the Exif block inside a JPEG by walking the marker segments. Returns the offset
 * of the TIFF header, which every other offset in the block is relative to.
 */
function findTiffHeader(view: DataView): number | null {
  if (view.byteLength < 4 || view.getUint16(0) !== JPEG_SOI) return null;

  let offset = 2;
  // Every segment is 0xFF, a marker byte, then a two-byte length that counts itself.
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;

    const marker = view.getUint8(offset + 1);
    if (marker === MARKER_SOS || marker === MARKER_EOI) return null;

    const length = view.getUint16(offset + 2);
    if (length < 2) return null;

    const payload = offset + 4;
    if (marker === MARKER_APP1 && payload + 6 <= view.byteLength) {
      // "Exif\0\0" distinguishes it from the XMP block, which is also APP1.
      const isExif =
        view.getUint32(payload) === 0x45786966 && view.getUint16(payload + 4) === 0;
      if (isExif) return payload + 6;
    }

    offset += 2 + length;
  }
  return null;
}

/** Reads the ASCII value of `tag` from the IFD at `ifd`, or null if it is not there. */
function readAsciiTag(
  view: DataView,
  tiff: number,
  ifd: number,
  tag: number
): string | null {
  const offset = readTagOffset(view, tiff, ifd, tag, TYPE_ASCII);
  if (offset === null) return null;

  let text = "";
  for (let i = 0; i < DATE_BYTES && offset + i < view.byteLength; i++) {
    const byte = view.getUint8(offset + i);
    if (byte === 0) break;
    text += String.fromCharCode(byte);
  }
  return text || null;
}

/**
 * Locates a tag's value. Values of four bytes or fewer sit inline in the entry itself;
 * anything longer, which a date always is, is stored elsewhere and pointed at.
 */
function readTagOffset(
  view: DataView,
  tiff: number,
  ifd: number,
  tag: number,
  expectedType: number
): number | null {
  const le = view.getUint16(tiff) === TIFF_LITTLE_ENDIAN;
  if (ifd + 2 > view.byteLength) return null;

  const count = view.getUint16(ifd, le);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * ENTRY_BYTES;
    if (entry + ENTRY_BYTES > view.byteLength) return null;

    if (view.getUint16(entry, le) !== tag) continue;
    if (view.getUint16(entry + 2, le) !== expectedType) return null;

    const values = view.getUint32(entry + 4, le);
    return values <= 4 ? entry + 8 : tiff + view.getUint32(entry + 8, le);
  }
  return null;
}

/** Reads a pointer-typed tag, which is a LONG rather than an ASCII run. */
function readPointerTag(view: DataView, tiff: number, ifd: number, tag: number): number | null {
  const le = view.getUint16(tiff) === TIFF_LITTLE_ENDIAN;
  if (ifd + 2 > view.byteLength) return null;

  const count = view.getUint16(ifd, le);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * ENTRY_BYTES;
    if (entry + ENTRY_BYTES > view.byteLength) return null;
    if (view.getUint16(entry, le) === tag) return tiff + view.getUint32(entry + 8, le);
  }
  return null;
}

/**
 * EXIF writes "2026:10:15 09:41:03" with no timezone, which is already local wall-clock
 * time. That is exactly what a datetime-local input wants, so there is no conversion to
 * get wrong: reading it as an instant and formatting it back would shift it.
 */
function toLocalInput(exifDate: string): string | null {
  const m = exifDate.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return null;

  const [, year, month, day, hour, minute] = m;
  // Cameras write all zeroes when the clock has never been set.
  if (year === "0000" || month === "00" || day === "00") return null;

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Returns when the photo was taken as a local wall-clock string, or null for anything
 * without a usable timestamp. A Steam screenshot has no EXIF at all, so null is the
 * normal answer for a PC capture rather than a failure.
 */
export function readPhotoTakenAt(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 4) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let tiff: number | null;
  try {
    tiff = findTiffHeader(view);
  } catch {
    return null;
  }
  if (tiff === null || tiff + 8 > view.byteLength) return null;

  try {
    const order = view.getUint16(tiff);
    if (order !== TIFF_LITTLE_ENDIAN && order !== TIFF_BIG_ENDIAN) return null;

    const le = order === TIFF_LITTLE_ENDIAN;
    if (view.getUint16(tiff + 2, le) !== TIFF_MAGIC) return null;

    const ifd0 = tiff + view.getUint32(tiff + 4, le);

    // The shutter time lives in the Exif sub-IFD. IFD0's DateTime is the file's own
    // modified time, which editing or copying can bump, so it is only a fallback.
    const exifIfd = readPointerTag(view, tiff, ifd0, TAG_EXIF_IFD_POINTER);
    const taken =
      (exifIfd !== null ? readAsciiTag(view, tiff, exifIfd, TAG_DATE_TIME_ORIGINAL) : null) ??
      readAsciiTag(view, tiff, ifd0, TAG_DATE_TIME);

    return taken ? toLocalInput(taken) : null;
  } catch {
    // A truncated or malformed header is not worth distinguishing from an absent one.
    return null;
  }
}
