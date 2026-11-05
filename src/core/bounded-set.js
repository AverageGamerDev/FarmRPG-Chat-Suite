/**
 * Remembers recent ids and drops the oldest once `max` is passed.
 * Set insertion order is the recency order; re-adding an existing id does not refresh it.
 *
 * @param {number} max
 */
export function createBoundedSet(max) {
  const values = new Set();

  return {
    has(value) {
      return values.has(value);
    },

    add(value) {
      if (values.has(value)) return;
      values.add(value);
      const overflow = values.size - max;
      if (overflow <= 0) return;

      const iterator = values.values();
      for (let count = 0; count < overflow; count += 1) {
        values.delete(iterator.next().value);
      }
    },

    clear() {
      values.clear();
    },

    get size() {
      return values.size;
    },
  };
}
