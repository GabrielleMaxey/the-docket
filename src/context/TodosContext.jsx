import React from "react";
import { fetchTodos, createTodo, updateTodo, deleteTodo } from "../services/jiraClient.js";
import { createTodoSaveQueue } from "../utils/todoSaveQueue.js";

const MAX_TODOS = 15;
const DEFAULT_PLACEHOLDER_COUNT = 5;
const TodosContext = React.createContext(null);
const makePlaceholder = () => ({
  clientId: crypto.randomUUID(),
  id: null,
  text: "",
  priority: 3,
  dueDate: "",
  done: false,
  createdAt: "",
  completedAt: "",
});

export const TodosProvider = ({ children }) => {
  const [todos, setTodos] = React.useState([]);
  const rows = React.useRef([]);
  const [error, setError] = React.useState("");
  const [recoveryNotice, setRecoveryNotice] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const replaceTodos = (next) => {
    rows.current = next;
    setTodos(next);
  };
  const queue = React.useRef(null);
  if (!queue.current) {
    queue.current = createTodoSaveQueue({
      createTodo, updateTodo, deleteTodo,
      onSaved: (clientId, saved) => {
        replaceTodos(saved
          ? rows.current.map((row) => row.clientId === clientId ? { ...row, ...saved, saveError: "", deleting: false, saving: false } : row)
          : rows.current.filter((row) => row.clientId !== clientId));
      },
      onError: (clientId, saveError, operation) => {
        const message = operation === "delete" ? "Could not delete. Retry to finish deleting." : "Could not save. Your changes are kept here; retry to save.";
        replaceTodos(rows.current.map((row) => row.clientId === clientId ? { ...row, saving: false, saveError: `${message} ${saveError.message}` } : row));
      },
    });
  }

  const loadTodos = React.useCallback(async () => {
    setLoading(true);
    try {
      const { items, migration } = await fetchTodos();
      replaceTodos(items.length ? items.map((row) => ({ ...row, clientId: crypto.randomUUID() })) : Array.from({ length: DEFAULT_PLACEHOLDER_COUNT }, makePlaceholder));
      setError("");
      setRecoveryNotice(migration?.unresolved?.length ? "Some older To Dos need recovery review. Their original records are retained; no uncertain copies were imported." : "");
    } catch (loadError) {
      setError(`To dos could not be loaded. ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { void loadTodos(); }, [loadTodos]);

  const changeTodo = (index, patch, immediate = false) => {
    const item = rows.current[index];
    if (!item || item.deleting) return;
    const next = { ...item, ...patch };
    next.saving = !item.saveError && (next.id !== null || Boolean(next.text.trim()));
    replaceTodos(rows.current.map((row) => row.clientId === item.clientId ? next : row));
    queue.current.schedule(item.clientId, item.id, { text: next.text, priority: next.priority, dueDate: next.dueDate, done: next.done });
    if (immediate) void queue.current.flush(item.clientId);
  };
  const handleTextChange = (index, text) => changeTodo(index, { text });
  const handlePriorityChange = (index, value) => changeTodo(index, { priority: Math.min(5, Math.max(1, Number(value))) });
  const handleDueDateChange = (index, dueDate) => changeTodo(index, { dueDate });
  const handleDoneChange = (index, done) => changeTodo(index, { done }, true);
  const handleDelete = (index) => {
    const item = rows.current[index];
    if (!item || item.deleting) return;
    replaceTodos(rows.current.map((row) => row.clientId === item.clientId ? { ...row, deleting: true, saving: !row.saveError } : row));
    void queue.current.remove(item.clientId, item.id);
  };
  const handleRetry = (index) => {
    const item = rows.current[index];
    if (!item) return;
    replaceTodos(rows.current.map((row) => row.clientId === item.clientId ? { ...row, saveError: "", saving: true } : row));
    void queue.current.retry(item.clientId);
  };
  const handleAdd = () => {
    if (!loading && rows.current.filter((row) => !row.done).length < MAX_TODOS) replaceTodos([...rows.current, makePlaceholder()]);
  };
  const handleClearCompleted = () => {
    const completedIds = rows.current.filter((row) => row.done).map((row) => row.clientId);
    completedIds.forEach((clientId) => handleDelete(rows.current.findIndex((row) => row.clientId === clientId)));
  };

  const canAdd = !loading && !error && todos.filter((t) => !t.done).length < MAX_TODOS;

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

  return (
    <TodosContext.Provider value={{ todos, sorted, error, recoveryNotice, loading, canAdd,
      handleTextChange, handlePriorityChange, handleDueDateChange, handleDoneChange,
      handleDelete, handleAdd, handleClearCompleted, handleRetry, loadTodos }}>
      {children}
    </TodosContext.Provider>
  );
};

export const useTodosContext = () => {
  const context = React.useContext(TodosContext);
  if (!context) throw new Error("useTodos must be used inside TodosProvider");
  return context;
};
