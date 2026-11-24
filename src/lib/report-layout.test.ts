import { describe, expect, it } from "vitest";
import { paginateReportTableRows, wrapReportTableRows } from "./report-layout";

describe("wrapReportTableRows", () => {
  it("preserves wrapped cell content and aligns rows to the tallest cell", () => {
    const rows = wrapReportTableRows(
      [["Sensor", "Sentinel-2 MSI L2A, Copernicus Data Space"]],
      [40, 50],
      (text, width) => {
        if (text.length * 2 <= width) return [text];
        return [text.slice(0, 10), text.slice(10)];
      },
    );

    expect(rows).toEqual([{
      cells: [
        ["Sensor"],
        ["Sentinel-2", " MSI L2A, Copernicus Data Space"],
      ],
      lineCount: 2,
    }]);
  });

  it("fills missing cells and keeps empty rows renderable", () => {
    const rows = wrapReportTableRows(
      [["Only one cell"], []],
      [40, 40],
      (text) => [text],
    );

    expect(rows).toEqual([
      { cells: [["Only one cell"], [""]], lineCount: 1 },
      { cells: [[""], [""]], lineCount: 1 },
    ]);
  });

  it("moves rows and long wrapped cells to continuation pages without dropping lines", () => {
    const result = paginateReportTableRows([1, 3, 80], 70, 100, 8, 10, 4, 4, 8);

    expect(result.startOnNewPage).toBe(false);
    expect(result.chunks[0]).toMatchObject({ rowIndex: 0, lineOffset: 0, lineCount: 1 });
    expect(result.chunks.some((chunk) => chunk.pageBreakBefore)).toBe(true);

    const retainedLines = [0, 1, 2].map((rowIndex) =>
      result.chunks
        .filter((chunk) => chunk.rowIndex === rowIndex)
        .reduce((sum, chunk) => sum + chunk.lineCount, 0)
    );
    expect(retainedLines).toEqual([1, 3, 80]);

    let y = result.startOnNewPage ? 18 : 78;
    result.chunks.forEach((chunk) => {
      if (chunk.pageBreakBefore) y = 18;
      y += chunk.height;
      expect(y).toBeLessThanOrEqual(100);
    });
  });
});
