import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import type { Student } from "../api/students";
import { ID_CARD_ASPECT, buildIdCardPreviewHtml, type IdCardOptions } from "../utils/idCardTemplate";
import { colors } from "../theme/colors";

type Props = {
  student: Student;
  opts: IdCardOptions;
};

export default function StudentIdCardPreview({ student, opts }: Props) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setHtml(null);
    void buildIdCardPreviewHtml(student, opts).then((doc) => {
      if (active) setHtml(doc);
    });
    return () => {
      active = false;
    };
  }, [student.id, student.barcode, opts.schoolName, opts.academicYear, opts.schoolLogoUrl]);

  return (
    <View style={styles.wrap}>
      <View style={styles.dimBadge}>
        <Text style={styles.dimText}>85.6 × 53.98 mm · QR code ID</Text>
      </View>
      <View style={styles.cardFrame}>
        {html ? (
          <WebView
            originWhitelist={["about:blank", "about:srcdoc", "data:*"]}
            source={{ html }}
            style={styles.webview}
            scrollEnabled={false}
            javaScriptEnabled
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(req) => {
              const url = String(req.url || "");
              return (
                url === "about:blank" ||
                url.startsWith("about:srcdoc") ||
                url.startsWith("data:")
              );
            }}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          />
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  dimBadge: {
    alignSelf: "center",
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dimText: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
  cardFrame: {
    width: "100%",
    aspectRatio: ID_CARD_ASPECT,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
  },
  webview: { flex: 1, backgroundColor: "transparent" },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
});
