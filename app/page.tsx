"use client";

import { FormEvent, useMemo, useState } from "react";

type Platform = {
  name: string;
  short: string;
  color: string;
};

const platforms: Platform[] = [
  { name: "Facebook", short: "f", color: "#1877f2" },
  { name: "Instagram", short: "◎", color: "#d946ef" },
  { name: "TikTok", short: "♪", color: "#25f4ee" },
  { name: "X / Twitter", short: "X", color: "#f8fafc" },
  { name: "Pinterest", short: "P", color: "#e60023" },
  { name: "YouTube", short: "▶", color: "#ff0033" },
];

function detectPlatform(value: string) {
  const url = value.toLowerCase();
  if (url.includes("facebook.com") || url.includes("fb.watch")) return platforms[0];
  if (url.includes("instagram.com")) return platforms[1];
  if (url.includes("tiktok.com")) return platforms[2];
  if (url.includes("twitter.com") || url.includes("x.com")) return platforms[3];
  if (url.includes("pinterest.com") || url.includes("pin.it")) return platforms[4];
  if (url.includes("youtube.com") || url.includes("youtu.be")) return platforms[5];
  return null;
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.4 13.6a4.4 4.4 0 0 0 6.2 0l2.1-2.1a4.4 4.4 0 0 0-6.2-6.2l-1.2 1.2M13.6 10.4a4.4 4.4 0 0 0-6.2 0l-2.1 2.1a4.4 4.4 0 0 0 6.2 6.2l1.2-1.2" />
    </svg>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const detected = useMemo(() => detectPlatform(url), [url]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setDownloadUrl("");

    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol) || !detected) throw new Error();
    } catch {
      setMessage("Maglagay ng valid public link mula sa supported platform.");
      return;
    }

    setIsChecking(true);
    try {
      const response = await fetch("https://monceda-grab-api.onrender.com/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = await response.json();

      if (!response.ok || result.status === "error") {
        throw new Error(result.error?.code || "Media could not be processed");
      }

      const mediaUrl = result.url || result.picker?.[0]?.url;
      if (!mediaUrl) {
        throw new Error("No downloadable media was returned");
      }

      setDownloadUrl(mediaUrl);
      setMessage(`${detected?.name} media is ready.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Hindi ma-process ang link: ${error.message}`
          : "Hindi ma-process ang link ngayon. Subukan ulit.",
      );
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <main>
      <nav className="nav shell" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Monceda Grab home">
          <span className="brand-mark"><span>M</span></span>
          <span>MONCEDA <b>GRAB</b></span>
        </a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#platforms">Platforms</a>
          <a href="#safety">Safety</a>
        </div>
        <span className="beta">BETA</span>
      </nav>

      <section className="hero shell" id="top">
        <div className="eyebrow"><span /> PUBLIC MEDIA DOWNLOADER</div>
        <h1>Save what matters.<br /><em>Simple. Fast. Yours.</em></h1>
        <p className="hero-copy">
          Paste a public social media link and save the available video or image—cleanly, quickly, and without the clutter.
        </p>

        <form className="grab-form" onSubmit={handleSubmit}>
          <div className="url-box">
            <span className="link-icon"><LinkIcon /></span>
            <input
              value={url}
              onChange={(event) => { setUrl(event.target.value); setMessage(""); }}
              placeholder="Paste a public video or image link here..."
              aria-label="Public social media link"
              inputMode="url"
            />
            {detected && <span className="detected" style={{ color: detected.color }}>{detected.short} {detected.name}</span>}
            <button type="submit" disabled={isChecking}>
              {isChecking ? "Checking..." : "Grab Media"}<span>→</span>
            </button>
          </div>
          <div className="form-meta">
            <span>Works with public links only</span>
            <span>•</span>
            <span>No sign-in required</span>
            <span>•</span>
            <span>Files aren&apos;t stored</span>
          </div>
          {message && (
            <div className={downloadUrl ? "status success" : "status"} role="status">
              {message}
              {downloadUrl && (
                <> <a href={downloadUrl} target="_blank" rel="noopener noreferrer">Download media</a></>
              )}
            </div>
          )}
        </form>

        <div className="platform-row" id="platforms" aria-label="Supported platforms">
          {platforms.map((platform) => (
            <div className="platform" key={platform.name}>
              <span style={{ color: platform.color }}>{platform.short}</span>{platform.name}
            </div>
          ))}
        </div>
      </section>

      <section className="steps shell" id="how">
        <div className="section-heading">
          <span className="kicker">THREE EASY STEPS</span>
          <h2>From link to file<br />in moments.</h2>
        </div>
        <div className="step-grid">
          <article>
            <span className="number">01</span>
            <div className="step-icon">↗</div>
            <h3>Copy the link</h3>
            <p>Open the public post you own or have permission to save, then copy its share link.</p>
          </article>
          <article>
            <span className="number">02</span>
            <div className="step-icon">⌁</div>
            <h3>Paste &amp; preview</h3>
            <p>Drop the link above. Monceda Grab detects the platform and available media.</p>
          </article>
          <article>
            <span className="number">03</span>
            <div className="step-icon">↓</div>
            <h3>Choose &amp; save</h3>
            <p>Select an available quality or format, then download directly to your device.</p>
          </article>
        </div>
      </section>

      <section className="safety shell" id="safety">
        <div>
          <span className="shield">✓</span>
          <p><strong>Respect creators.</strong> Download only content you own, content in the public domain, or content you have permission to use.</p>
        </div>
        <span>MONCEDA LABS · SOFTWARE SOLUTIONS. REAL IMPACT.</span>
      </section>
    </main>
  );
}
