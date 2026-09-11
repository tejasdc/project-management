import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "./__root";

const createAnyFileRoute = createFileRoute as any;

export const Route = createAnyFileRoute("/")({
  component: () => null,
  errorComponent: RouteError,
});
