import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home page", () => {
  it("renders the app title", () => {
    render(<Home />);
    expect(screen.getByText("Dino Division")).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<Home />);
    expect(
      screen.getByText("Long-division practice, Jurassic style.")
    ).toBeInTheDocument();
  });

  it("uses Jurassic-themed heading class", () => {
    render(<Home />);
    const heading = screen.getByText("Dino Division");
    expect(heading.className).toContain("dino-heading");
  });

  it("renders action buttons", () => {
    render(<Home />);
    expect(screen.getByText("Start Practice")).toBeInTheDocument();
    expect(screen.getByText("Load Save")).toBeInTheDocument();
  });

  it("applies themed button classes", () => {
    render(<Home />);
    const primaryBtn = screen.getByText("Start Practice");
    expect(primaryBtn.className).toContain("dino-btn-primary");
    const secondaryBtn = screen.getByText("Load Save");
    expect(secondaryBtn.className).toContain("dino-btn-secondary");
  });
});
