import React from "react";
import { fetchTodos, createTodo, updateTodo, deleteTodo, clearCompletedTodos } from "../../services/jiraClient.js";

const MAX_TODOS = 15;
const DEFAULT_PLACEHOLDER_COUNT = 5;

const makePlaceholder = () => ({
  id: null,
  text: "",
  priority: 3,
  dueDate: "",
  done: false,
  createdAt: "",
  completedAt: "",
});

export const useTodos = () => {
  const [todos, setTodos] = React.useState(() =>
    Array.from({ length: DEFAULT_PLACEHOLDER_COUNT }, makePlaceholder)
  );
  const [error, setError] = React.useState("");
  const saveTimers = React.useRef({});

  React.useEffect(() => {
    let cancelled = false;
    fetchTodos()
      .then((items) => {
        if (cancelled) return;
        setError("");
        if (items.length > 0) {
          setTodos(items);
        }
        // If empty, keep default placeholders
      })
      .catch(() => {
        if (!cancelled) setError("To dos could not be loaded.");
      });
    return () => {
      cancelled = true;
      Object.values(saveTimers.current).forEach(clearTimeout);
    };
  }, []);

  // Persist a saved todo (has an id) after a short debounce
  const scheduleSave = React.useCallback((id, fields) => {
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => {
      updateTodo(id, fields).catch(() =>
        setError("A to do could not be saved. Changes may not persist.")
      );
    }, 500);
  }, []);

  const handleTextChange = React.useCallback((index, value) => {
    setTodos((prev) => {
      const item = prev[index];
      if (!item) return prev;

      if (item.id === null) {
        // Placeholder — create on first keystroke
        const next = prev.map((t, i) => (i === index ? { ...t, text: value } : t));
        if (value.trim()) {
          createTodo({ text: value, priority: item.priority, dueDate: item.dueDate })
            .then((created) => {
              if (!created?.id) return;
              setTodos((cur) =>
                cur.map((t, i) => (i === index && t.id === null ? created : t))
              );
            })
            .catch(() => setError("A to do could not be saved."));
        }
        return next;
      }

      const next = prev.map((t, i) => (i === index ? { ...t, text: value } : t));
      scheduleSave(item.id, { text: value });
      return next;
    });
  }, [scheduleSave]);

  const handlePriorityChange = React.useCallback((index, value) => {
    setTodos((prev) => {
      const item = prev[index];
      if (!item) return prev;
      const priority = Math.min(5, Math.max(1, Number(value)));
      const next = prev.map((t, i) => (i === index ? { ...t, priority } : t));
      if (item.id !== null) scheduleSave(item.id, { priority });
      return next;
    });
  }, [scheduleSave]);

  const handleDueDateChange = React.useCallback((index, value) => {
    setTodos((prev) => {
      const item = prev[index];
      if (!item) return prev;
      const next = prev.map((t, i) => (i === index ? { ...t, dueDate: value } : t));
      if (item.id !== null) scheduleSave(item.id, { dueDate: value });
      return next;
    });
  }, [scheduleSave]);

  const handleDoneChange = React.useCallback((index, checked) => {
    setTodos((prev) => {
      const item = prev[index];
      if (!item || item.id === null) return prev;
      const completedAt = checked ? new Date().toISOString().slice(0, 10) : "";
      const next = prev.map((t, i) =>
        i === index ? { ...t, done: checked, completedAt } : t
      );
      updateTodo(item.id, { done: checked }).catch(() =>
        setError("A to do could not be saved.")
      );
      return next;
    });
  }, []);

  const handleDelete = React.useCallback((index) => {
    setTodos((prev) => {
      const item = prev[index];
      if (!item) return prev;
      const next = prev.filter((_, i) => i !== index);
      if (item.id !== null) {
        clearTimeout(saveTimers.current[item.id]);
        deleteTodo(item.id).catch(() =>
          setError("A to do could not be deleted.")
        );
      }
      return next;
    });
  }, []);

  const handleAdd = React.useCallback(() => {
    setTodos((prev) => {
      if (prev.length >= MAX_TODOS) return prev;
      return [...prev, makePlaceholder()];
    });
  }, []);

  const handleClearCompleted = React.useCallback(() => {
    clearCompletedTodos().catch(() =>
      setError("Could not clear completed to dos.")
    );
    setTodos((prev) => prev.filter((t) => !t.done));
  }, []);

  const canAdd = todos.filter((t) => !t.done).length < MAX_TODOS;

  // Split active (sorted by priority then due) and done (sorted by completedAt desc)
  const active = todos
    .map((t, i) => ({ ...t, _index: i }))
    .filter((t) => !t.done)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const aHasDue = Boolean(a.dueDate);
      const bHasDue = Boolean(b.dueDate);
      if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;
      if (aHasDue && bHasDue) return a.dueDate.localeCompare(b.dueDate);
      return 0;
    });
  const done = todos
    .map((t, i) => ({ ...t, _index: i }))
    .filter((t) => t.done)
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

  const sorted = [...active, ...done];

  return {
    todos,
    sorted,
    error,
    canAdd,
    handleTextChange,
    handlePriorityChange,
    handleDueDateChange,
    handleDoneChange,
    handleDelete,
    handleAdd,
    handleClearCompleted,
  };
};
