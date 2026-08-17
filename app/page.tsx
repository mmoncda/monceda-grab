"use client";

import { FormEvent, useMemo, useState } from "react";
import { AdSlot } from "./ad-slot";
import Link from "next/link";

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
  { name: "Reddit", short: "r", color: "#ff4500" },
  { name: "Bluesky", short: "B", color: "#60a5fa" },
  { name: "Tumblr", short: "t", color: "#94a3b8" },
  { name: "Vimeo", short: "V", color: "#38bdf8" },
  { name: "Twitch Clips", short: "T", color: "#a78bfa" },
  { name: "Snapchat", short: "S", color: "#fde047" },
  { name: "Dailymotion", short: "D", color: "#60a5fa" },
  { name: "Streamable", short: "S", color: "#3b82f6" },
  { name: "Loom", short: "L", color: "#a78bfa" },
  { name: "Bilibili", short: "b", color: "#fb7185" },
  { name: "Newgrounds", short: "N", color: "#f59e0b" },
  { name: "VK", short: "VK", color: "#60a5fa" },
  { name: "OK.ru", short: "OK", color: "#fb923c" },
  { name: "Rutube", short: "R", color: "#a78bfa" },
  { name: "SoundCloud", short: "SC", color: "#fb923c" },
];

function detectPlatform(value: string) {
  const url = value.toLowerCase();

  if (url.includes("facebook.com") || url.includes("fb.watch")) return platforms[0];
  if (url.includes("instagram.com")) return platforms[1];
  if (url.includes("tiktok.com")) return platforms[2];
  if (url.includes("twitter.com") || url.includes("x.com")) return platforms[3];
  if (url.includes("pinterest.com") || url.includes("pin.it")) return platforms[4];
  if (url.includes("reddit.com") || url.includes("redd.it")) return platforms[5];
  if (url.includes("bsky.app")) return platforms[6];
  if (url.includes("tumblr.com")) return platforms[7];
  if (url.includes("vimeo.com")) return platforms[8];
  if (url.includes("clips.twitch.tv") || url.includes("twitch.tv")) return platforms[9];
  if (url.includes("snapchat.com")) return platforms[10];
  if (url.includes("dailymotion.com") || url.includes("dai.ly")) return platforms[11];
  if (url.includes("streamable.com")) return platforms[12];
  if (url.includes("loom.com")) return platforms[13];
  if (url.includes("bilibili.com") || url.includes("b23.tv")) return platforms[14];
  if (url.includes("newgrounds.com")) return platforms[15];
  if (url.includes("vk.com") || url.includes("vkvideo.ru")) return platforms[16];
  if (url.includes("ok.ru")) return platforms[17];
  if (url.includes("rutube.ru")) return platforms[18];
  if (url.includes("soundcloud.com")) return platforms[19];

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
      setMessage("Please confirm that you have the right or permission to download this content.");
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
      const response = await fetch("/api/grab", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = await response.json();

      if (!response.ok || result.status === "error") {
        const code = result.error?.code;
        const apiMessage =
          typeof result.error?.message === "string"
            ? result.error.message.trim()
            : "";

        const friendlyMessage =
          apiMessage ||
          (
            code === "error.api.fetch.fail"
              ? "The media processor could not retrieve this post. Make sure the link is public and still available, then try again."
              : code === "error.api.fetch.empty"
                ? "No downloadable video or image was found at this link."
                : code === "error.api.link.invalid"
                  ? "This link is invalid or unsupported."
                  : "This media could not be processed right now. Please try again later."
          );

        throw new Error(friendlyMessage);
      }

      const mediaUrl = result.url || result.picker?.[0]?.url;
      const returnedFilename =
        String(result.filename || "").toLowerCase();

      const returnedMediaUrl =
        String(mediaUrl || "")
          .split("?")[0]
          .toLowerCase();

      if (!mediaUrl) {
        throw new Error("No downloadable media was returned");
      }

      const isInstagramReel =
        detected?.name === "Instagram" &&
        /instagram\.com\/reel\//i.test(url);

      const returnedImageForReel =
        isInstagramReel &&
        (
          /\.(jpe?g|png|webp|gif|avif)$/i.test(
            returnedFilename,
          ) ||
          /\.(jpe?g|png|webp|gif|avif)$/i.test(
            returnedMediaUrl,
          )
        );

      if (returnedImageForReel) {
        throw new Error(
          "Instagram returned only a preview image for this Reel. The video source is temporarily unavailable. Please try another Reel or try again later."
        );
      }

      setDownloadUrl(mediaUrl);
      setMessage(`${detected?.name} media is ready.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This link could not be processed right now. Please try again.",
      );
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <main>
      <nav className="nav shell" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Monceda Grab home">
          <span className="brand-mark" aria-hidden="true">
            <span className="logo-wing logo-wing-left" />
            <span className="logo-wing logo-wing-right" />
            <span className="logo-center" />
          </span>
          <span className="brand-name"><span>MONCEDA</span><b>GRAB</b></span>
        </a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <Link href="/guides">Guides</Link>
          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
        <span className="beta">BETA</span>
      </nav>

      <section className="hero shell" id="top">
        <div className="eyebrow"><span /> PUBLIC MEDIA DOWNLOADER</div>
        <h1>Save what matters.<br /><em>Simple. Fast. Yours.</em></h1>
        <p className="hero-copy">
          Paste a public social media link and save the available video or image—cleanly, quickly, and without the clutter.
        </p>

        <div className="no-popup-note"><span>✓</span> No pop-ups · No forced ad tabs · No misleading download buttons</div>

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
            <span>I own this content, it is public domain, or I have explicit permission or another lawful right to download it. I agree to the <a href="#terms">Terms of Use</a>.</span>
          </label>
          {message && (
            <div className={downloadUrl ? "status success" : "status"} role="status">
              {message}
              {downloadUrl && (
                <> <a className="download-link" href={downloadUrl} download rel="nofollow">Download media ↓</a></>
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

      <section className="ad-section shell" aria-label="Sponsored content">
        <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOP} placement="after-tool" />
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

      <section className="about shell" id="about">
        <div className="section-heading">
          <span className="kicker">BUILT FOR RESPONSIBLE SAVING</span>
          <h2>A cleaner kind of<br />media tool.</h2>
        </div>
        <div className="about-grid">
          <p>Monceda Grab is an independent utility from Monceda Labs for saving publicly available media when the user owns it, has permission, or otherwise has a lawful right to download it.</p>
          <p>We keep the experience straightforward: no account wall, no fake buttons, and no advertising page launched when you press download. Ads, when enabled, stay in clearly labeled spaces on this page.</p>
          <p>Because social platforms change frequently, availability can vary. We do not bypass private accounts, paywalls, access controls, or digital rights management.</p>
        </div>
      </section>

      <section className="guide-preview shell">
        <div className="section-heading"><span className="kicker">ORIGINAL LEARNING LIBRARY</span><h2>Download less blindly.<br />Save more responsibly.</h2></div>
        <div className="guide-preview-grid"><Link href="/guides/how-to-save-your-own-public-media"><span>PERMISSION</span><strong>How to save your own public posts</strong><small>5 MIN READ →</small></Link><Link href="/guides/public-links-private-content-and-permission"><span>RIGHTS</span><strong>Public access is not public ownership</strong><small>6 MIN READ →</small></Link><Link href="/guides/protect-privacy-when-using-link-tools"><span>PRIVACY</span><strong>Inspect a link before you paste it</strong><small>5 MIN READ →</small></Link></div>
        <Link className="all-guides" href="/guides">VIEW ALL RESPONSIBLE MEDIA GUIDES →</Link>
      </section>

      <section className="ad-section shell" aria-label="Sponsored content">
        <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_CONTENT} placement="before-legal" />
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
            <p>Monceda Grab is provided only for public media that you own, public-domain media, or media you have explicit permission or another lawful right to download. You must follow copyright law and each platform&apos;s terms.</p>
            <p>Technical availability does not grant permission. Use a download only when the platform itself permits it, the rights holder authorizes it, or applicable law allows it.</p>
            <p>Do not use the service for private, login-protected, paywalled, restricted, or DRM-protected content; unlawful copying; harassment; surveillance; or commercial redistribution without permission. You are responsible for the links you submit and how you use downloaded files.</p>
            <p>The service is provided “as is” and may be limited, changed, or suspended to protect creators, users, platforms, or Monceda Labs.</p>
          </article>
          <article id="privacy">
            <h3>Privacy Policy</h3>
            <p>No account is required. The public URL you submit is sent to our processing provider so it can locate available media. Monceda Grab does not intentionally store downloaded files.</p>
            <p>Our hosting, security, and processing providers may temporarily process technical data such as IP address, request time, submitted URL, browser information, rate-limit data, and error logs for delivery, security, and troubleshooting.</p>
            <p>If advertising is enabled, advertising partners may use cookies or similar technologies to measure ads, prevent fraud, and personalize or limit advertising as allowed by your location and choices. We will identify advertising clearly and update this policy when a specific provider is activated.</p>
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
            <p>Support for a platform means only that a public link may be technically processed. It is not a statement that the platform approves downloading or that a user has rights to the content.</p>
            <p>Supported services may change without notice when a platform restricts access or when continued support creates legal, safety, or reliability concerns.</p>
          </article>
        </div>
        <footer className="legal-footer">
          <span>© 2026 Monceda Labs</span>
          <nav aria-label="Legal links">
            <a href="#about">About</a>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/copyright">Copyright</Link>
            <a href="mailto:hello@moncedalabs.com">Contact</a>
            <a href="mailto:abuse@moncedalabs.com">Report abuse</a>
          </nav>
        </footer>
      </section>
    </main>
  );
}
