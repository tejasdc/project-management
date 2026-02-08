import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { App } from "../src/app";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("renders without crashing", async () => {
    window.history.pushState({}, "", "/");

    const el = document.createElement("div");
    document.body.appendChild(el);

    const root = createRoot(el);
    root.render(<App />);

    await new Promise((r) => setTimeout(r, 0));
    expect(el.textContent ?? "").not.toEqual("");

    root.unmount();
  });
});

