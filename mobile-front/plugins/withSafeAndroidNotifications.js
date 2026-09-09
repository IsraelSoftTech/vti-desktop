const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

/**
 * Local / OS notifications are always allowed.
 *
 * When google-services.json is missing, expo-notifications still registers
 * Firebase components that crash Android on cold start:
 *   - ExpoFirebaseMessagingService
 *   - FirebaseInitProvider
 * Strip those native entries so the icon can open.
 *
 * When a real google-services.json is present, keep FCM so lock-screen push
 * works. Never insert tools:node="remove" stubs (that made phones refuse the APK).
 */
const REMOVE_WHEN_NO_FCM = {
  service: [
    "expo.modules.notifications.service.ExpoFirebaseMessagingService",
    "com.google.firebase.messaging.FirebaseMessagingService",
  ],
  provider: ["com.google.firebase.provider.FirebaseInitProvider"],
  receiver: [
    "com.google.firebase.iid.FirebaseInstanceIdReceiver",
    "com.google.android.gms.measurement.AppMeasurementReceiver",
  ],
};

const REMOVE_ANALYTICS_ONLY = {
  receiver: ["com.google.android.gms.measurement.AppMeasurementReceiver"],
};

function markRemove(application, kind, className) {
  const list = application[kind] || [];
  let changed = false;
  const next = list.filter((entry) => {
    if (entry.$?.["android:name"] !== className) return true;
    changed = true;
    return false;
  });
  if (changed) application[kind] = next;
}

function fcmConfigured(config) {
  return Boolean(config.android?.googleServicesFile);
}

function withSafeAndroidNotifications(config) {
  const keepFcm = fcmConfigured(config);
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    if (!manifest.$) manifest.$ = {};
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const remove = keepFcm ? REMOVE_ANALYTICS_ONLY : REMOVE_WHEN_NO_FCM;
    for (const [kind, names] of Object.entries(remove)) {
      for (const name of names) markRemove(application, kind, name);
    }
    return mod;
  });
}

module.exports = withSafeAndroidNotifications;
