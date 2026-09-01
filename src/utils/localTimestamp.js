const pad2 = (value) => String(value).padStart(2, "0");

export const formatLocalIsoTimestamp = (date = new Date()) => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absOffset / 60);
  const offsetRemainderMinutes = absOffset % 60;

  return [
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    "T",
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
    sign,
    `${pad2(offsetHours)}:${pad2(offsetRemainderMinutes)}`,
  ].join("");
};

export const getLocalTimestampPayload = () => ({
  savedAtLocal: formatLocalIsoTimestamp(),
  savedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
});
