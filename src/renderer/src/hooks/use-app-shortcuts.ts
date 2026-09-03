import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  eventToChord,
  isShortcutCapturing,
  isTypingTarget,
  readShortcutConfig,
} from "@/lib/shortcuts";

export function useAppShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutCapturing()) return;
      if (isTypingTarget(event.target)) return;
      const chord = eventToChord(event);
      if (!chord) return;

      const keys = readShortcutConfig().keys;
      if (keys.goBack && chord === keys.goBack) {
        event.preventDefault();
        event.stopPropagation();
        if (window.history.length > 1) {
          navigate(-1);
        } else {
          navigate("/");
        }
        return;
      }
      if (keys.goForward && chord === keys.goForward) {
        event.preventDefault();
        event.stopPropagation();
        navigate(1);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [navigate]);
}
