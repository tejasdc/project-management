import { Toaster } from "sonner";

export function Sonner() {
  return (
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
  );
}

