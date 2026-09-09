/** Shared Poppins stack for app UI and print/PDF HTML documents. */
export const POPPINS_FONT_STACK = '"Poppins", sans-serif';

export const POPPINS_GOOGLE_FONTS_HEAD = `
<style>
@font-face { font-family: "Poppins"; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/poppins-latin-400-normal.woff2") format("woff2"); }
@font-face { font-family: "Poppins"; font-style: normal; font-weight: 500; font-display: swap; src: url("/fonts/poppins-latin-500-normal.woff2") format("woff2"); }
@font-face { font-family: "Poppins"; font-style: normal; font-weight: 600; font-display: swap; src: url("/fonts/poppins-latin-600-normal.woff2") format("woff2"); }
@font-face { font-family: "Poppins"; font-style: normal; font-weight: 700; font-display: swap; src: url("/fonts/poppins-latin-700-normal.woff2") format("woff2"); }
@font-face { font-family: "Poppins"; font-style: normal; font-weight: 800; font-display: swap; src: url("/fonts/poppins-latin-800-normal.woff2") format("woff2"); }
</style>
`.trim();

export const POPPINS_BODY_FONT_CSS = `font-family: ${POPPINS_FONT_STACK};`;
