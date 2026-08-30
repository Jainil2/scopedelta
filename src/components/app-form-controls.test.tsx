import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  AppButton,
  AppField,
  AppFormActions,
  AppInput,
  AppSelect,
  AppTextarea,
} from "./app-form-controls";

describe("authenticated form controls", () => {
  it("associates labels, hints, errors, and native control semantics", () => {
    render(
      <form>
        <AppField
          id="title"
          label="Title"
          hint="Use a delivery outcome."
          required
        >
          <AppInput name="title" />
        </AppField>
        <AppField id="status" label="Status">
          <AppSelect name="status" defaultValue="ready">
            <option value="ready">Ready</option>
          </AppSelect>
        </AppField>
        <AppField id="notes" label="Notes" error="Notes are too short.">
          <AppTextarea name="notes" />
        </AppField>
      </form>,
    );

    const title = screen.getByRole("textbox", { name: /Title/ });
    expect(title).toBeRequired();
    expect(title).toHaveAccessibleDescription("Use a delivery outcome.");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
      "ready",
    );
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByRole("textbox", { name: "Notes" }),
    ).toHaveAccessibleDescription("Notes are too short.");
  });

  it("preserves disabled and pending button behavior in an action row", () => {
    render(
      <AppFormActions>
        <AppButton type="submit" disabled aria-busy="true">
          Saving…
        </AppButton>
        <AppButton type="button" variant="quiet">
          Cancel
        </AppButton>
      </AppFormActions>,
    );

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(
      "type",
      "button",
    );
  });
});
