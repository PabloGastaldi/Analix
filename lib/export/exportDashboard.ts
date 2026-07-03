"use client";

import { domToPng } from "modern-screenshot";
import { jsPDF } from "jspdf";
import { exportFilename } from "./filename";

/** Lavender page background (--background) so transparent gaps aren't black. */
const BACKGROUND = "#f6f5fc";

/**
 * Render the node to a high-resolution PNG data URL. `modern-screenshot`
 * handles Recharts SVGs + web fonts far more reliably than html-to-image
 * (which hangs on this SVG-heavy dashboard).
 */
async function renderPng(node: HTMLElement): Promise<string> {
  return domToPng(node, {
    scale: 2,
    backgroundColor: BACKGROUND,
  });
}

function triggerDownload(href: string, filename: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo procesar la imagen del dashboard."));
    img.src = dataUrl;
  });
}

export async function exportDashboardToPng(node: HTMLElement): Promise<void> {
  const dataUrl = await renderPng(node);
  triggerDownload(dataUrl, exportFilename("png"));
}

export async function exportDashboardToPdf(node: HTMLElement): Promise<void> {
  const dataUrl = await renderPng(node);
  const img = await loadImage(dataUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  // Page sized to the captured image (px units) → a 1:1, faithful PDF.
  const pdf = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
  pdf.save(exportFilename("pdf"));
}
