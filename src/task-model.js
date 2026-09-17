class Task {
  constructor(input) {
    if (typeof input !== "string" || input.trim().length === 0) {
      throw new TypeError("task input must be a non-empty string");
    }
    this.input = input.trim();
  }
}

module.exports = { Task };
