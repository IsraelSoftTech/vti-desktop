import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useColors } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";
import {
  insertAt,
  pickPreviewTemplate,
  renderPreview,
  samplePreviewVars,
  SMS_MAX,
  type GuardianMessageTemplates,
  type MessageTemplateKey,
  type MessageTemplateMeta,
} from "../utils/messageTemplates";

type Props = {
  templates: GuardianMessageTemplates;
  onChange: (next: GuardianMessageTemplates) => void;
  schoolName: string;
  meta: MessageTemplateMeta;
};

export default function MessageFormatEditor({ templates, onChange, schoolName, meta }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeKey, setActiveKey] = useState<MessageTemplateKey>(meta.fields[0]?.key || "check_in");
  const selection = useRef<Partial<Record<MessageTemplateKey, { start: number; end: number }>>>({});
  const smsMax = meta.smsMax || SMS_MAX;
  const vars = useMemo(
    () => samplePreviewVars(schoolName, meta.previewSample),
    [schoolName, meta.previewSample]
  );

  function setField(key: MessageTemplateKey, value: string) {
    onChange({ ...templates, [key]: value });
  }

  function insertToken(token: string) {
    const current = templates[activeKey] || "";
    const sel = selection.current[activeKey] || { start: current.length, end: current.length };
    const next = insertAt(current, token, sel.start, sel.end);
    const pos = sel.start + token.length;
    selection.current[activeKey] = { start: pos, end: pos };
    setField(activeKey, next);
  }

  function fillExample(key: MessageTemplateKey) {
    const example = meta.defaults[key] || "";
    if (!example) return;
    setField(key, example);
    setActiveKey(key);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Message format</Text>
      <Text style={styles.lead}>
        Same wording for SMS and the parent-app inbox. Leave a box blank to keep the current
        built-in SMS text. SMS is clipped at {smsMax} characters; the parent inbox uses the full
        text.
      </Text>
      <Text style={styles.chipsLabel}>Insert token into the selected message</Text>
      <View style={styles.chips}>
        {meta.tokens.map((chip) => (
          <Pressable key={chip.token} onPress={() => insertToken(chip.token)} style={styles.chip}>
            <Text style={styles.chipText}>{chip.token}</Text>
          </Pressable>
        ))}
      </View>
      {meta.fields.map((field) => {
        const value = templates[field.key] || "";
        const picked = pickPreviewTemplate(templates, field.key);
        const preview = picked.text ? renderPreview(picked.text, vars) : "";
        const over = preview.length > smsMax;
        const selected = activeKey === field.key;
        return (
          <View key={field.key} style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{field.label}</Text>
              {meta.defaults[field.key] ? (
                <Pressable onPress={() => fillExample(field.key)}>
                  <Text style={styles.example}>Fill example</Text>
                </Pressable>
              ) : null}
            </View>
            {field.hint ? <Text style={styles.hint}>{field.hint}</Text> : null}
            <TextInput
              accessibilityLabel={field.label}
              multiline
              textAlignVertical="top"
              style={[styles.textarea, selected && styles.textareaOn]}
              value={value}
              placeholder={meta.defaults[field.key] || "Leave blank to keep built-in wording"}
              placeholderTextColor={colors.textMuted}
              onFocus={() => setActiveKey(field.key)}
              onChangeText={(text) => setField(field.key, text)}
              onSelectionChange={(e) => {
                selection.current[field.key] = e.nativeEvent.selection;
              }}
            />
            <View style={[styles.preview, over && styles.previewWarn]}>
              {preview ? (
                <>
                  <Text style={styles.previewText}>{preview}</Text>
                  <Text style={[styles.len, over && styles.lenWarn]}>
                    SMS {preview.length}/{smsMax}
                    {over
                      ? " — too long for one SMS; extra characters are cut. Save is still allowed."
                      : ""}
                    {picked.reusedFrom === "absence"
                      ? " Reusing Missed check-in until you type a format here."
                      : picked.reusedFrom === "missed_checkout"
                        ? " Reusing Missed check-out until you type a format here."
                        : ""}
                  </Text>
                </>
              ) : (
                <Text style={styles.previewText}>
                  Uses the current built-in SMS wording until you type a format here.
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: { gap: 12, width: "100%" },
    title: { fontSize: 16, fontWeight: "700", color: colors.text },
    lead: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    chipsLabel: { fontSize: 13, fontWeight: "600", color: colors.text },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.surface,
    },
    chipText: { fontSize: 12, fontWeight: "700", color: colors.text },
    field: { gap: 6, width: "100%" },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    label: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text },
    example: { fontSize: 12, fontWeight: "700", color: colors.primary },
    hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    textarea: {
      minHeight: 96,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    textareaOn: {
      borderColor: colors.primary,
    },
    preview: {
      padding: 10,
      borderRadius: 10,
      backgroundColor: colors.backgroundAlt,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    previewWarn: {
      borderColor: colors.warning,
      backgroundColor: colors.accentPeachSoft,
    },
    previewText: { fontSize: 12, color: colors.textMuted, fontStyle: "italic", lineHeight: 18 },
    len: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
    lenWarn: { color: colors.warning },
  });
}
