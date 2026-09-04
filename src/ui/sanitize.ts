/**
 * Security and sanitization utilities for HTML rendering and CSV exports.
 */

/**
 * Escape HTML special characters to prevent Cross-Site Scripting (XSS).
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize CSV cell values to prevent CSV Formula Injection (DDE) and format RFC 4180 quotes.
 */
export function sanitizeCsvCell(val: any): string {
  if (val === null || val === undefined) return '""';
  let str = String(val).trim();

  // If cell starts with dangerous formula triggers (=, +, -, @, tab, cr), neutralize it
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }

  // Escape double quotes by doubling them
  str = str.replace(/"/g, '""');

  return `"${str}"`;
}
