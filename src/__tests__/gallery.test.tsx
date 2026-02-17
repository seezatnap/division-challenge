import { render, screen } from "@testing-library/react";
import GalleryPage from "@/app/gallery/page";

describe("Gallery page", () => {
  it("renders the gallery title", () => {
    render(<GalleryPage />);
    expect(screen.getByText("Dino Gallery")).toBeInTheDocument();
  });

  it("renders empty-state messaging", () => {
    render(<GalleryPage />);
    expect(
      screen.getByText(
        "Your collection of unlocked dinosaurs will appear here."
      )
    ).toBeInTheDocument();
  });

  it("uses Jurassic-themed heading class", () => {
    render(<GalleryPage />);
    const heading = screen.getByText("Dino Gallery");
    expect(heading.className).toContain("dino-heading");
  });

  it("renders empty-state card with egg emoji", () => {
    render(<GalleryPage />);
    expect(screen.getByText("No Dinosaurs Yet")).toBeInTheDocument();
    expect(screen.getByText("🥚")).toBeInTheDocument();
  });

  it("renders a call-to-action link to start practicing", () => {
    render(<GalleryPage />);
    const cta = screen.getByText("Start Practicing");
    expect(cta).toBeInTheDocument();
    expect(cta.closest("a")).toHaveAttribute("href", "/");
  });

  it("applies themed card styling", () => {
    render(<GalleryPage />);
    const card = screen.getByText("No Dinosaurs Yet").closest("div");
    expect(card?.className).toContain("dino-card");
  });
});
