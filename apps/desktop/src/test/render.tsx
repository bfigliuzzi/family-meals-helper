import { MantineProvider } from "@mantine/core";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { theme } from "../theme.ts";

// `env="test"` coupe les transitions et les portails.
export function renderWithMantine(ui: ReactElement) {
  return render(
    <MantineProvider theme={theme} env="test">
      {ui}
    </MantineProvider>,
  );
}
