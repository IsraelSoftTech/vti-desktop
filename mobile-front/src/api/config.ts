import { Platform } from "react-native";
import Constants from "expo-constants";

export const PRODUCTION_API_URL = "https://api.vtispace.com";

const API_PORT = 4000;

function hostFromExpo(): string | null {
  const debuggerHost =
    Constants.expoGoConfig?.debuggerHost ??
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoClient?.hostUri;

  if (!debuggerHost || typeof debuggerHost !== "string") return null;
  const host = debuggerHost.split(":")[0]?.trim();
  if (!host) return null;
  return host;
}

function fallbackApiUrl() {
  const lanHost = hostFromExpo();
  if (lanHost && lanHost !== "localhost" && lanHost !== "127.0.0.1") {
    return `http://${lanHost}:${API_PORT}`;
  }

  if (Platform.OS === "android") {
    return `http://10.0.2.2:${API_PORT}`;
  }

  return `http://localhost:${API_PORT}`;
}

export function apiBaseUrl() {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  if (typeof __DEV__ !== "undefined" && __DEV__) return fallbackApiUrl();
  return PRODUCTION_API_URL;
}

export function attendanceApiRoot() {
  return `${apiBaseUrl()}/api/attendance`;
}

export function privacyPolicyUrl() {
  return `${apiBaseUrl()}/privacy`;
}

export function accountDeletionUrl() {
  return `${apiBaseUrl()}/delete-account`;
}
