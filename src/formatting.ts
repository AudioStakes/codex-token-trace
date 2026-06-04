export const formatInt = (value: number | null | undefined): string => {
  if (value === null || value === undefined) {
    return "-";
  }
  return new Intl.NumberFormat("en-US").format(value);
};

export const formatPct = (value: number | null | undefined): string => {
  if (value === null || value === undefined) {
    return "-";
  }
  return `${(value * 100).toFixed(1)}%`;
};

export const shorten = (value: string, width: number): string => {
  const text = value.replaceAll("\n", "\\n");
  if (text.length <= width) {
    return text;
  }
  return `${text.slice(0, Math.max(0, width - 1))}…`;
};

export const table = (headers: string[], rows: Array<Array<string | number>>): string => {
  const stringRows = rows.map((row) => row.map(String));
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...stringRows.map((row) => row[index]?.length ?? 0)),
  );

  const render = (row: string[]): string =>
    row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ");

  return [
    render(headers),
    render(widths.map((width) => "-".repeat(width))),
    ...stringRows.map(render),
  ].join("\n");
};
