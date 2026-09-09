import { useMemo, useRef, useState } from "react";
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
  const [activeKey, setActiveKey] = useState<MessageTemplateKey>(meta.fields[0]?.key || "check_in");
  const refs = useRef<Partial<Record<MessageTemplateKey, HTMLTextAreaElement | null>>>({});
  const smsMax = meta.smsMax || SMS_MAX;
  const vars = useMemo(
    () => samplePreviewVars(schoolName, meta.previewSample),
    [schoolName, meta.previewSample]
  );

  function setField(key: MessageTemplateKey, value: string) {
    onChange({ ...templates, [key]: value });
  }

  function insertToken(token: string) {
    const el = refs.current[activeKey];
    const current = templates[activeKey] || "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? start;
    const next = insertAt(current, token, start, end);
    setField(activeKey, next);
    requestAnimationFrame(() => {
      const node = refs.current[activeKey];
      if (!node) return;
      node.focus();
      const pos = start + token.length;
      node.setSelectionRange(pos, pos);
    });
  }

  function fillExample(key: MessageTemplateKey) {
    const example = meta.defaults[key] || "";
    if (!example) return;
    setField(key, example);
    setActiveKey(key);
  }

  return (
    <div className="message-format">
      <h3 className="message-format__title">Message format</h3>
      <p className="settings-screen__lead">
        Same wording for SMS and the parent-app inbox. Leave a box blank to keep the current
        built-in SMS text. Tokens are replaced when the message is sent. SMS is clipped at {smsMax}{" "}
        characters; the parent inbox uses the full text.
      </p>

      <p className="settings-chips-label">Insert token into the selected message</p>
      <div className="settings-chips" role="group" aria-label="Message tokens">
        {meta.tokens.map((chip) => (
          <button
            key={chip.token}
            type="button"
            className="settings-chip"
            title={chip.label}
            onClick={() => insertToken(chip.token)}
          >
            {chip.token}
          </button>
        ))}
      </div>

      {meta.fields.map((field) => {
        const value = templates[field.key] || "";
        const picked = pickPreviewTemplate(templates, field.key);
        const preview = picked.text ? renderPreview(picked.text, vars) : "";
        const smsLen = preview.length;
        const over = smsLen > smsMax;
        return (
          <div key={field.key} className="message-format__field">
            <div className="message-format__label-row">
              <label className="message-format__label" htmlFor={`tpl-${field.key}`}>
                {field.label}
              </label>
              {meta.defaults[field.key] ? (
                <button
                  type="button"
                  className="message-format__example"
                  onClick={() => fillExample(field.key)}
                >
                  Fill example
                </button>
              ) : null}
            </div>
            {field.hint ? <p className="settings-screen__field-hint">{field.hint}</p> : null}
            <textarea
              id={`tpl-${field.key}`}
              className="message-format__textarea"
              rows={4}
              value={value}
              placeholder={meta.defaults[field.key] || "Leave blank to keep built-in wording"}
              onFocus={() => setActiveKey(field.key)}
              onChange={(e) => setField(field.key, e.target.value)}
              ref={(node) => {
                refs.current[field.key] = node;
              }}
            />
            <div className={`message-format__preview${over ? " message-format__preview--warn" : ""}`}>
              {preview ? (
                <>
                  <p className="message-format__preview-text">{preview}</p>
                  <p className="message-format__len">
                    SMS {smsLen}/{smsMax}
                    {over ? " — too long for one SMS; extra characters are cut. Save is still allowed." : ""}
                    {picked.reusedFrom === "absence"
                      ? " Reusing Missed check-in until you type a format here."
                      : picked.reusedFrom === "missed_checkout"
                        ? " Reusing Missed check-out until you type a format here."
                        : ""}
                  </p>
                </>
              ) : (
                <p className="message-format__preview-text">
                  Uses the current built-in SMS wording until you type a format here.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
