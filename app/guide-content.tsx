import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "./site-chrome";

export type Guide = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  readTime: string;
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
};

export const guides: Guide[] = [
  {
    slug: "how-to-save-your-own-public-media",
    eyebrow: "RESPONSIBLE DOWNLOADING",
    title: "How to save your own public social media posts",
    description: "A practical checklist for preserving content you created without confusing public access with permission.",
    readTime: "5 MIN READ",
    sections: [
      { heading: "Start with ownership or permission", paragraphs: ["A post being visible to the public does not automatically make it free to reuse. The clearest case is content you recorded, designed, photographed, or published yourself. You may also save work when the rights holder has given you explicit permission or when the material is clearly in the public domain.", "Before copying another person's post, identify who created it and what permission covers your intended use. Permission to view or share a platform link is not always permission to download, edit, repost, or use the file commercially."] },
      { heading: "Use the platform's own option first", paragraphs: ["When a platform provides a native download, export, archive, or data-access feature, use that option first. Native tools are usually the most reliable way to preserve captions, timestamps, accessibility information, and the highest-quality source that the platform makes available."], bullets: ["Check the post menu for Download or Save.", "Use account data export for a complete personal archive.", "Keep the original project file when you created the media."] },
      { heading: "Keep context with the file", paragraphs: ["A video or image without context can be difficult to identify later. Save a note containing the original post URL, creator name, publication date, and the permission you relied on. For client or team work, keep the written approval alongside the downloaded asset.", "Do not remove watermarks, crop out attribution, or imply that someone else's work is yours. If the creator requests removal, review your permission and respond promptly."] },
      { heading: "Confirm the copy before relying on it", paragraphs: ["Open the saved file and check the complete duration, audio, orientation, captions, and visual quality. A successful download does not guarantee that every stream or piece of context was preserved. Compare it with the source while the post is still available, and repeat the export using the platform's native archive when something important is missing.", "For valuable work, record a checksum or at least the file size and creation date. These details make it easier to notice a damaged or accidentally replaced archive later."] },
      { heading: "Plan for storage and future use", paragraphs: ["Use descriptive filenames instead of leaving a collection of identical download names. A practical pattern combines the date, project, creator, and a short subject. Organize the files by project or year and keep a small text record explaining where each item came from.", "One device is not a backup. Keep a second copy on separate storage and periodically test a sample. If permission is limited to a particular project or period, add that limitation to your notes so a future collaborator does not assume broader reuse rights."] },
    ],
  },
  {
    slug: "public-links-private-content-and-permission",
    eyebrow: "KNOW THE DIFFERENCE",
    title: "Public links, private content, and lawful permission",
    description: "Understand what a public URL means—and what it does not mean—before downloading media.",
    readTime: "6 MIN READ",
    sections: [
      { heading: "Public access is not public ownership", paragraphs: ["A public link means a visitor can open a page without joining a private audience. Copyright and other rights can still apply to everything on that page. The creator generally keeps ownership unless rights were transferred, waived, or the work entered the public domain.", "Treat technical availability and legal permission as separate questions. A tool may be able to locate a media file, but that ability does not grant a license to copy or redistribute it."] },
      { heading: "Content Monceda Grab should not process", paragraphs: ["Do not submit links from private accounts, paid memberships, confidential workspaces, direct messages, or pages protected by passwords or access controls. Do not try to bypass encryption, digital rights management, geographic restrictions, or a platform's security measures."], bullets: ["Private or friends-only posts", "Paywalled or subscription-only media", "Confidential, personal, or sensitive URLs", "Content obtained through deception or unauthorized access"] },
      { heading: "When permission is clear", paragraphs: ["Permission is strongest when it is specific and recorded. A short written message should identify the work, who may use it, the permitted purpose, where it may appear, and whether editing or commercial use is allowed.", "Licenses such as Creative Commons can also provide permission, but each license has conditions. Check attribution, adaptation, noncommercial, and share-alike requirements before downloading or republishing."] },
      { heading: "Read the source platform's rules", paragraphs: ["Copyright permission and platform permission are related but separate. A creator may own a video while a platform's terms still limit automated access or downloading. Use a native download or account-export feature when one exists, and do not attempt to defeat technical restrictions when it does not.", "Rules can change by platform, account type, location, or content format. Check the current source terms when the use is important, commercial, or repeated at scale rather than relying on an old screenshot or third-party summary."] },
      { heading: "Document a responsible decision", paragraphs: ["Before saving someone else's work, write down the source URL, creator, date, license or permission, and intended use. This small record makes later attribution easier and gives a team a factual basis for deciding whether the file can be edited, published, or shared.", "If ownership is unclear, pause. Ask the creator, use a licensed alternative, or keep only the original link. Technical convenience is not worth creating an infringement or privacy problem."] },
    ],
  },
  {
    slug: "choose-video-quality-and-file-format",
    eyebrow: "MEDIA BASICS",
    title: "Choosing video quality and file format without wasting space",
    description: "A plain-language guide to resolution, compression, compatibility, and sensible archiving.",
    readTime: "5 MIN READ",
    sections: [
      { heading: "Resolution is only one part of quality", paragraphs: ["Terms such as 720p, 1080p, and 4K describe pixel dimensions, not the complete viewing experience. Bitrate, compression, frame rate, and the quality of the original upload also affect the result. Downloading a larger version cannot restore detail that the source never contained.", "For everyday phone viewing, a well-compressed 720p or 1080p file is often enough. Choose the largest available version only when you need editing headroom, large-screen playback, or long-term preservation."] },
      { heading: "Favor broad compatibility", paragraphs: ["MP4 video using common codecs is typically easier to play across phones, computers, televisions, and editing apps. Images in JPEG are compact for photographs, while PNG is useful for graphics requiring sharp edges or transparency. Newer formats can be smaller but may not open everywhere."], bullets: ["Preview the downloaded file before deleting your source.", "Keep one high-quality master and create smaller sharing copies.", "Use clear filenames with a date and short description."] },
      { heading: "Archive intentionally", paragraphs: ["For important personal or client work, keep at least two copies in different places. A local drive plus reputable cloud storage is a simple starting point. Periodically open a sample of archived files to confirm that the storage and formats remain readable."] },
      { heading: "Match quality to the real purpose", paragraphs: ["A social post meant for reference on a phone rarely needs the largest available file. Editing, projection, detailed cropping, and preservation benefit more from a high-resolution master. Decide the purpose first, then choose the smallest version that comfortably supports it.", "Watch the actual motion and listen to the audio instead of judging quality from the resolution label alone. Heavy compression can create blocking, smeared movement, banding, or metallic audio even when a file is marked 1080p."] },
      { heading: "Use a simple preservation workflow", paragraphs: ["Keep the untouched download as a master and perform edits on a duplicate. Record the source URL, download date, creator, permission, format, and any conversion you perform. Avoid repeatedly exporting an already compressed video because each generation can remove detail.", "For a long-lived collection, prefer open or widely supported formats, maintain two independent copies, and verify files after moving them. Storage capacity matters, but a smaller collection with clear provenance and tested backups is more useful than a large folder nobody can understand."] },
    ],
  },
  {
    slug: "protect-privacy-when-using-link-tools",
    eyebrow: "PRIVACY CHECKLIST",
    title: "Protecting your privacy when using link-based media tools",
    description: "Learn what information a pasted URL can reveal and how to avoid submitting sensitive links.",
    readTime: "5 MIN READ",
    sections: [
      { heading: "Inspect a link before pasting it", paragraphs: ["URLs can contain more than a page address. Some include tracking parameters, account identifiers, access tokens, referral codes, or private sharing keys. Remove unnecessary parameters when the public page still works without them, and never submit a link that grants access to confidential material.", "Use only links that open as public pages in a signed-out browser. If access depends on your account session, membership, password, or invitation, do not send the URL to a third-party processing service."] },
      { heading: "Avoid sensitive material", paragraphs: ["Do not use link tools for medical documents, financial records, private family media, workplace files, legal materials, or content showing information that could put someone at risk. Even services that do not intentionally store downloads still rely on networks, hosting, logging, and processing systems."], bullets: ["Remove tracking parameters when practical.", "Never paste passwords, session tokens, or private share links.", "Review the service's privacy policy and contact details.", "Delete local downloads you no longer need."] },
      { heading: "Choose transparent services", paragraphs: ["A responsible tool explains what it processes, avoids fake buttons, does not trigger surprise downloads, and provides a way to report abuse. Stop using a site if it requests unrelated permissions, installs software unexpectedly, or opens repeated advertising pages."] },
      { heading: "Understand temporary processing", paragraphs: ["A service can avoid permanently storing a downloaded file while its infrastructure still processes the submitted URL, IP address, browser details, timing information, and errors. Hosting, security, analytics, advertising, and media-processing providers may each receive limited technical data needed for their role.", "Read the privacy policy for specific categories, purposes, providers, retention language, and contact details. Avoid a service whose claims are absolute but whose explanation is vague, especially when the URL itself contains a private key or account identifier."] },
      { heading: "Clean up after the download", paragraphs: ["Store the file only where intended, remove temporary copies, and do not leave sensitive media in a shared downloads folder. On a managed or public device, sign out of source accounts and clear any copied private link from the clipboard after use.", "Review the final file before sharing it. Images and videos can expose faces, voices, locations, screens, documents, vehicle plates, or metadata that was easy to overlook in the original feed. Having permission to save a copy does not automatically give permission to publish every detail it contains."] },
    ],
  },
];

export function guideMetadata(guide: Guide): Metadata {
  const canonical = `/guides/${guide.slug}`;

  return {
    title: `${guide.title} — Monceda Grab`,
    description: guide.description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: guide.title,
      description: guide.description,
      url: canonical,
      siteName: "Monceda Grab",
      images: [{ url: "/og.png", width: 1536, height: 1024, alt: guide.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
      images: ["/og.png"],
    },
  };
}

export function GuidePage({ guide }: { guide: Guide }) {
  return <main><SiteHeader /><article className="article-page shell"><Link className="back-link" href="/guides">← ALL GUIDES</Link><span className="kicker">{guide.eyebrow}</span><h1>{guide.title}</h1><p className="article-lede">{guide.description}</p><div className="article-meta"><span>MONCEDA LABS EDITORIAL</span><span>{guide.readTime}</span><span>UPDATED AUGUST 2026</span></div>{guide.sections.map(section => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map(p => <p key={p}>{p}</p>)}{section.bullets ? <ul>{section.bullets.map(item => <li key={item}>{item}</li>)}</ul> : null}</section>)}<aside className="article-note"><strong>Remember</strong><p>Only download media you own, that is in the public domain, or that you have permission or another lawful right to save.</p><Link href="/">Use Monceda Grab responsibly →</Link></aside></article><SiteFooter /></main>;
}
