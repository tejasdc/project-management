import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";

import { router } from "./router";
import { SseProvider } from "./components/SseProvider";

function shouldRetry(err: unknown) {
  const status =
    typeof err === "object" && err !== null && "status" in err ? (err as any).status : null;
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  return true;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, err) => (shouldRetry(err) ? failureCount < 2 : false),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SseProvider />
      <RouterProvider router={router} />
      <Toaster
        richColors
        theme="dark"
        toastOptions={{
          style: {
            background: "color-mix(in oklab, var(--bg-secondary) 92%, black)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          },
        }}
      />
    </QueryClientProvider>
  );
}
