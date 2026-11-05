const PREFIX = "[Chat Suite]";

export const log = {
  info(...args) {
    console.log(PREFIX, ...args);
  },
  error(...args) {
    console.error(PREFIX, ...args);
  },
};
