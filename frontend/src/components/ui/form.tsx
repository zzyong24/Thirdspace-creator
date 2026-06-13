"use client";

/**
 * Minimal Form compound component.
 *
 * Why hand-rolled instead of `pnpm shadcn add form`:
 *   The shadcn `form` primitive requires `react-hook-form`, `zod`,
 *   `@hookform/resolvers` and `radix-ui` as runtime dependencies. This
 *   project is forbidden from adding dependencies, so we expose the
 *   small set of sub-components that downstream pages need (Field, Label,
 *   Control, Description, Message, Submit) on top of native HTML form
 *   semantics. They are styled with the same shared tokens as every
 *   other primitive and remain accessible by default.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

const FormContext = React.createContext<{ id: string } | null>(null);

function Form({
  id,
  className,
  children,
  ...props
}: React.FormHTMLAttributes<HTMLFormElement>) {
  const reactId = React.useId();
  const formId = id ?? reactId;

  return (
    <FormContext.Provider value={{ id: formId }}>
      <form
        id={formId}
        data-slot="form"
        className={cn("grid gap-4", className)}
        {...props}
      >
        {children}
      </form>
    </FormContext.Provider>
  );
}

const FieldContext = React.createContext<{
  name: string;
  id: string;
} | null>(null);

function Field({
  name,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { name: string }) {
  const form = React.useContext(FormContext);
  if (!form) {
    throw new Error("Form.Field must be used within <Form>");
  }
  const fieldId = `${form.id}-${name}`;

  return (
    <FieldContext.Provider value={{ name, id: fieldId }}>
      <div
        data-slot="form-field"
        data-name={name}
        className={cn("grid gap-2", className)}
        {...props}
      >
        {children}
      </div>
    </FieldContext.Provider>
  );
}

function useFieldContext(component: string) {
  const ctx = React.useContext(FieldContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <Form.Field>`);
  }
  return ctx;
}

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(function Label({ className, children, ...props }, ref) {
  const field = useFieldContext("Form.Label");
  return (
    <label
      ref={ref}
      data-slot="form-label"
      htmlFor={field.id}
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    >
      {children}
    </label>
  );
});

const Description = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function Description({ className, ...props }, ref) {
  const field = useFieldContext("Form.Description");
  return (
    <p
      ref={ref}
      data-slot="form-description"
      id={`${field.id}-description`}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});

const Message = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function Message({ className, children, ...props }, ref) {
  const field = useFieldContext("Form.Message");
  if (!children) {
    return null;
  }
  return (
    <p
      ref={ref}
      data-slot="form-message"
      id={`${field.id}-message`}
      className={cn("text-sm text-destructive", className)}
      {...props}
    >
      {children}
    </p>
  );
});

const Control = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { asChild?: boolean }
>(function Control({ className, children, ...props }, ref) {
  const field = useFieldContext("Form.Control");
  const describedBy = `${field.id}-description ${field.id}-message`;
  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      data-slot="form-control"
      className={cn(className)}
      aria-describedby={describedBy}
      {...props}
    >
      {children}
    </div>
  );
});

function Submit({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      data-slot="form-submit"
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export {
  Form,
  Field,
  Label,
  Description,
  Message,
  Control,
  Submit,
};

export const FormNamespace = Object.assign(Form, {
  Field,
  Label,
  Description,
  Message,
  Control,
  Submit,
});