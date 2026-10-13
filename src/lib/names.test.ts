import { describe, expect, it } from "vitest";
import { normalizeName } from "./names";

describe("normalizeName", () => {
  it("folds case and surrounding whitespace", () => {
    expect(normalizeName("  LukeI  ")).toBe(normalizeName("lukei"));
  });

  it("strips a bracketed clan tag", () => {
    expect(normalizeName("[CSL] lukei")).toBe(normalizeName("lukei"));
    expect(normalizeName("(csl) lukei")).toBe(normalizeName("lukei"));
    expect(normalizeName("{CSL}lukei")).toBe(normalizeName("lukei"));
  });

  it("strips a trailing bracketed tag too", () => {
    expect(normalizeName("lukei [CSL]")).toBe(normalizeName("lukei"));
  });

  it("strips a pipe-delimited tag prefix", () => {
    expect(normalizeName("CSL | lukei")).toBe(normalizeName("lukei"));
  });

  it("folds accents and fullwidth glyphs onto plain letters", () => {
    expect(normalizeName("lükeï")).toBe(normalizeName("lukei"));
    expect(normalizeName("ｌｕｋｅｉ")).toBe(normalizeName("lukei"));
  });

  it("ignores decorative punctuation and spacing", () => {
    expect(normalizeName("l u k e i")).toBe(normalizeName("lukei"));
    expect(normalizeName("-=lukei=-")).toBe(normalizeName("lukei"));
    expect(normalizeName("luke_i")).toBe(normalizeName("lukei"));
  });

  it("keeps digits, since they are often part of the handle", () => {
    expect(normalizeName("lukei")).not.toBe(normalizeName("lukei99"));
  });

  it("does not fold leetspeak, which would merge different people", () => {
    expect(normalizeName("s1mple")).not.toBe(normalizeName("simple"));
  });

  it("keeps two genuinely different handles apart", () => {
    expect(normalizeName("lukei")).not.toBe(normalizeName("mikei"));
  });

  it("never returns an empty key for an all-punctuation handle", () => {
    expect(normalizeName("***")).not.toBe("");
    expect(normalizeName("***")).not.toBe(normalizeName("###"));
  });
});
