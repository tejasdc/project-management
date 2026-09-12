import { getRuntime, type Database } from "../runtime.js";
// Resolve at call time; multiple workspace objects can share an isolate.
export const db = new Proxy({} as Database, {
  get(_target, key) {
    const database = getRuntime().db;
    const value = Reflect.get(database, key);
    return typeof value === "function" ? value.bind(database) : value;
  },
});
