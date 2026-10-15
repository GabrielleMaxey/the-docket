export const createTodoSaveQueue = ({ createTodo, updateTodo, deleteTodo, onSaved, onError }) => {
  const rows = new Map();
  const getRow = (clientId, serverId) => {
    if (!rows.has(clientId)) {
      rows.set(clientId, { serverId, pending: {}, values: {}, running: null, timer: null, failed: false, removing: false, removed: false, attempted: false });
    }
    const row = rows.get(clientId);
    row.serverId ??= serverId;
    return row;
  };

  const flush = (clientId) => {
    const row = rows.get(clientId);
    if (!row) return Promise.resolve();
    clearTimeout(row.timer);
    if (row.running) return row.running;
    if (row.failed || row.removed) return Promise.resolve();
    const run = async () => {
      let sent = {};
      let operation = "save";
      let saved;
      try {
        if (row.serverId == null) {
          if (row.removing && !row.attempted) {
            row.removed = true;
            onSaved(clientId, null);
            return;
          }
          if (!row.attempted && !String(row.values.text || "").trim()) return;
          sent = row.pending;
          row.pending = {};
          row.attempted = true;
          saved = await createTodo({ ...row.values, clientId });
          row.serverId = saved.id;
          // A retried POST returns the original record; PUT applies current draft values.
          row.pending = { ...sent, ...row.pending };
          sent = {};
        }
        while (!row.removing && Object.keys(row.pending).length) {
          sent = row.pending;
          row.pending = {};
          saved = await updateTodo(row.serverId, sent);
          sent = {};
        }
        if (row.removing) {
          operation = "delete";
          await deleteTodo(row.serverId);
          row.removed = true;
          row.pending = {};
          onSaved(clientId, null);
        } else if (saved) {
          onSaved(clientId, saved);
        }
      } catch (error) {
        row.pending = { ...sent, ...row.pending };
        row.failed = true;
        onError(clientId, error, operation);
      }
    };
    row.running = run().finally(() => { row.running = null; });
    return row.running;
  };

  return {
    schedule(clientId, serverId, patch) {
      const row = getRow(clientId, serverId);
      if (row.removing || row.removed) return;
      row.values = { ...row.values, ...patch };
      row.pending = { ...row.pending, ...patch };
      clearTimeout(row.timer);
      if (!row.failed) row.timer = setTimeout(() => { void flush(clientId); }, 500);
    },
    flush,
    remove(clientId, serverId) {
      const row = getRow(clientId, serverId);
      row.removing = true;
      return flush(clientId);
    },
    retry(clientId) {
      const row = rows.get(clientId);
      if (!row || row.running) return row?.running || Promise.resolve();
      row.failed = false;
      return flush(clientId);
    },
  };
};
