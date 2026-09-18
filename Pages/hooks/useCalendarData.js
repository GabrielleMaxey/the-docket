import React from "react";
import { formatDate } from "../../utils/format.js";

const getCalendarCells = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstDayIndex; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

export const useCalendarData = () => {
  const today = React.useMemo(() => new Date(), []);
  const todayDay = today.getDate();
  const monthLabel = formatDate(today, { month: "long", year: "numeric" });
  const fullDateLabel = formatDate(today, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const calendarCells = React.useMemo(() => getCalendarCells(today), [today]);

  return { todayDay, monthLabel, fullDateLabel, calendarCells };
};
