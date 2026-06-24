import React from "react";

// Tiny reusable hook for "submit button" confirmations: call flash("Saved.")
// after a successful action and a short message shows for a few seconds,
// then clears itself. Used instead of duplicating setTimeout logic at every
// save/update button across the app.
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
