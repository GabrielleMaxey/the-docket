import readline from "readline/promises";

export const isMaskedInputAvailable = (stdin) =>
  stdin.isTTY === true && typeof stdin.setRawMode === "function";

export const readMaskedLine = ({ stdin, stdout, prompt }) =>
  new Promise((resolve, reject) => {
    let value = "";

    const finish = (settle) => {
      stdin.removeListener("data", onData);
      stdin.removeListener("error", onError);
      try {
        stdin.setRawMode(false);
      } finally {
        stdin.pause();
      }
      stdout.write("\n");
      settle();
    };

    const onError = (error) => finish(() => reject(error));

    const onData = (chunk) => {
      for (const char of String(chunk)) {
        if (char === "\r" || char === "\n") {
          finish(() => resolve(value));
          return;
        }
        if (char === "\x03") {
          finish(() => reject(new Error("Cancelled")));
          return;
        }
        if (char === "\x7f" || char === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        value += char;
        stdout.write("*");
      }
    };

    stdout.write(prompt);
    try {
      stdin.setRawMode(true);
      stdin.resume();
    } catch (error) {
      stdin.removeListener("data", onData);
      reject(error);
      return;
    }
    stdin.on("data", onData);
    stdin.on("error", onError);
  });

export const askLine = async ({ stdin, stdout, prompt, visibleWarning = true }) => {
  if (visibleWarning) {
    stdout.write("Warning: input will be visible as you type (masked input is not available in this terminal).\n");
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
};
