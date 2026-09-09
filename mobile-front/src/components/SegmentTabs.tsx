import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type Tab<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Each tab shares equal width (good for two-column settings tabs). */
  equalWidth?: boolean;
};

export default function SegmentTabs<T extends string>({
  tabs,
  active,
  onChange,
  equalWidth,
}: Props<T>) {
  return (
    <View style={[styles.row, equalWidth && styles.rowEqual]}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={[styles.tab, equalWidth && styles.tabEqual, isActive && styles.tabActive]}
          >
            <Text
              style={[styles.label, isActive && styles.labelActive]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
    width: "100%",
  },
  rowEqual: {
    flexWrap: "nowrap",
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(45, 91, 255, 0.08)",
  },
  tabEqual: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    textAlign: "center",
  },
  labelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
});
