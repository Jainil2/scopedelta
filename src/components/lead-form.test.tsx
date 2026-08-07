import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LeadForm } from "./lead-form";

const submissionId = "8f250d9e-01b8-47ad-84ce-e3215eca4cbe";

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/your name/i), "  Alex Rivera  ");
  await user.type(screen.getByLabelText(/work email/i), "Alex@Example.com");
  await user.selectOptions(
    screen.getByLabelText(/i run or work as/i),
    "agency",
  );
  await user.type(screen.getByLabelText(/company name/i), "River Studio");
  await user.type(
    screen.getByLabelText(/where does scope creep hurt most today/i),
    "Requests arrive in chat and get built before the commercial conversation.",
  );
}

describe("LeadForm", () => {
  beforeEach(() => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(submissionId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("validates required fields before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<LeadForm />);

    await user.click(
      screen.getByRole("button", { name: /apply for a paid pilot/i }),
    );

    expect(screen.getByText(/enter your name/i)).toBeInTheDocument();
    expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument();
    expect(
      screen.getByText(/choose agency or freelancer/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/share at least 20 characters/i),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits once and clears fields only after success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<LeadForm />);
    await fillValidForm(user);

    await user.click(
      screen.getByRole("button", { name: /apply for a paid pilot/i }),
    );

    expect(
      await screen.findByText(/application received/i),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/your name/i)).toHaveValue("");
    expect(
      screen.getByLabelText(/where does scope creep hurt most today/i),
    ).toHaveValue("");
  });

  it("preserves input and reuses the submission ID after an upstream failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            code: "submission_unavailable",
            message:
              "We could not send your application. Your answers are still here—please try again shortly.",
          }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<LeadForm />);
    await fillValidForm(user);

    await user.click(
      screen.getByRole("button", { name: /apply for a paid pilot/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /answers are still here/i,
    );
    expect(screen.getByLabelText(/your name/i)).toHaveValue("  Alex Rivera  ");

    await user.click(
      screen.getByRole("button", { name: /apply for a paid pilot/i }),
    );
    await screen.findByText(/application received/i);

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.submissionId).toBe(firstBody.submissionId);
  });

  it("prevents duplicate clicks while a submission is pending", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<LeadForm />);
    await fillValidForm(user);
    const button = screen.getByRole("button", {
      name: /apply for a paid pilot/i,
    });

    await user.click(button);
    await user.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    resolveRequest(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
