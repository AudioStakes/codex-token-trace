export const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const escapeAttr = (value: string): string =>
  escapeHtml(value).replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export const help = (text: string): string => {
  const escaped = escapeAttr(text);
  return `<button class="help" type="button" aria-label="${escaped}" data-tip="${escaped}">?</button>`;
};
