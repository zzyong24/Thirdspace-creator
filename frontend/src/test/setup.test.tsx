import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

test("provides jest-dom matchers to component tests", () => {
  render(<button type="button">Create project</button>);

  expect(
    screen.getByRole("button", { name: "Create project" }),
  ).toBeInTheDocument();
});
