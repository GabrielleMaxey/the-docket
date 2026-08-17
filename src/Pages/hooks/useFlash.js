import React from "react";

export const useFlash = (durationMs = 2500) => {
  const [message, setMessage] = React.useState("");
  const timeoutRef = React.useRef(null);

  const flash = React.useCallback(
    (text) => {
      setMessage(text);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setMessage(""), durationMs);
    },
    [durationMs]
  );

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [message, flash];
};
