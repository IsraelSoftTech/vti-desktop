import { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { formatDateDisplay, formatDateISO } from "../utils/dateTime";
import { colors } from "../theme/colors";

type Props = {
  label: string;
  value?: string | null;
  onChange: (iso: string) => void;
};

export default function DatePickerField({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() =>
    value ? new Date(`${value}T12:00:00`) : new Date()
  );

  function openPicker() {
    setDraft(value ? new Date(`${value}T12:00:00`) : new Date());
    setOpen(true);
  }

  function onPick(_: DateTimePickerEvent, picked?: Date) {
    if (Platform.OS === "android") {
      setOpen(false);
      if (picked) onChange(formatDateISO(picked));
      return;
    }
    if (picked) setDraft(picked);
  }

  function confirm() {
    onChange(formatDateISO(draft));
    setOpen(false);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={openPicker}>
        <Text style={styles.value}>{value ? formatDateDisplay(value) : "Select date"}</Text>
      </Pressable>

      {Platform.OS === "ios" ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.toolbar}>
                <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                  <Text style={styles.cancel}>Cancel</Text>
                </Pressable>
                <Text style={styles.toolbarTitle}>{label}</Text>
                <Pressable onPress={confirm} hitSlop={8}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={draft}
                mode="date"
                display="spinner"
                onChange={onPick}
                style={styles.picker}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : open ? (
        <DateTimePicker
          value={value ? new Date(`${value}T12:00:00`) : new Date()}
          mode="date"
          display="default"
          onChange={onPick}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text },
  field: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  value: { fontSize: 15, color: colors.text },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
  },
  toolbarTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  cancel: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: "600",
  },
  doneText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "700",
  },
  picker: { height: 216 },
});
