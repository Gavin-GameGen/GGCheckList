// data.js
const mock = {
  items: [
    { item_id: 1, label: "Check In", exp: 10, done: false },
    { item_id: 1, label: "Talk to Mentor", exp: 15, done: false },
    { item_id: 2, label: "Show Your Work", exp: 20, done: false },
    { item_id: 1, label: "Join an Event", exp: 25, done: false }
  ],
  async signIn() {},
  async getChecklist() { return structuredClone(this.items); },
  async setDone(itemId, done) {
    const it = this.items.find(i => i.item_id === itemId);
    if (it) it.done = done;
  },
  subscribe(callback) {}  // no live updates in mock mode
};

export const api = mock;