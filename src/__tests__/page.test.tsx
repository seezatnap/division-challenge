import { render, screen, fireEvent } from "@testing-library/react";
import Home from "@/app/page";

describe("Home page", () => {
  it("renders the app title", () => {
    render(<Home />);
    expect(screen.getByText("Dino Division")).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<Home />);
    expect(
      screen.getByText("Long-division practice, Jurassic style."),
    ).toBeInTheDocument();
  });

  it("uses Jurassic-themed heading class", () => {
    render(<Home />);
    const heading = screen.getByText("Dino Division");
    expect(heading.className).toContain("dino-heading");
  });

  it("shows the game-start flow (name entry) initially", () => {
    render(<Home />);
    expect(screen.getByText("Welcome, Explorer!")).toBeInTheDocument();
    expect(screen.getByLabelText("Player Name")).toBeInTheDocument();
  });

  it("transitions to the game view after starting a new game", () => {
    render(<Home />);

    // Enter name
    fireEvent.change(screen.getByLabelText("Player Name"), {
      target: { value: "Rex" },
    });
    fireEvent.click(screen.getByText("Continue"));

    // Start new game
    fireEvent.click(screen.getByText("Start New Game"));

    // Should show ready state
    expect(screen.getByText("Ready to play, Rex!")).toBeInTheDocument();
    expect(
      screen.getByText("Solve problems, earn dinosaurs!"),
    ).toBeInTheDocument();
  });
});
