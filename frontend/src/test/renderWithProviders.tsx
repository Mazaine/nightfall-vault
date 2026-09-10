import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { AuthProvider } from "../AuthContext";

type ProviderOptions = Omit<RenderOptions, "wrapper"> & {
  route?: string;
};

export function renderWithProviders(ui: ReactElement, { route = "/", ...options }: ProviderOptions = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
    options,
  );
}
