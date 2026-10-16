import { test } from "node:test";
import assert from "node:assert/strict";
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const makeQueue = async (overrides = {}) => {
  const module = await import("../src/utils/todoSaveQueue.js").catch((error) => {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
    return {};
  });
  assert.equal(typeof module.createTodoSaveQueue, "function", "serialized autosave queue must exist");
  const records = new Map(), saved = [], errors = [];
  const queue = module.createTodoSaveQueue({
    createTodo: async (fields) => {
      const row = { ...fields, id: 1 };
      records.set(1, row);
      return row;
    },
    updateTodo: async (id, patch) => {
      assert.ok(records.has(id), "never update deleted record");
      const row = { ...records.get(id), ...patch };
      records.set(id, row);
      return row;
    },
    deleteTodo: async (id) => {
      records.delete(id);
    },
    onSaved: (id, row) => saved.push({ id, row }),
    onError: (id, error) => errors.push({ id, error }),
    ...overrides
  });
  return { queue, records, saved, errors };
};

test("typing through create saves latest merged patch", async () => {
  const gate = deferred();
  let creates = 0;
  const { queue, records } = await makeQueue({ createTodo: async (fields) => {
    creates++;
    await gate.promise;
    records.set(1, { ...fields, id: 1 });
    return records.get(1);
  } });
  queue.schedule("draft", null, { text: "f", priority: 3, dueDate: "" });
  const pending = queue.flush("draft");
  queue.schedule("draft", null, { text: "final" });
  queue.schedule("draft", null, { priority: 1, dueDate: "2026-10-20" });
  assert.equal(creates, 1);
  gate.resolve();
  await pending;
  assert.equal(creates, 1);
  assert.equal(records.get(1).text, "final");
  assert.equal(records.get(1).priority, 1);
  assert.equal(records.get(1).dueDate, "2026-10-20");
});

test("retry after lost create response returns one record", async () => {
  let calls = 0;
  const identities = new Map();
  const { queue, records, errors } = await makeQueue({ createTodo: async (fields) => {
    calls++;
    if (!identities.has(fields.clientId)) {
      identities.set(fields.clientId, 1);
      records.set(1, { ...fields, id: 1 });
    }
    if (calls === 1) throw new TypeError("response lost");
    return records.get(1);
  } });
  queue.schedule("stable", null, { text: "first", priority: 3 });
  await queue.flush("stable");
  assert.equal(errors.length, 1);
  queue.schedule("stable", null, { text: "latest", priority: 2 });
  await queue.retry("stable");
  assert.equal(records.size, 1);
  assert.equal(identities.size, 1);
  assert.equal(records.get(1).text, "latest");
  assert.equal(records.get(1).priority, 2);
});

test("delete during create removes returned record", async () => {
  const gate = deferred();
  const { queue, records, saved } = await makeQueue({ createTodo: async (fields) => {
    await gate.promise;
    records.set(1, { ...fields, id: 1 });
    return records.get(1);
  } });
  queue.schedule("draft", null, { text: "remove" });
  const saving = queue.flush("draft");
  const deleting = queue.remove("draft", null);
  gate.resolve();
  await Promise.all([saving, deleting]);
  assert.equal(records.size, 0);
  assert.equal(saved.at(-1).row, null);
  queue.schedule("draft", null, { text: "stale" });
  await queue.flush("draft");
  assert.equal(records.size, 0);
});

test("navigation does not discard pending changes", async () => {
  const { queue, records } = await makeQueue();
  let consume = () => queue.schedule("draft", null, { text: "before navigation" });
  consume();
  consume = () => queue.schedule("draft", null, { text: "after navigation" });
  consume();
  await queue.flush("draft");
  assert.equal(records.size, 1);
  assert.equal(records.get(1).text, "after navigation");
});

test("completion and delete cannot be overtaken by older saves", async () => {
  const gate = deferred();
  let updates = 0;
  const { queue, records } = await makeQueue({ updateTodo: async (id, patch) => {
    if (++updates === 1) await gate.promise;
    assert.ok(records.has(id));
    const row = { ...records.get(id), ...patch };
    records.set(id, row);
    return row;
  } });
  records.set(1, { id: 1, text: "old", done: false });
  queue.schedule("row", 1, { text: "new" });
  const saving = queue.flush("row");
  queue.schedule("row", 1, { done: true });
  const completing = queue.flush("row");
  gate.resolve();
  await Promise.all([saving, completing]);
  assert.equal(records.get(1).text, "new");
  assert.equal(records.get(1).done, true);
  queue.schedule("row", 1, { text: "queued" });
  await queue.remove("row", 1);
  assert.equal(records.size, 0);
});

test("failed updates retain merged fields and failed deletion stays retryable", async () => {
  let failUpdate = true, failDelete = true;
  const { queue, records, saved, errors } = await makeQueue({ updateTodo: async (id, patch) => {
    if (failUpdate) throw new TypeError("offline");
    const row = { ...records.get(id), ...patch };
    records.set(id, row);
    return row;
  }, deleteTodo: async (id) => {
    if (failDelete) throw new TypeError("offline");
    records.delete(id);
  } });
  records.set(1, { id: 1, text: "old", priority: 3 });
  queue.schedule("row", 1, { text: "latest" });
  await queue.flush("row");
  queue.schedule("row", 1, { priority: 1 });
  failUpdate = false;
  await queue.retry("row");
  assert.equal(records.get(1).text, "latest");
  assert.equal(records.get(1).priority, 1);
  await queue.remove("row", 1);
  assert.equal(records.size, 1);
  assert.notEqual(saved.at(-1).row, null);
  failDelete = false;
  await queue.retry("row");
  assert.equal(records.size, 0);
  assert.equal(errors.length, 2);
});

test("delete after ambiguous create retries the same identity before removal", async () => {
  let attempts = 0;
  const identities = [];
  const { queue, records } = await makeQueue({ createTodo: async (fields) => {
    identities.push(fields.clientId);
    if (++attempts === 1) {
      records.set(1, { ...fields, id: 1 });
      throw new TypeError("lost");
    }
    return records.get(1);
  } });
  queue.schedule("stable", null, { text: "remove" });
  await queue.flush("stable");
  await queue.remove("stable", null);
  await queue.retry("stable");
  assert.deepEqual(identities, ["stable", "stable"]);
  assert.equal(records.size, 0);
});

test("debounce merges all edited fields and failed work waits for explicit retry", async () => {
  let attempts = 0;
  const { queue, records, errors } = await makeQueue({ updateTodo: async (id, patch) => {
    attempts++;
    if (attempts === 1) throw new TypeError("offline");
    const row = { ...records.get(id), ...patch };
    records.set(id, row);
    return row;
  } });
  records.set(1, { id: 1, text: "before", priority: 3, dueDate: "" });
  queue.schedule("row", 1, { text: "after" });
  queue.schedule("row", 1, { priority: 1, dueDate: "2026-10-20" });
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.equal(errors.length, 1);
  assert.equal(attempts, 1);
  queue.schedule("row", 1, { text: "latest" });
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.equal(attempts, 1);
  await queue.retry("row");
  assert.equal(records.get(1).text, "latest");
  assert.equal(records.get(1).priority, 1);
  assert.equal(records.get(1).dueDate, "2026-10-20");
});
