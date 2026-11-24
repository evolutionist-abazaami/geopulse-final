export type ReportTextWrapper = (text: string, width: number) => string | string[];

export interface WrappedReportTableRow {
  cells: string[][];
  lineCount: number;
}

export interface ReportTableRowChunk {
  rowIndex: number;
  lineOffset: number;
  lineCount: number;
  height: number;
  pageBreakBefore: boolean;
}

export interface ReportTablePagination {
  startOnNewPage: boolean;
  chunks: ReportTableRowChunk[];
  endY: number;
}

export function wrapReportTableRows(
  rows: string[][],
  columnWidths: number[],
  wrapText: ReportTextWrapper,
  horizontalPadding = 4,
): WrappedReportTableRow[] {
  return rows.map((row) => {
    const cells = columnWidths.map((width, columnIndex) => {
      const value = row[columnIndex] ?? "";
      const wrapped = wrapText(value, Math.max(1, width - horizontalPadding));
      const lines = typeof wrapped === "string" ? [wrapped] : wrapped;
      return lines.length > 0 ? lines : [""];
    });

    return {
      cells,
      lineCount: Math.max(1, ...cells.map((lines) => lines.length)),
    };
  });
}

export function paginateReportTableRows(
  rowLineCounts: number[],
  startY: number,
  bottomLimit: number,
  headerHeight: number,
  continuationTopY: number,
  lineHeight = 3.5,
  rowPadding = 4,
  minimumRowHeight = 8,
): ReportTablePagination {
  const startOnNewPage = startY + headerHeight + minimumRowHeight > bottomLimit;
  let currentY = (startOnNewPage ? continuationTopY : startY) + headerHeight;
  const chunks: ReportTableRowChunk[] = [];

  rowLineCounts.forEach((inputLineCount, rowIndex) => {
    const lineCount = Math.max(1, Math.floor(inputLineCount));
    let lineOffset = 0;

    while (lineOffset < lineCount) {
      let pageBreakBefore = false;
      if (currentY + minimumRowHeight > bottomLimit) {
        currentY = continuationTopY + headerHeight;
        pageBreakBefore = true;
      }

      const availableLines = Math.max(
        1,
        Math.floor((bottomLimit - currentY - rowPadding) / lineHeight),
      );
      const chunkLineCount = Math.min(lineCount - lineOffset, availableLines);
      const height = Math.max(minimumRowHeight, chunkLineCount * lineHeight + rowPadding);
      chunks.push({
        rowIndex,
        lineOffset,
        lineCount: chunkLineCount,
        height,
        pageBreakBefore,
      });
      currentY += height;
      lineOffset += chunkLineCount;
    }
  });

  return { startOnNewPage, chunks, endY: currentY };
}
