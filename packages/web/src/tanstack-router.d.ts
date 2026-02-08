import "@tanstack/router-core";

// When the file-based route generator isn't available (or hasn't run yet),
// `FileRoutesByPath` is empty and `createFileRoute('/path')` won't typecheck.
// We keep this permissive augmentation so `npx tsc --noEmit` still passes.
declare module "@tanstack/router-core" {
  interface FileRoutesByPath {
    [key: string]: any;
  }
}

