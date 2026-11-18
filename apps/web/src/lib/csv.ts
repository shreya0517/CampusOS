/** Quotes each cell and neutralises values a spreadsheet would run as formulas. */
export const csvCell = (value: string | number | null): string => {
  const text = value === null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Saves rows as a CSV file in the browser. */
export function downloadCsv(filename: string, rows: Array<Array<string | number | null>>): void {
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
