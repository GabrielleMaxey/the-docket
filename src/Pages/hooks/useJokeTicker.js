import React from "react";

// Self-contained "joke ticker" feature for the WorkWeekTasks header — fetches
// a couple of joke APIs, falls back to a static list, and rotates through
// them. Extracted out of WorkWeekTasks.jsx: this has nothing to do with Jira
// task management, it was just bundled into the page component.

const TEN_MINUTES_MS = 10 * 60 * 1000;

const JOKE_FETCH_SOURCES = [
  {
    url: "https://icanhazdadjoke.com/",
    headers: { Accept: "application/json" },
    extract: (data) => String(data?.joke || "").trim(),
  },
  {
    url: "https://v2.jokeapi.dev/joke/Programming?safe-mode&type=single",
    headers: { Accept: "application/json" },
    extract: (data) => String(data?.joke || "").trim(),
  },
];

const JOKE_TICKER_ITEMS = [
  "Manager mode: turning coffee into completed tickets.",
  "I don't procrastinate, I run backlog grooming drills.",
  "My favorite cardio is sprint planning.",
  "Task juggling level: circus-grade project management.",
  "Current KPI: fewer tabs, more done.",
  "There are only two hard things in task management: estimation, prioritization, and remembering what the third one was.",
  "I closed three tabs today and called it workflow optimization.",
];

const shuffleItems = (items) => {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
};

export const useJokeTicker = (enabled = true) => {
  const [jokeIndex, setJokeIndex] = React.useState(0);
  const [apiJokes, setApiJokes] = React.useState([]);

  const tickerJokes = React.useMemo(() => {
    if (apiJokes.length === 0) {
      return JOKE_TICKER_ITEMS;
    }

    return [...apiJokes, ...JOKE_TICKER_ITEMS];
  }, [apiJokes]);

  const fetchApiJokes = React.useCallback(async () => {
    const nextApiJokes = [];

    for (const source of JOKE_FETCH_SOURCES) {
      try {
        const response = await fetch(source.url, { headers: source.headers });
        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const line = source.extract(data);
        if (line) {
          nextApiJokes.push(line);
        }
      } catch {
        // Keep static jokes when API is unavailable.
      }
    }

    setApiJokes(shuffleItems(nextApiJokes));
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    fetchApiJokes();
  }, [enabled, fetchApiJokes]);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void fetchApiJokes();
      setJokeIndex((prev) => (prev + 1) % tickerJokes.length);
    }, TEN_MINUTES_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, fetchApiJokes, tickerJokes.length]);

  React.useEffect(() => {
    setJokeIndex((prev) => (prev >= tickerJokes.length ? 0 : prev));
  }, [tickerJokes.length]);

  return { tickerJokes, jokeIndex };
};
