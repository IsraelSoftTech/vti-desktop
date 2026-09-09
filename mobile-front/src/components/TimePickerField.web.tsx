import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatTime12Display,
  formatTime24From12,
  parseTime12Parts,
  type Time12Period,
} from "../utils/dateTime";
import { colors } from "../theme/colors";

type Props = {
  label: string;
  value?: string | null;
  onChange: (time24: string) => void;
};

const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS: Time12Period[] = ["AM", "PM"];

export default function TimePickerField({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parseTime12Parts(value));

  function openPicker() {
    setDraft(parseTime12Parts(value));
    setOpen(true);
  }

  function confirm() {
    onChange(formatTime24From12(draft.hour12, draft.minutes, draft.period));
    setOpen(false);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={openPicker}>
        <Text style={styles.value}>{value ? formatTime12Display(value) : "Select time"}</Text>
      </Pressable>

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
            <View style={styles.pickers}>
              <select
                aria-label="Hour"
                value={draft.hour12}
                style={webSelectStyle as object}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, hour12: Number(e.target.value) }))
                }
              >
                {HOURS12.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <select
                aria-label="Minute"
                value={draft.minutes}
                style={webSelectStyle as object}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, minutes: Number(e.target.value) }))
                }
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <select
                aria-label="AM or PM"
                value={draft.period}
                style={periodSelectStyle as object}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, period: e.target.value as Time12Period }))
                }
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const webSelectStyle = {
  flex: 1,
  fontSize: 17,
  padding: 13,
  borderRadius: 14,
  border: `1px solid ${colors.borderStrong}`,
  backgroundColor: colors.surface,
  color: colors.text,
};

const periodSelectStyle = {
  ...webSelectStyle,
  flex: 0.85,
  fontWeight: 700,
};

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
  pickers: {
    flexDirection: "row",
    gap: 10,
    padding: 20,
  },
});
