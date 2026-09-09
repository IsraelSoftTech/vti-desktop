import { useEffect, useState } from "react";
import { apiBlob } from "../api/client";
import Icon from "./Icon";
import "./StudentAvatar.css";

type Props = {
  studentId: number;
  photoUrl?: string | null;
  size?: number;
};

export default function StudentAvatar({ studentId, photoUrl, size = 56 }: Props) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (photoUrl && (photoUrl.startsWith("http") || photoUrl.startsWith("data:"))) {
      setUri(photoUrl);
      return () => {
        cancelled = true;
      };
    }

    setUri(null);
    apiBlob(`/parent/students/${studentId}/photo`)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUri(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUri(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [studentId, photoUrl]);

  const radius = Math.round(size * 0.22);

  if (!uri) {
    return (
      <span
        className="student-avatar student-avatar--fallback"
        style={{ width: size, height: size, borderRadius: radius }}
      >
        <Icon name="person" size={Math.round(size * 0.42)} />
      </span>
    );
  }

  return (
    <img
      className="student-avatar"
      src={uri}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: radius }}
    />
  );
}
