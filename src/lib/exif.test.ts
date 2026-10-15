import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readPhotoTakenAt } from "./exif";

/**
 * Builds the smallest JPEG that carries a date: SOI, an Exif APP1 segment holding a TIFF
 * block with one sub-IFD, then EOI. Hand-assembling it keeps the test honest about the
 * offsets, which is where this kind of parser actually goes wrong.
 */
function jpegWithExif(
  date: string,
  { bigEndian = false, tag = 0x9003 }: { bigEndian?: boolean; tag?: number } = {}
): Uint8Array {
  const le = !bigEndian;
  const tiff = new Uint8Array(64);
  const v = new DataView(tiff.buffer);

  v.setUint16(0, le ? 0x4949 : 0x4d4d);
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le); // IFD0 sits right after the header.

  const inIfd0 = tag !== 0x9003;
  if (inIfd0) {
    // The fallback case: the date hangs off IFD0 directly, with no sub-IFD.
    v.setUint16(8, 1, le);
    v.setUint16(10, tag, le);
    v.setUint16(12, 2, le); // ASCII
    v.setUint32(14, 20, le);
    v.setUint32(18, 44, le);
    v.setUint32(22, 0, le);
  } else {
    v.setUint16(8, 1, le);
    v.setUint16(10, 0x8769, le); // Exif IFD pointer
    v.setUint16(12, 4, le); // LONG
    v.setUint32(14, 1, le);
    v.setUint32(18, 26, le);
    v.setUint32(22, 0, le);

    v.setUint16(26, 1, le);
    v.setUint16(28, tag, le);
    v.setUint16(30, 2, le); // ASCII
    v.setUint32(32, 20, le);
    v.setUint32(36, 44, le);
    v.setUint32(40, 0, le);
  }

  for (let i = 0; i < date.length && i < 19; i++) tiff[44 + i] = date.charCodeAt(i);

  const header = [0xff, 0xd8, 0xff, 0xe1];
  const length = 2 + 6 + tiff.length;
  return new Uint8Array([
    ...header,
    (length >> 8) & 0xff,
    length & 0xff,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    ...tiff,
    0xff, 0xd9,
  ]);
}

describe("readPhotoTakenAt", () => {
  it("reads the shutter time a phone recorded", () => {
    expect(readPhotoTakenAt(jpegWithExif("2026:10:13 22:15:04"))).toBe("2026-10-13T22:15");
  });

  it("reads a big-endian file, which is what most cameras write", () => {
    expect(readPhotoTakenAt(jpegWithExif("2026:01:02 03:04:05", { bigEndian: true }))).toBe(
      "2026-01-02T03:04"
    );
  });

  it("falls back to the file timestamp when there is no shutter time", () => {
    expect(readPhotoTakenAt(jpegWithExif("2026:07:08 09:10:11", { tag: 0x0132 }))).toBe(
      "2026-07-08T09:10"
    );
  });

  // The value is already local wall-clock with no zone, so reading it must not shift it.
  it("does not time-shift the value it read", () => {
    expect(readPhotoTakenAt(jpegWithExif("2026:12:31 23:59:00"))).toBe("2026-12-31T23:59");
  });

  it("ignores a camera whose clock was never set", () => {
    expect(readPhotoTakenAt(jpegWithExif("0000:00:00 00:00:00"))).toBeNull();
  });

  // A Steam screenshot carries no EXIF, which is normal input rather than a failure.
  it("returns null for a JPEG with no Exif block", () => {
    expect(readPhotoTakenAt(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });

  it("returns null rather than throwing on junk", () => {
    expect(readPhotoTakenAt(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
    expect(readPhotoTakenAt(new Uint8Array(0))).toBeNull();
    expect(readPhotoTakenAt(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00]))).toBeNull();
  });

  it("returns null on a truncated Exif block", () => {
    expect(readPhotoTakenAt(jpegWithExif("2026:10:13 22:15:04").slice(0, 20))).toBeNull();
  });

  // The fixtures are gitignored because they carry real handles, so this only runs for
  // whoever has the photos locally.
  const real = "fixtures/scoreboards/IMG_4044.JPG";
  it.skipIf(!existsSync(real))("reads the real phone photo", () => {
    const taken = readPhotoTakenAt(new Uint8Array(readFileSync(real)));
    expect(taken).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
