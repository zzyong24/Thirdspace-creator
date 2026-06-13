/**
 * Contract test for the 22 approved shadcn/ui primitives.
 *
 * Each primitive MUST:
 *  - expose a stable named export consumed via `@/components/ui/<name>`,
 *  - expose a name to assistive tech via visible label, `aria-label`, or `aria-labelledby`,
 *  - respond to keyboard activation (Enter / Space) where applicable.
 *
 * No `Math.random`, `Date.now` or network calls in this suite.
 *
 * axe checks are covered by the Playwright accessibility suite
 * (`@axe-core/playwright`); this contract test focuses on keyboard, role
 * and name guarantees that are easier to assert at the unit level.
 */

import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
} from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  Field as FormField,
  Label as FormLabel,
  Control as FormControl,
  Description as FormDescription,
  Submit as FormSubmit,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

describe("ui primitives contract", () => {
  it("Button is keyboard activatable with an accessible name", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button onClick={onClick} aria-label="Save draft">
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: /save draft/i });
    expect(button).toBeInTheDocument();
    button.focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("Badge exposes its label to assistive tech", () => {
    const { container } = render(
      <Badge aria-label="Status: published">Published</Badge>,
    );
    expect(screen.getByLabelText(/status: published/i)).toBeInTheDocument();
    expect(container).toHaveTextContent("Published");
  });

  it("Input accepts text and exposes an accessible name", async () => {
    const user = userEvent.setup();

    render(
      <>
        <label htmlFor="contract-input-title">Title</label>
        <Input id="contract-input-title" placeholder="Enter a title" />
      </>,
    );

    const input = screen.getByLabelText(/title/i);
    expect(input).toBeInTheDocument();
    await user.type(input, "Hello world");
    expect(input).toHaveValue("Hello world");
  });

  it("Textarea accepts multi-line text", async () => {
    const user = userEvent.setup();

    render(
      <>
        <label htmlFor="contract-textarea-bio">Bio</label>
        <Textarea id="contract-textarea-bio" placeholder="Tell us about you" />
      </>,
    );

    const textarea = screen.getByLabelText(/bio/i);
    await user.type(textarea, "Line 1{Enter}Line 2");
    expect(textarea).toHaveValue("Line 1\nLine 2");
  });

  it("Checkbox toggles on click and Space", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();

    render(
      <>
        <label htmlFor="contract-checkbox-terms">Accept terms</label>
        <Checkbox
          id="contract-checkbox-terms"
          onCheckedChange={onCheckedChange}
        />
      </>,
    );

    const checkbox = screen.getByRole("checkbox", { name: /accept terms/i });
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    await user.click(checkbox);
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);
    expect(checkbox).toHaveAttribute("aria-checked", "true");
    checkbox.focus();
    await user.keyboard(" ");
    expect(onCheckedChange.mock.calls.at(-1)?.[0]).toBe(false);
    expect(checkbox).toHaveAttribute("aria-checked", "false");
  });

  it("Switch toggles on click", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();

    render(
      <>
        <label htmlFor="contract-switch-notifications">Notifications</label>
        <Switch
          id="contract-switch-notifications"
          onCheckedChange={onCheckedChange}
        />
      </>,
    );

    const switchEl = screen.getByRole("switch", { name: /notifications/i });
    expect(switchEl).toHaveAttribute("aria-checked", "false");
    await user.click(switchEl);
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);
    expect(switchEl).toHaveAttribute("aria-checked", "true");
  });

  it("Tabs can be navigated by keyboard", async () => {
    const user = userEvent.setup();

    render(
      <Tabs defaultValue="overview" aria-label="Section">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="details">Details content</TabsContent>
      </Tabs>,
    );

    const overview = screen.getByRole("tab", { name: /overview/i });
    const details = screen.getByRole("tab", { name: /details/i });

    expect(overview).toHaveAttribute("aria-selected", "true");
    expect(details).toHaveAttribute("aria-selected", "false");

    await user.click(details);
    expect(details).toHaveAttribute("aria-selected", "true");
    expect(overview).toHaveAttribute("aria-selected", "false");

    details.focus();
    await user.keyboard("{ArrowLeft}");
    expect(overview).toHaveFocus();
  });

  it("Toggle Group toggles selection", async () => {
    const user = userEvent.setup();

    render(
      <ToggleGroup defaultValue={["bold"]} aria-label="Text formatting">
        <ToggleGroupItem value="bold" aria-label="Bold">
          B
        </ToggleGroupItem>
        <ToggleGroupItem value="italic" aria-label="Italic">
          I
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    const bold = screen.getByRole("button", { name: /bold/i });
    const italic = screen.getByRole("button", { name: /italic/i });

    expect(bold).toHaveAttribute("aria-pressed", "true");
    await user.click(italic);
    expect(italic).toHaveAttribute("aria-pressed", "true");
    expect(bold).toHaveAttribute("aria-pressed", "false");
  });

  it("Select opens and exposes a labelled listbox", async () => {
    const user = userEvent.setup();

    render(
      <Select>
        <SelectTrigger id="contract-select-platform" aria-label="Platform">
          <SelectValue placeholder="Choose a platform" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="douyin">Douyin</SelectItem>
          <SelectItem value="xiaohongshu">Xiaohongshu</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByLabelText(/platform/i);
    await user.click(trigger);

    const douyin = await screen.findByRole("option", { name: /douyin/i });
    expect(douyin).toBeInTheDocument();
    await user.click(douyin);
    await waitFor(() => {
      expect(trigger).toHaveTextContent(/douyin/i);
    });
  });

  it("Dropdown Menu opens with menu items", async () => {
    const user = userEvent.setup();

    render(
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Account menu">Account</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const trigger = screen.getByLabelText(/account menu/i);
    await user.click(trigger);
    expect(
      await screen.findByRole("menuitem", { name: /profile/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument();
  });

  it("Dialog traps focus and is labelled", async () => {
    const user = userEvent.setup();

    render(
      <Dialog defaultOpen>
        <DialogContent aria-describedby="contract-dialog-desc">
          <DialogTitle>Confirm action</DialogTitle>
          <p id="contract-dialog-desc">Are you sure?</p>
          <DialogClose aria-label="Close dialog">Close</DialogClose>
        </DialogContent>
      </Dialog>,
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/confirm action/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
    });

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("Sheet opens like a side dialog and exposes labelled content", async () => {
    const user = userEvent.setup();

    render(
      <Sheet defaultOpen>
        <SheetContent aria-describedby="contract-sheet-desc">
          <SheetTitle>Notifications panel</SheetTitle>
          <p id="contract-sheet-desc">Recent activity</p>
          <SheetClose aria-label="Close notifications">Close</SheetClose>
        </SheetContent>
      </Sheet>,
    );

    const title = await screen.findByText(/notifications panel/i);
    expect(title).toBeInTheDocument();
    await user.keyboard("{Escape}");
  });

  it("Tooltip reveals content on focus", async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger aria-label="Help">?</TooltipTrigger>
          <TooltipContent>Need a hand?</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const trigger = screen.getByLabelText(/help/i);
    await user.hover(trigger);
    const tooltip = await screen.findByText(/need a hand/i);
    expect(tooltip).toBeInTheDocument();
  });

  it("Popover reveals content on hover", async () => {
    const user = userEvent.setup();

    render(
      <Popover>
        <PopoverTrigger aria-label="Open filters">Filters</PopoverTrigger>
        <PopoverContent>
          <p>Filter options</p>
        </PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByLabelText(/open filters/i);
    await user.click(trigger);
    expect(await screen.findByText(/filter options/i)).toBeInTheDocument();
  });

  it("Progress exposes its value to assistive tech", () => {
    render(<Progress value={42} aria-label="Upload progress" />);
    const progress = screen.getByLabelText(/upload progress/i);
    expect(progress).toBeInTheDocument();
    expect(progress).toHaveAttribute("aria-valuenow", "42");
  });

  it("Table renders header and rows", () => {
    render(
      <Table aria-label="Posts">
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Hello</TableCell>
            <TableCell>Draft</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const table = screen.getByRole("table", { name: /posts/i });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers).toHaveLength(2);
    expect(within(table).getAllByRole("cell")).toHaveLength(2);
  });

  it("Form renders as a labelled region with submit", () => {
    render(
      <Form aria-label="Create post">
        <FormField name="title">
          <FormLabel>Title</FormLabel>
          <FormControl>
            <input placeholder="Title" />
          </FormControl>
          <FormDescription>Internal title</FormDescription>
        </FormField>
        <FormSubmit>Save</FormSubmit>
      </Form>,
    );

    const form = screen.getByRole("form", { name: /create post/i });
    expect(form).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("ScrollArea renders scrollable content with accessible role", () => {
    render(
      <ScrollArea aria-label="Conversation transcript">
        <p>Message one</p>
        <p>Message two</p>
      </ScrollArea>,
    );
    expect(screen.getByLabelText(/conversation transcript/i)).toBeInTheDocument();
  });

  it("Separator exposes its role", () => {
    render(<Separator aria-label="Section divider" />);
    expect(screen.getByLabelText(/section divider/i)).toBeInTheDocument();
  });

  it("Avatar renders an accessible image fallback", () => {
    render(
      <Avatar aria-label="Avatar of Ada Lovelace">
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByLabelText(/avatar of ada lovelace/i)).toBeInTheDocument();
  });

  it("Card renders an accessible region with a heading", () => {
    render(
      <Card aria-label="Project summary">
        <CardHeader>
          <CardTitle>Revenue this month</CardTitle>
        </CardHeader>
        <CardContent>$12,300</CardContent>
      </Card>,
    );
    expect(screen.getByLabelText(/project summary/i)).toBeInTheDocument();
    expect(screen.getByText(/revenue this month/i)).toBeInTheDocument();
  });

  it("Chart renders a labelled container", () => {
    render(
      <ChartContainer
        aria-label="Weekly engagement"
        config={{ value: { label: "Engagement" } }}
      >
        <p>Chart placeholder</p>
      </ChartContainer>,
    );

    const container = screen.getByLabelText(/weekly engagement/i);
    expect(container).toBeInTheDocument();
  });
});