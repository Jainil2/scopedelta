import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, refresh, signUp, signIn } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signUp: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signUp: { email: signUp },
    signIn: { email: signIn },
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    signOut: vi.fn(),
  },
}));

import { SignInForm, SignUpForm } from "./auth-forms";

describe("authentication forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a verified-email signup and shows the enumeration-safe response", async () => {
    signUp.mockResolvedValue({ data: { user: {} }, error: null });
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Full name"), "Alex Rivera");
    await user.type(screen.getByLabelText("Work email"), "Alex@Example.com");
    await user.type(screen.getByLabelText(/^Password/), "test-password-123");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "test-password-123",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "alex@example.com",
        callbackURL: "/verification-status?next=%2Fonboarding",
      }),
    );
    expect(
      await screen.findByText(/same message is shown/i),
    ).toBeInTheDocument();
  });

  it("does not navigate when sign in is rejected", async () => {
    signIn.mockResolvedValue({
      data: null,
      error: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText("Work email"), "alex@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not accepted/i);
    expect(push).not.toHaveBeenCalled();
  });
});
