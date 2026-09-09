import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { registerParentDevice } from "../api/parent";

/**
 * Parent alerts: local OS banners while MPASAT is open, plus Expo/FCM
 * lock-screen push when google-services.json is in the binary and a parent
 * has registered this phone at least once.
 */

type NotificationsModule = typeof import("expo-notifications");

export const PARENT_ALERT_CHANNEL_ID = "parent-alerts";
export const PARENT_PUSH_TITLE = "MPASAT";

const PRESENTED_CAP = 250;
const TOKEN_KEY = "parent_expo_push_token";
const READY_KEY = "parent_push_ready";
const presentedAlertIds = new Set<string>();

let handledResponseKey = "";
let notificationsMod: NotificationsModule | null | undefined;
let setupPromise: Promise<void> | null = null;
let remotePushReady = false;
let registerPromise: Promise<string | null> | null = null;

function getNotifications(): NotificationsModule | null {
  if (notificationsMod !== undefined) return notificationsMod;
  try {
    notificationsMod = require("expo-notifications") as NotificationsModule;
  } catch (err) {
    console.warn("[parent-alert] module unavailable", (err as Error)?.message || err);
    notificationsMod = null;
  }
  return notificationsMod;
}

export type ParentPushPayload = {
  kind?: string;
  screen?: string;
  studentId?: number | string | null;
  studentName?: string | null;
  date?: string;
  threadId?: number | string | null;
  notificationId?: number | string;
  preview?: boolean;
};

function asRecord(value: unknown): ParentPushPayload {
  if (!value || typeof value !== "object") return {};
  return value as ParentPushPayload;
}

export function parsePushData(value: unknown): ParentPushPayload {
  return asRecord(value);
}

function rememberPresented(id: string): boolean {
  if (presentedAlertIds.has(id)) return false;
  presentedAlertIds.add(id);
  if (presentedAlertIds.size > PRESENTED_CAP) {
    const oldest = presentedAlertIds.values().next().value;
    if (oldest) presentedAlertIds.delete(oldest);
  }
  return true;
}

function forgetPresented(id: string) {
  presentedAlertIds.delete(id);
}

function expoProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId || Constants.easConfig?.projectId || null;
}

async function ensureAndroidChannel(Notifications: NotificationsModule) {
  if (Platform.OS !== "android") return;
  const spec = {
    description: "Check-in, check-out, miss, and school chat alerts",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default" as const,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
    enableVibrate: true,
    bypassDnd: false,
  };
  await Notifications.setNotificationChannelAsync(PARENT_ALERT_CHANNEL_ID, {
    name: "Student alerts",
    ...spec,
  });
  await Notifications.setNotificationChannelAsync("default", {
    name: "MPASAT alerts",
    ...spec,
  });
}

/** One Android channel, OS default sound. Safe to call more than once. */
export async function setupParentAlerts() {
  if (Platform.OS === "web") return;
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    const Notifications = getNotifications();
    if (!Notifications) return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    await ensureAndroidChannel(Notifications);
  })().catch((err) => {
    setupPromise = null;
    console.warn("[parent-alert] setup failed", (err as Error)?.message || err);
  });
  return setupPromise;
}

export async function getParentAlertPermission(): Promise<{
  granted: boolean;
  canAsk: boolean;
  physicalDevice: boolean;
}> {
  if (Platform.OS === "web") {
    return { granted: false, canAsk: false, physicalDevice: false };
  }
  const Notifications = getNotifications();
  const physicalDevice = Device.isDevice;
  if (!Notifications) {
    return { granted: false, canAsk: false, physicalDevice };
  }
  const existing = await Notifications.getPermissionsAsync();
  return {
    granted: existing.status === "granted" || existing.granted === true,
    canAsk: existing.canAskAgain !== false,
    physicalDevice,
  };
}

/** Ask on first launch so FCM can show before the next login. */
export async function requestParentAlertPermission() {
  if (Platform.OS === "web") return false;
  const Notifications = getNotifications();
  if (!Notifications) return false;
  await setupParentAlerts();
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === "granted" || existing.granted === true) return true;
  const asked = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return asked.status === "granted" || asked.granted === true;
}

export async function presentParentAlert(input: {
  id: string | number;
  title: string;
  body: string;
  data?: ParentPushPayload;
}): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const key = String(input.id || "").trim();
  if (!key) return false;
  if (!rememberPresented(key)) return false;

  const Notifications = getNotifications();
  if (!Notifications) {
    forgetPresented(key);
    return false;
  }

  await setupParentAlerts();
  const title = String(input.title || "").trim() || PARENT_PUSH_TITLE;
  const body = String(input.body || "").trim();
  if (!body) {
    forgetPresented(key);
    return false;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `parent-alert-${key}`,
      content: {
        title,
        body,
        sound: "default",
        data: { ...(input.data || {}), notificationId: key },
      },
      trigger: Platform.OS === "android" ? { channelId: PARENT_ALERT_CHANNEL_ID } : null,
    });
    return true;
  } catch (err) {
    forgetPresented(key);
    console.warn("[parent-alert] present failed", (err as Error)?.message || err);
    return false;
  }
}

function isExpoPushToken(token: string | null | undefined) {
  const t = String(token || "").trim();
  return t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[");
}

/** True after this phone saved an Expo push token for a parent account. */
export function hasRegisteredParentPushToken() {
  return remotePushReady;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveTokenOnServer(token: string): Promise<boolean> {
  try {
    await registerParentDevice(token, Platform.OS);
    remotePushReady = true;
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(READY_KEY, "1");
    return true;
  } catch (err) {
    console.warn("[parent-push] device save failed", (err as Error)?.message || err);
    return false;
  }
}

async function obtainExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const Notifications = getNotifications();
  const projectId = expoProjectId();
  if (!Notifications || !projectId) {
    console.warn("[parent-push] missing notifications module or EAS projectId");
    return null;
  }
  if (!Device.isDevice) {
    console.warn("[parent-push] skip token on emulator");
    return null;
  }

  const granted = await requestParentAlertPermission();
  if (!granted) {
    console.warn("[parent-push] notification permission not granted");
    return null;
  }

  let lastError = "";
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await sleep(attempt === 1 ? 1200 : 1800 * attempt);
      try {
        await Notifications.getDevicePushTokenAsync();
      } catch (err) {
        lastError = (err as Error)?.message || String(err);
      }
      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = String(result?.data || "").trim();
      if (isExpoPushToken(token)) {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        return token;
      }
    } catch (err) {
      lastError = (err as Error)?.message || String(err);
      console.warn("[parent-push] token attempt", attempt, lastError);
    }
  }
  console.warn("[parent-push] token failed", lastError);
  return null;
}

/**
 * Register this phone for lock-screen Expo/FCM push. Call after a parent
 * session exists (including first-run). Token stays on the server after logout
 * so a later check-in can still reach the phone.
 */
export async function registerParentPushToken() {
  if (Platform.OS === "web") return null;
  if (registerPromise) return registerPromise;
  registerPromise = (async () => {
    await setupParentAlerts();
    const cached = await SecureStore.getItemAsync(TOKEN_KEY);
    if (isExpoPushToken(cached) && (await saveTokenOnServer(cached as string))) {
      return cached;
    }
    const token = await obtainExpoPushToken();
    if (!token) return null;
    if (await saveTokenOnServer(token)) return token;
    return null;
  })().finally(() => {
    registerPromise = null;
  });
  return registerPromise;
}

export function subscribeParentPushTaps(onPayload: (data: ParentPushPayload) => void) {
  if (Platform.OS === "web") {
    return { remove() {} };
  }
  const Notifications = getNotifications();
  if (!Notifications) return { remove() {} };
  try {
    return Notifications.addNotificationResponseReceivedListener((response) => {
      const data = parsePushData(response.notification.request.content.data);
      if (data.preview) return;
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      handledResponseKey = key;
      onPayload(data);
    });
  } catch (err) {
    console.warn("[parent-alert] tap listener failed", (err as Error)?.message || err);
    return { remove() {} };
  }
}

export function subscribeParentPushReceived(onPayload: (data: ParentPushPayload) => void) {
  if (Platform.OS === "web") {
    return { remove() {} };
  }
  const Notifications = getNotifications();
  if (!Notifications) return { remove() {} };
  try {
    return Notifications.addNotificationReceivedListener((notification) => {
      const data = parsePushData(notification.request.content.data);
      if (data.preview) return;
      const id = data.notificationId;
      if (id != null) rememberPresented(String(id));
      onPayload(data);
    });
  } catch (err) {
    console.warn("[parent-alert] receive listener failed", (err as Error)?.message || err);
    return { remove() {} };
  }
}

export async function consumeLastParentPushTap(): Promise<ParentPushPayload | null> {
  if (Platform.OS === "web") return null;
  const Notifications = getNotifications();
  if (!Notifications) return null;
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (!last) return null;
    const data = parsePushData(last.notification.request.content.data);
    if (data.preview) return null;
    const key = `${last.notification.request.identifier}:${last.actionIdentifier}`;
    if (handledResponseKey === key) return null;
    handledResponseKey = key;
    return data;
  } catch (err) {
    console.warn("[parent-alert] last tap failed", (err as Error)?.message || err);
    return null;
  }
}
