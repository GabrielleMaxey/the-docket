import { loadFont } from "@remotion/google-fonts/Lato";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const { fontFamily } = loadFont("normal", {
  weights: ["400", "700", "900"],
  subsets: ["latin"],
});

export const { fontFamily: monoFamily } = loadMono("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

// Brand colors taken from the app icon (public/the-docket-favicon.svg)
// and the app's top nav.
export const colors = {
  coral: "#F95E4A",
  orange: "#FB8429",
  teal: "#0F3133",
  cyan: "#2AEDE5",
  yellow: "#FDD219",
  navFrom: "#1A8FD8",
  navTo: "#0B6BAE",
  appBg: "#F4F7FA",
  panel: "#FFFFFF",
  border: "#DCE3EA",
  text: "#1D2B36",
  muted: "#5B6B78",
  blue: "#1F8AD6",
  green: "#21A366",
  grey: "#A9B1B9",
  ink: "#0B1F21",
};

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
