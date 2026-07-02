/**
 * Contract tests for the New Project form (Task 11).
 *
 * Locks the structural and behavioural invariants the form must satisfy
 * before any pixel tuning:
 *  - the form renders the five spec-locked fields in the exact order
 *    (Project Name → Project Brief → Target Platform → Content Type →
 *    Creation Mode) and a footer with the three locked actions,
 *  - the Project Name field is required (the underlying input carries the
 *    `required` attribute or `aria-required="true"`),
 *  - each platform / content type / creation mode card is a focusable
 *    `role="radio"` element whose keyboard activation (Enter or Space)
 *    updates the form state,
 *  - Cancel closes the dialog via `onCancel` without firing `onCreate`
 *    and without mutating the form state,
 *  - Create is disabled while the project name is empty and enabled once
 *    a non-empty trimmed name is provided,
 *  - Create fires `onCreate` with the assembled form data, then performs
 *    a local success transition (the dialog can be closed by the parent),
 *  - focus is trapped inside the dialog and the previously focused
 *    element is restored on close (covered by the existing
 *    overlay-routing shell; the form must not regress it).
 *
 * The form is a Client Component that exposes plain callback props so the
 * parent (the intercepting-route dialog) owns routing decisions. Tests
 * therefore render `<NewProjectForm />` in isolation with stub callbacks
 * and wrap it in a minimal `role="dialog"` container to keep the focus
 * trap and Escape handling honest.
 */

import * as React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { NewProjectForm } from "./new-project-form";
import type { NewProjectFormValues } from "./new-project-form";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render the form inside a real `role="dialog"` container so the form's
 * own focus-trap behaviour can run, and expose the stubs the test needs
 * to assert on.
 */
type CreateSpy = (values: NewProjectFormValues) => void;
type CancelSpy = () => void;

function renderForm({
  defaultValues,
  onCreate,
  onCancel,
}: {
  defaultValues?: Partial<NewProjectFormValues>;
  onCreate?: CreateSpy;
  onCancel?: CancelSpy;
} = {}) {
  const createSpy = (onCreate ?? vi.fn()) as unknown as CreateSpy & {
    mock: { calls: unknown[][] };
  };
  const cancelSpy = (onCancel ?? vi.fn()) as unknown as CancelSpy & {
    mock: { calls: unknown[][] };
  };
  const result = render(
    <div role="dialog" aria-label="新建项目" data-slot="overlay-panel">
      <NewProjectForm
        defaultValues={defaultValues}
        onCreate={createSpy}
        onCancel={cancelSpy}
      />
    </div>,
  );
  return { ...result, createSpy, cancelSpy };
}

async function importForm() {
  return await import("./new-project-form");
}

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Field order
// ---------------------------------------------------------------------------

describe("NewProjectForm — field order", () => {
  it("[T-052 裁决④] 四个合宪表单区按序(画幅替代模板/平台)", () => {
    renderForm();

    expect(
      Array.from(document.querySelectorAll("[data-form-section]"))
        .map((node) => node.getAttribute("data-section")),
    ).toEqual([
      "name",
      "brief",
      "orientation",
      "creation-mode",
    ]);
  });

  it("renders the spec-locked fields in the required order", async () => {
    const { NewProjectForm } = await importForm();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm onCreate={vi.fn()} onCancel={vi.fn()} />
      </div>,
    );

    const dialog = screen.getByRole("dialog", { name: /新建项目/i });
    const fieldOrder = within(dialog)
      .getAllByTestId(/^new-project-(name|brief|orientation|creation-mode)$/)
      .map((el) => el.getAttribute("data-testid"));

    // [T-052 裁决④] 宪法 §8:内容模板/项目层平台已裁,画幅是唯一形态区分。
    expect(fieldOrder).toEqual([
      "new-project-name",
      "new-project-brief",
      "new-project-orientation",
      "new-project-creation-mode",
    ]);
  });

  it("renders the footer after the creation-mode field", async () => {
    const { NewProjectForm } = await importForm();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm onCreate={vi.fn()} onCancel={vi.fn()} />
      </div>,
    );
    const dialog = screen.getByRole("dialog", { name: /新建项目/i });
    const creationMode = within(dialog).getByTestId(
      "new-project-creation-mode",
    );
    const footer = within(dialog).getByTestId("new-project-footer");
    // The footer must come after the creation mode field in the DOM order.
    expect(
      creationMode.compareDocumentPosition(footer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Project name field
// ---------------------------------------------------------------------------

describe("NewProjectForm — project name field", () => {
  it("marks the project name as required", async () => {
    const { NewProjectForm } = await importForm();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm onCreate={vi.fn()} onCancel={vi.fn()} />
      </div>,
    );
    const nameField = screen.getByTestId("new-project-name");
    const input = within(nameField).getByRole("textbox", { name: /项目名称/i });
    // Either the native `required` attribute or the ARIA equivalent must
    // be present. The hand-rolled Form primitive mirrors both.
    const isRequired =
      input.hasAttribute("required") ||
      input.getAttribute("aria-required") === "true";
    expect(isRequired).toBe(true);
  });

  it("updates the form state as the user types", async () => {
    await importForm();
    const user = userEvent.setup();
    const { createSpy } = renderForm();
    const input = screen.getByLabelText(/项目名称/i);
    await user.type(input, "AI Native Browser 深度解析");
    expect(input).toHaveValue("AI Native Browser 深度解析");
    // The Create button must become enabled once a name is present.
    const create = screen.getByRole("button", { name: /^创建$/ });
    expect(create).toBeEnabled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Project brief field
// ---------------------------------------------------------------------------

describe("NewProjectForm — project brief field", () => {
  it("renders a multi-line textarea labelled 一句话描述", async () => {
    const { NewProjectForm } = await importForm();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm onCreate={vi.fn()} onCancel={vi.fn()} />
      </div>,
    );
    const briefField = screen.getByTestId("new-project-brief");
    const textarea = within(briefField).getByRole("textbox", {
      name: /一句话描述/i,
    });
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
  });
});

// ---------------------------------------------------------------------------
// Selection cards
// ---------------------------------------------------------------------------

describe("NewProjectForm — selection cards", () => {
  it("renders target platform cards as keyboard-selectable radios", async () => {
    const { NewProjectForm } = await importForm();
    const user = userEvent.setup();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm onCreate={vi.fn()} onCancel={vi.fn()} />
      </div>,
    );
    const orientationField = screen.getByTestId("new-project-orientation");
    const landscape = within(orientationField).getByRole("radio", {
      name: /横屏/i,
    });
    expect(landscape).toBeInTheDocument();
    landscape.focus();
    await user.keyboard("{Enter}");
    expect(landscape).toBeChecked();
    landscape.focus();
    await user.keyboard(" ");
    // The card stays checked after Space — Space must not toggle it off
    // once it is the active selection.
    expect(landscape).toBeChecked();
  });

  it("renders creation mode cards as keyboard-selectable radios", async () => {
    const { NewProjectForm } = await importForm();
    const user = userEvent.setup();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm onCreate={vi.fn()} onCancel={vi.fn()} />
      </div>,
    );
    const modeField = screen.getByTestId("new-project-creation-mode");
    const guided = within(modeField).getByDisplayValue("flexible");
    guided.focus();
    await user.keyboard("{Enter}");
    expect(guided).toBeChecked();
  });

  it("supports only one selection per field (radio group semantics)", async () => {
    const { NewProjectForm } = await importForm();
    const user = userEvent.setup();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm onCreate={vi.fn()} onCancel={vi.fn()} />
      </div>,
    );
    const orientationField = screen.getByTestId("new-project-orientation");
    const radios = within(orientationField).getAllByRole("radio");
    expect(radios.length).toBeGreaterThanOrEqual(2);
    // Activate two different options; only the latest should remain
    // checked.
    const first = radios[0]!;
    const second = radios[1]!;
    first.focus();
    await user.keyboard("{Enter}");
    second.focus();
    await user.keyboard("{Enter}");
    expect(second).toBeChecked();
    expect(first).not.toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// Footer actions
// ---------------------------------------------------------------------------

describe("NewProjectForm — footer actions", () => {
  it("renders Cancel and Create buttons in that order", async () => {
    const { NewProjectForm } = await importForm();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm onCreate={vi.fn()} onCancel={vi.fn()} />
      </div>,
    );
    const footer = screen.getByTestId("new-project-footer");
    const buttons = within(footer).getAllByRole("button");
    const labels = buttons.map((btn) => btn.textContent ?? "");
    const cancelIndex = labels.findIndex((l) => /取消/.test(l));
    const createIndex = labels.findIndex((l) => /创建/.test(l));
    expect(cancelIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThan(cancelIndex);
  });

  it("disables the Create button while the project name is empty or whitespace", async () => {
    const { NewProjectForm } = await importForm();
    const user = userEvent.setup();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm onCreate={vi.fn()} onCancel={vi.fn()} />
      </div>,
    );
    const create = screen.getByRole("button", { name: /^创建$/ });
    expect(create).toBeDisabled();
    const input = screen.getByLabelText(/项目名称/i);
    await user.type(input, "   ");
    expect(create).toBeDisabled();
    await user.clear(input);
    await user.type(input, "AI Native Browser");
    expect(create).toBeEnabled();
  });

  it("calls onCancel without firing onCreate when Cancel is pressed", async () => {
    const { NewProjectForm } = await importForm();
    const user = userEvent.setup();
    const createSpy = vi.fn();
    const cancelSpy = vi.fn();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm onCreate={createSpy} onCancel={cancelSpy} />
      </div>,
    );
    // Type into the name field then change the brief to prove the form
    // does not carry state forward on cancel.
    const input = screen.getByLabelText(/项目名称/i);
    await user.type(input, "AI Native Browser");
    const brief = screen.getByLabelText(/一句话描述/i);
    await user.type(brief, "深度拆解");
    const cancel = screen.getByRole("button", { name: /^取消$/ });
    await user.click(cancel);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("calls onCreate with the assembled form data and resets the form", async () => {
    const { NewProjectForm } = await importForm();
    const user = userEvent.setup();
    const createSpy = vi.fn();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm onCreate={createSpy} onCancel={vi.fn()} />
      </div>,
    );
    await user.type(screen.getByLabelText(/项目名称/i), "AI Native Browser");
    await user.type(screen.getByLabelText(/一句话描述/i), "深度拆解浏览器趋势");
    // 画幅默认竖屏,切到横屏验证 radio 路径与提交值。
    const landscape = within(screen.getByTestId("new-project-orientation")).getByRole(
      "radio",
      { name: /横屏/i },
    );
    landscape.focus();
    await user.keyboard("{Enter}");
    const guided = within(
      screen.getByTestId("new-project-creation-mode"),
    ).getByDisplayValue("flexible");
    guided.focus();
    await user.keyboard("{Enter}");

    const create = screen.getByRole("button", { name: /^创建$/ });
    await user.click(create);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const payload = createSpy.mock.calls[0]?.[0] as NewProjectFormValues;
    expect(payload.name).toBe("AI Native Browser");
    expect(payload.brief).toBe("深度拆解浏览器趋势");
    // [T-052 裁决④] 画幅是唯一形态字段;不再有 platforms/contentType。
    expect(payload.orientation).toBe("landscape");
    expect(payload.creationMode).toBe("flexible");

    // Local success transition: the form resets, the next mount behaves
    // like a fresh dialog. We assert the input is empty again.
    await waitFor(() => {
      expect(screen.getByLabelText(/项目名称/i)).toHaveValue("");
    });
  });

  it("renders the EnterAfterCreateCheckbox in the footer", async () => {
    const { NewProjectForm } = await importForm();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm onCreate={vi.fn()} onCancel={vi.fn()} />
      </div>,
    );
    const footer = screen.getByTestId("new-project-footer");
    expect(within(footer).getByTestId("new-project-enter-after-create")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Default values / controlled state
// ---------------------------------------------------------------------------

describe("NewProjectForm — default values", () => {
  it("honours defaultValues supplied by the caller", async () => {
    const { NewProjectForm } = await importForm();
    render(
      <div role="dialog" aria-label="新建项目">
        <NewProjectForm
          onCreate={vi.fn()}
          onCancel={vi.fn()}
          defaultValues={{
            name: "AI Native Browser",
            brief: "深度拆解",
            orientation: "landscape",
            creationMode: "guided",
            enterAfterCreate: true,
          }}
        />
      </div>,
    );
    expect(screen.getByLabelText(/项目名称/i)).toHaveValue("AI Native Browser");
    expect(screen.getByLabelText(/一句话描述/i)).toHaveValue("深度拆解");
    const landscapeDefault = within(
      screen.getByTestId("new-project-orientation"),
    ).getByRole("radio", { name: /横屏/i });
    expect(landscapeDefault).toBeChecked();
  });
});
