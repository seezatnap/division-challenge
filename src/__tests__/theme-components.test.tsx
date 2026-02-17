import { render, screen } from "@testing-library/react";
import {
  DinoBackground,
  DinoNav,
  DinoPageShell,
} from "@/features/theme/ThemeProvider";

describe("DinoBackground", () => {
  it("renders a decorative background container", () => {
    const { container } = render(<DinoBackground />);
    const bg = container.firstChild as HTMLElement;
    expect(bg).toBeInTheDocument();
    expect(bg.getAttribute("aria-hidden")).toBe("true");
  });

  it("is not interactive (pointer-events-none)", () => {
    const { container } = render(<DinoBackground />);
    const bg = container.firstChild as HTMLElement;
    expect(bg.className).toContain("pointer-events-none");
  });

  it("renders fern SVG motifs", () => {
    const { container } = render(<DinoBackground />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });
});

describe("DinoNav", () => {
  it("renders the site title", () => {
    render(<DinoNav />);
    expect(screen.getByText("Dino Division")).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    render(<DinoNav />);
    expect(screen.getByText("Play")).toBeInTheDocument();
    expect(screen.getByText("Gallery")).toBeInTheDocument();
  });

  it("links Play to home route", () => {
    render(<DinoNav />);
    const playLink = screen.getByText("Play");
    expect(playLink.closest("a")).toHaveAttribute("href", "/");
  });

  it("links Gallery to gallery route", () => {
    render(<DinoNav />);
    const galleryLink = screen.getByText("Gallery");
    expect(galleryLink.closest("a")).toHaveAttribute("href", "/gallery");
  });

  it("uses sticky positioning for the nav", () => {
    const { container } = render(<DinoNav />);
    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("sticky");
    expect(nav?.className).toContain("top-0");
  });

  it("includes a dino emoji in the logo", () => {
    render(<DinoNav />);
    expect(screen.getByText("🦕")).toBeInTheDocument();
  });
});

describe("DinoPageShell", () => {
  it("renders children within the themed shell", () => {
    render(
      <DinoPageShell>
        <div data-testid="child">Hello Jurassic World</div>
      </DinoPageShell>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Hello Jurassic World")).toBeInTheDocument();
  });

  it("includes the background, nav, and main content area", () => {
    const { container } = render(
      <DinoPageShell>
        <p>Content</p>
      </DinoPageShell>
    );
    // Should have nav
    expect(container.querySelector("nav")).toBeInTheDocument();
    // Should have main
    expect(container.querySelector("main")).toBeInTheDocument();
    // Background is aria-hidden
    const hidden = container.querySelector("[aria-hidden='true']");
    expect(hidden).toBeInTheDocument();
  });

  it("applies responsive padding to main content", () => {
    const { container } = render(
      <DinoPageShell>
        <p>Content</p>
      </DinoPageShell>
    );
    const main = container.querySelector("main");
    expect(main?.className).toContain("px-4");
    expect(main?.className).toContain("sm:px-6");
    expect(main?.className).toContain("lg:px-8");
  });
});
