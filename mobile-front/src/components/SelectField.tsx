import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

type Option = { label: string; value: string };

type Props = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
};

export default function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Select an option",
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        onPress={() => setOpen(true)}
      >
        <Text style={[styles.triggerText, !selected && styles.placeholder]}>
          {selected?.label || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.primary} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Ionicons name="close-circle" size={26} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={styles.list} bounces={false}>
              {options.length ? (
                options.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => pick(opt.value)}
                      style={[styles.option, active && styles.optionActive]}
                    >
                      <Text style={[styles.optionText, active && styles.optionTextActive]}>
                        {opt.label}
                      </Text>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                      ) : (
                        <View style={styles.optionDot} />
                      )}
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.empty}>{placeholder}</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 1,
  },
  triggerPressed: { opacity: 0.88 },
  triggerText: { fontSize: 15, color: colors.text, fontWeight: "600", flex: 1 },
  placeholder: { color: colors.textMuted, fontWeight: "500" },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(26, 83, 255, 0.25)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
    paddingBottom: 24,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: colors.primaryDark },
  list: { paddingHorizontal: 12, paddingTop: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 6,
    backgroundColor: colors.backgroundAlt,
  },
  optionActive: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  optionText: { fontSize: 15, fontWeight: "600", color: colors.text },
  optionTextActive: { color: colors.primaryDark, fontWeight: "800" },
  optionDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  empty: {
    textAlign: "center",
    color: colors.textMuted,
    padding: 24,
    fontSize: 14,
  },
});
