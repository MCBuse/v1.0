import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const workspace = path.resolve(process.cwd(), "../..");
const source = path.join(workspace, "out/week2-video/src");
const output = path.join(workspace, "out/week2-video/renders");

await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

for (const name of [
  "problem",
  "solution",
  "learning",
  "rails",
  "challenge",
  "end",
]) {
  await page.goto(`file://${path.join(source, `${name}.svg`)}`);
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    animations: "disabled",
  });
}

await page.goto("about:blank");

for (const name of [
  "overview",
  "payment-request",
  "transactions",
  "readiness",
]) {
  const imagePath = path.join(
    workspace,
    `out/week2-video/assets/${name}.png`,
  );
  const imageUrl = `data:image/png;base64,${(
    await fs.readFile(imagePath)
  ).toString("base64")}`;

  await page.setContent(`<!doctype html>
    <html>
      <head>
        <style>
          * { box-sizing: border-box; }
          html, body { width: 1920px; height: 1080px; margin: 0; overflow: hidden; }
          body {
            display: grid;
            place-items: center;
            background: #0A0B0D;
            font-family: "IBM Plex Sans", Arial, sans-serif;
          }
          .frame {
            height: 972px;
            border: 1px solid #303641;
            border-top: 6px solid #2E96FF;
            box-shadow: 0 28px 80px rgba(0, 0, 0, .42);
          }
          .frame img { display: block; height: 100%; width: auto; }
          .label {
            position: fixed;
            top: 17px;
            right: 54px;
            color: #A8ADB8;
            font: 600 19px/1 "IBM Plex Mono", monospace;
            letter-spacing: 2px;
          }
          .dot {
            display: inline-block;
            width: 9px;
            height: 9px;
            margin-right: 10px;
            border-radius: 50%;
            background: #2E96FF;
          }
        </style>
      </head>
      <body>
        <div class="label"><span class="dot"></span>SYNTHETIC DEMO DATA</div>
        <div class="frame"><img src="${imageUrl}" /></div>
      </body>
    </html>`);
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete),
  );
  await page.screenshot({ path: path.join(output, `portal-${name}.png`) });
}

const captions = [
  ["01", "A small merchant can be economically active every day"],
  ["02", "and still remain financially under-documented."],
  [
    "03",
    "Their sales may be fragmented, cash-heavy, or difficult<br>to turn into a reliable financial record.",
  ],
  [
    "04",
    "MCBuse turns verified digital payments<br>into a structured merchant activity history.",
  ],
  [
    "05",
    "From that history, we generate business analytics,<br>data-quality signals, and explainable credit readiness.",
  ],
  [
    "06",
    "It shows whether enough reliable evidence exists<br>for financial assessment.",
  ],
  [
    "07",
    "MCBuse does not make lending decisions —<br>we build the evidence that can support them.",
  ],
  ["08", "This week, we deployed our merchant portal and API."],
  [
    "09",
    "Merchants can generate payment requests, track finalized<br>transactions, and view sales activity and trends.",
  ],
  [
    "10",
    "They can monitor data quality and understand<br>what evidence is still missing.",
  ],
  [
    "11",
    "Our biggest learning: the payment itself<br>is only the entry point.",
  ],
  [
    "12",
    "The real product value is the trusted financial history<br>created from repeated merchant activity.",
  ],
  [
    "13",
    "The current demo uses USDC, while the architecture can extend<br>to other stablecoins and currency-denominated rails.",
  ],
  [
    "14",
    "The current challenge: reliable repeated Solana devnet<br>transactions from request to final merchant record.",
  ],
  [
    "15",
    "Next: close the flow, strengthen readiness logic,<br>and test the complete merchant journey.",
  ],
];

for (const [number, caption] of captions) {
  await page.setContent(`<!doctype html>
    <html>
      <head>
        <style>
          * { box-sizing: border-box; }
          html, body { width: 1920px; height: 1080px; margin: 0; overflow: hidden; background: transparent; }
          .caption {
            position: fixed;
            left: 50%;
            bottom: 34px;
            transform: translateX(-50%);
            max-width: 1540px;
            padding: 14px 26px 16px;
            border-radius: 12px;
            background: rgba(5, 6, 8, .86);
            color: #F7F8FA;
            font: 500 34px/1.24 "IBM Plex Sans", Arial, sans-serif;
            text-align: center;
            letter-spacing: -.25px;
          }
        </style>
      </head>
      <body><div class="caption">${caption}</div></body>
    </html>`);
  await page.screenshot({
    path: path.join(output, `caption-${number}.png`),
    omitBackground: true,
  });
}

await browser.close();
