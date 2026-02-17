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
});
