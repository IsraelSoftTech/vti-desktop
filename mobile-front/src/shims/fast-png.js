/** Stub: jsPDF pulls fast-png for PNG decode; Expo TextDecoder lacks latin1. ID cards use JPEG only. */
export function decode() {
  throw new Error("PNG decode is unavailable in React Native");
}

export function encode() {
  throw new Error("PNG encode is unavailable in React Native");
}
