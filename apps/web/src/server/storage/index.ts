import "server-only";
import { createStore, type ObjectStore } from "@openlabel/storage";
import { getConfig } from "../env";

let store: ObjectStore | undefined;

/** Object store chosen by STORAGE_DRIVER, one per process. */
export function getStore(): ObjectStore {
  store ??= createStore(getConfig());
  return store;
}
