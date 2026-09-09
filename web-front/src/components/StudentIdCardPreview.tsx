import { useEffect, useState } from "react";
import type { Student } from "../api/students";
import {
  ID_CARD_ASPECT,
  buildIdCardPreviewHtml,
  type IdCardOptions,
} from "../utils/idCardTemplate";
import "./StudentIdCardPreview.css";

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
  }, [student.id, student.barcode, opts.schoolName, opts.academicYear, opts.schoolLogoUrl, student]);

  return (
    <div className="id-preview">
      <span className="id-preview__badge">85.6 × 53.98 mm · QR code ID</span>
      <div className="id-preview__frame" style={{ aspectRatio: String(ID_CARD_ASPECT) }}>
        {html ? (
          <iframe title={`ID card preview — ${student.fullName}`} srcDoc={html} className="id-preview__iframe" />
        ) : (
          <div className="id-preview__loading">Loading preview…</div>
        )}
      </div>
    </div>
  );
}
