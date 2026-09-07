/* eslint-disable turbo/no-undeclared-env-vars */
/* global document, process, requestAnimationFrame, window */

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const portalUrl = process.env.PORTAL_RECORDING_URL ?? "http://127.0.0.1:3002";
const email = process.env.PORTAL_DEMO_EMAIL;
const password = process.env.PORTAL_DEMO_PASSWORD;
const outputDirectory = path.resolve(
  process.env.PORTAL_RECORDING_OUTPUT ?? "out/merchant-portal-walkthrough",
);

if (!email || !password) {
  throw new Error("PORTAL_DEMO_EMAIL and PORTAL_DEMO_PASSWORD are required");
}

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: "light",
  recordVideo: {
    dir: outputDirectory,
    size: { width: 1600, height: 900 },
  },
});

await context.addInitScript(() => {
  const install = () => {
    if (document.querySelector("[data-recording-layer]")) return;

    const style = document.createElement("style");
    style.textContent = `
      [data-recording-layer] { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
      [data-recording-caption] {
        position: absolute; left: 50%; bottom: 34px; transform: translate(-50%, 12px);
        padding: 12px 20px; border-radius: 999px; color: white;
        background: rgba(15, 23, 42, .9); box-shadow: 0 12px 32px rgba(15, 23, 42, .18);
        font: 600 18px/1.25 "IBM Plex Sans", system-ui, sans-serif;
        letter-spacing: -.01em; opacity: 0; transition: opacity .24s ease, transform .24s ease;
      }
      [data-recording-caption].is-visible { opacity: 1; transform: translate(-50%, 0); }
      [data-recording-cursor] {
        position: absolute; left: -40px; top: -40px; width: 19px; height: 25px;
        filter: drop-shadow(0 2px 3px rgba(15, 23, 42, .3));
        transition: left .08s linear, top .08s linear;
      }
      [data-recording-ripple] {
        position: absolute; width: 36px; height: 36px; margin: -18px;
        border: 2px solid #2563eb; border-radius: 999px;
        animation: recording-ripple .45s ease-out forwards;
      }
      @keyframes recording-ripple { from { opacity: .8; transform: scale(.3); } to { opacity: 0; transform: scale(1.35); } }
      [data-recording-end] {
        position: absolute; inset: 0; display: grid; place-items: center; color: white;
        background: radial-gradient(circle at 52% 42%, #1d4ed8 0, #172554 54%, #0f172a 100%);
        opacity: 0; transition: opacity .45s ease;
      }
      [data-recording-end].is-visible { opacity: 1; }
    `;
    document.head.appendChild(style);

    const layer = document.createElement("div");
    layer.dataset.recordingLayer = "";
    const caption = document.createElement("div");
    caption.dataset.recordingCaption = "";
    const cursor = document.createElement("div");
    cursor.dataset.recordingCursor = "";
    cursor.innerHTML = `<svg viewBox="0 0 19 25" width="19" height="25" aria-hidden="true"><path d="M1 1.5v19.2l5.3-4.8 3.2 7.5 3.5-1.5-3.1-7.2h7.4L1 1.5Z" fill="#fff" stroke="#0f172a" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    layer.append(caption, cursor);
    document.body.appendChild(layer);

    document.addEventListener("mousemove", (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    });
    document.addEventListener("mousedown", (event) => {
      const ripple = document.createElement("div");
      ripple.dataset.recordingRipple = "";
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      layer.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 500);
    });

    window.__setRecordingCaption = (text) => {
      caption.textContent = text;
      caption.classList.toggle("is-visible", Boolean(text));
    };
    window.__showRecordingEnd = () => {
      const end = document.createElement("div");
      end.dataset.recordingEnd = "";
      end.innerHTML = `<div style="text-align:center"><div style="display:inline-grid;place-items:center;width:64px;height:64px;border-radius:18px;background:white;color:#2563eb;font:700 34px/1 system-ui">M</div><h1 style="margin:24px 0 10px;font:600 58px/1.05 'IBM Plex Sans',system-ui">MCBuse Merchant Portal</h1><p style="margin:0;color:rgba(255,255,255,.72);font:400 28px/1.4 'IBM Plex Sans',system-ui">Receive. Track. Build proof.</p></div>`;
      layer.appendChild(end);
      requestAnimationFrame(() => end.classList.add("is-visible"));
    };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
});

const page = await context.newPage();
const video = page.video();
const startedAt = Date.now();
const captions = [];
let activeCaption = null;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const elapsed = () => (Date.now() - startedAt) / 1000;

async function setCaption(text) {
  if (activeCaption) activeCaption.end = elapsed();
  activeCaption = { start: elapsed(), end: null, text };
  captions.push(activeCaption);
  await page.evaluate((value) => window.__setRecordingCaption?.(value), text);
}

async function pointTo(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Recording target is not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 18,
  });
  await sleep(450);
}

async function click(locator) {
  await pointTo(locator);
  await page.mouse.down();
  await sleep(110);
  await page.mouse.up();
}

async function fill(locator, value, delay = 55) {
  await pointTo(locator);
  await locator.click();
  await locator.pressSequentially(value, { delay });
}

function srtTime(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

let walkthroughError;
try {
  await page.goto(`${portalUrl}/sign-in`, { waitUntil: "networkidle" });
  await setCaption("Sign in to the merchant portal");
  await sleep(2_000);
  await fill(page.getByLabel("Email address"), email, 45);
  await fill(page.getByLabel("Password"), password, 35);
  await sleep(700);
  await click(page.getByRole("button", { name: "Sign in" }));
  await page.waitForURL("**/overview", { timeout: 20_000 });
  await page.getByRole("heading", { name: "Your money, at a glance" }).waitFor();

  await setCaption("Finalized sales, shown in euros");
  await sleep(4_500);
  await page.getByRole("heading", { name: "Daily trend" }).scrollIntoViewIfNeeded();
  await sleep(4_500);
  await page.getByRole("heading", { name: "Recent transactions" }).scrollIntoViewIfNeeded();
  await setCaption("Only merchant-facing payment records");
  await sleep(4_500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(1_800);

  await setCaption("Create a euro payment request");
  await fill(page.getByLabel("Amount"), "125.00", 120);
  await fill(page.getByLabel(/Description/), "Weekend counter sale", 55);
  await sleep(900);
  await click(page.getByRole("button", { name: "Create payment request" }));
  await page.getByLabel("Payment request QR code").waitFor({ timeout: 15_000 });
  await setCaption("A QR customers can scan");
  await sleep(7_000);

  await click(page.getByRole("link", { name: "Transactions", exact: true }));
  await page.getByRole("heading", { name: "Payment receipts" }).waitFor();
  await setCaption("Receipts without customer personal data");
  await sleep(6_000);

  await click(page.getByRole("link", { name: "Business profile", exact: true }));
  await page.getByRole("heading", { name: "MCBuse Demo Merchant" }).waitFor();
  await setCaption("Readiness built from real records");
  await sleep(5_000);
  await page.getByRole("heading", { name: "Measured inputs" }).scrollIntoViewIfNeeded();
  await sleep(4_500);

  await click(page.getByRole("link", { name: "Overview", exact: true }));
  await page.getByRole("heading", { name: "Your money, at a glance" }).waitFor();
  await setCaption("Money in. Evidence ready.");
  await sleep(3_500);
  await page.evaluate(() => window.__showRecordingEnd?.());
  await sleep(4_500);
  await page.screenshot({
    path: path.join(outputDirectory, "merchant-portal-thumbnail.png"),
  });
} catch (error) {
  walkthroughError = error;
} finally {
  if (activeCaption) activeCaption.end = elapsed();
  await context.close();
}

if (walkthroughError) {
  await browser.close();
  throw walkthroughError;
}
if (!video) {
  await browser.close();
  throw new Error("Playwright did not create a video");
}
await video.saveAs(path.join(outputDirectory, "merchant-portal-walkthrough.webm"));
await browser.close();

const captionText = captions
  .filter((caption) => caption.end && caption.end > caption.start)
  .map(
    (caption, index) =>
      `${index + 1}\n${srtTime(caption.start)} --> ${srtTime(caption.end)}\n${caption.text}\n`,
  )
  .join("\n");
await writeFile(
  path.join(outputDirectory, "merchant-portal-walkthrough.srt"),
  captionText,
  "utf8",
);

process.stdout.write(`${outputDirectory}\n`);
