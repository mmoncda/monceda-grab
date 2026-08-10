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
];

function detectPlatform(value: string) {
  const url = value.toLowerCase();
  if (url.includes("facebook.com") || url.includes("fb.watch")) return platforms[0];
  if (url.includes("instagram.com")) return platforms[1];
  if (url.includes("tiktok.com")) return platforms[2];
  if (url.includes("twitter.com") || url.includes("x.com")) return platforms[3];
  if (url.includes("pinterest.com") || url.includes("pin.it")) return platforms[4];
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
  const [hasRights, setHasRights] = useState(false);
  const detected = useMemo(() => detectPlatform(url), [url]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setDownloadUrl("");

    if (!hasRights) {
      setMessage("Kailangan mong kumpirmahin na may karapatan o pahintulot kang i-download ang content.");
      return;
    }

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
          <a href="#legal">Legal</a>
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
          <label className="rights-check">
            <input
              type="checkbox"
              checked={hasRights}
              onChange={(event) => { setHasRights(event.target.checked); setMessage(""); }}
            />
            <span>I own this content, it is public domain, or I have permission to download it. I agree to the <a href="#terms">Terms of Use</a>.</span>
          </label>
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
        <div className="trust-links">
          <a href="https://safeweb.norton.com/" target="_blank" rel="noopener noreferrer" aria-label="View Norton Safe Web">
            <span className="trust-check">✓</span>
            <span><strong>Norton Safe Web rating: Safe</strong><small>Analyzed August 11, 2026</small></span>
          </a>
          <span>MONCEDA LABS · SOFTWARE SOLUTIONS. REAL IMPACT.</span>
        </div>
      </section>

      <section className="legal shell" id="legal" aria-labelledby="legal-title">
        <div className="section-heading legal-heading">
          <span className="kicker">RESPONSIBLE USE</span>
          <h2 id="legal-title">Legal &amp; trust.</h2>
        </div>
        <div className="legal-grid">
          <article id="terms">
            <h3>Terms of Use</h3>
            <p>Monceda Grab is provided only for public media that you own, public-domain media, or media you are authorized to download. You must follow copyright law and each platform&apos;s terms.</p>
            <p>Do not use the service for private, login-protected, paywalled, restricted, or DRM-protected content; unlawful copying; harassment; surveillance; or commercial redistribution without permission. You are responsible for the links you submit and how you use downloaded files.</p>
            <p>The service is provided “as is” and may be limited, changed, or suspended to protect creators, users, platforms, or Monceda Labs.</p>
          </article>
          <article id="privacy">
            <h3>Privacy Policy</h3>
            <p>No account is required. The public URL you submit is sent to our processing provider so it can locate available media. Monceda Grab does not intentionally store downloaded files.</p>
            <p>Our hosting, security, and processing providers may temporarily process technical data such as IP address, request time, submitted URL, browser information, rate-limit data, and error logs for delivery, security, and troubleshooting.</p>
            <p>Do not submit URLs containing personal, confidential, or sensitive information.</p>
          </article>
          <article id="copyright">
            <h3>Copyright &amp; Takedown</h3>
            <p>We respect creators and rights holders. To report misuse or request review, email <a href="mailto:abuse@moncedalabs.com">abuse@moncedalabs.com</a> with your name, contact details, the original work, the relevant URL, and a good-faith explanation of your rights.</p>
            <p>We may investigate, restrict access, preserve necessary records, or cooperate with hosting providers and lawful requests.</p>
          </article>
          <article id="disclaimer">
            <h3>Platform Disclaimer</h3>
            <p>Monceda Grab and Monceda Labs are independent. They are not affiliated with, endorsed by, or sponsored by Facebook, Instagram, TikTok, X, Pinterest, or their owners. All names and trademarks belong to their respective owners.</p>
            <p>Supported services may change without notice when a platform restricts access or when continued support creates legal, safety, or reliability concerns.</p>
          </article>
        </div>
        <footer className="legal-footer">
          <span>© 2026 Monceda Labs</span>
          <nav aria-label="Legal links">
            <a href="#terms">Terms</a>
            <a href="#privacy">Privacy</a>
            <a href="#copyright">Copyright</a>
            <a href="mailto:abuse@moncedalabs.com">Report abuse</a>
          </nav>
        </footer>
      </section>
    </main>
  );
}
