import { createStore, type MockStore } from "./store";

let store: MockStore | null = null;
export function getStore(): MockStore {
  if (!store) store = createStore();
  return store;
}
export function resetStore(): void {
  store = createStore();
}
