import type { Block, Design, Section } from "./api";
import { uid } from "./uid";

export const TEMPLATE_CATEGORIES = [
  { id: "welcome", label: "Welcome & Onboarding" },
  { id: "launch", label: "Product Launch" },
  { id: "promotion", label: "Promotion & Sale" },
  { id: "event", label: "Event Invitation" },
  { id: "newsletter", label: "Newsletter & Updates" },
  { id: "general", label: "General" },
] as const;

export function categoryLabel(id: string | undefined): string {
  return TEMPLATE_CATEGORIES.find((category) => category.id === id)?.label ?? "General";
}

type StarterSpec = {
  category: string;
  name: string;
  blurb: string;
  color: string;
  banner: string;
  heading: string;
  intro: string;
  bullets?: string[];
  cta: string;
  footer: string;
  heroImage?: boolean;
};

const SPECS: StarterSpec[] = [
  // Welcome & Onboarding
  { category: "welcome", name: "Welcome Aboard", blurb: "Warm first hello with a clear next step", color: "0f766e", banner: "Welcome", heading: "Welcome aboard, {{first_name | there}}!", intro: "We are delighted to have you with us. This short note covers what happens next and how to get the most from day one.", bullets: ["Your account is ready to use", "Our team replies within one business day", "Guides and support are linked below"], cta: "Get started", footer: "Questions? Just reply to this email — we read every message." },
  { category: "welcome", name: "Getting Started Guide", blurb: "Three simple steps to begin", color: "2563eb", banner: "Getting Started", heading: "Let's get you set up, {{first_name | there}}", intro: "Most customers are up and running in under ten minutes. Follow these three steps:", bullets: ["Step 1 — Complete your profile", "Step 2 — Add your first project or list", "Step 3 — Invite your team"], cta: "Start step 1", footer: "Stuck anywhere? Reply and we will walk you through it." },
  { category: "welcome", name: "Account Activated", blurb: "Confirmation that everything is ready", color: "16a34a", banner: "You're In", heading: "Your account is active", intro: "Hi {{first_name | there}}, your account has been activated successfully. You now have full access to all features in your plan.", bullets: ["Secure login enabled", "Billing and invoices in one place", "Priority support included"], cta: "Open your account", footer: "If you did not request this, please contact support immediately." },
  { category: "welcome", name: "Meet Your Team", blurb: "Personal introduction that builds trust", color: "7c3aed", banner: "Hello From Us", heading: "Meet the people behind the product", intro: "We are a small team that answers its own emails. When you write to us, one of these humans replies — not a bot.", bullets: ["Dedicated account manager", "Real humans on support", "Office hours: Mon–Sat, 9 AM–7 PM IST"], cta: "Say hello", footer: "We look forward to working with you." },
  { category: "welcome", name: "First Steps Checklist", blurb: "Checklist-style onboarding email", color: "0891b2", banner: "First Steps", heading: "Your first-week checklist", intro: "Hi {{first_name | there}}, here is a simple checklist our happiest customers complete in week one:", bullets: ["Confirm your details", "Explore the dashboard tour", "Book a free 15-minute onboarding call"], cta: "Book my call", footer: "Tick these off and you will be ahead of 90% of new users." },

  // Product Launch & Announcement
  { category: "launch", name: "New Product Launch", blurb: "Hero image, highlights and strong CTA", color: "1e3a5f", banner: "New Launch", heading: "Introducing our newest launch", intro: "We have been building this for months, guided by your feedback. It is faster, simpler, and ready today.", bullets: ["Built from real customer requests", "Available on all plans", "Free migration from the old version"], cta: "See what's new", footer: "— Team Cachedigitech", heroImage: true },
  { category: "launch", name: "Feature Announcement", blurb: "One feature, explained crisply", color: "0ea5e9", banner: "New Feature", heading: "New: the feature you asked for", intro: "You asked, we built it. Starting today you can save hours every week with our latest feature.", bullets: ["Live in your account right now", "Two-minute setup, no training needed", "Works on mobile and desktop"], cta: "Try it now", footer: "Tell us what you think — reply to this email." },
  { category: "launch", name: "Service Launch Invite", blurb: "Announce a service with an invitation tone", color: "b45309", banner: "Now Offering", heading: "We now offer managed services", intro: "Hi {{first_name | there}}, many of you asked us to handle this end-to-end. That service is now open for a first group of customers.", bullets: ["Done-for-you by our specialists", "Transparent monthly reporting", "Limited onboarding slots each month"], cta: "Reserve my slot", footer: "Early customers get onboarding at no extra cost." },
  { category: "launch", name: "App Update Release", blurb: "Version-update notes people actually read", color: "334155", banner: "What's New", heading: "A faster, cleaner experience", intro: "Our latest update is live. Here is what changed for you:", bullets: ["Pages load noticeably faster", "Cleaner reports and exports", "Several small fixes you reported"], cta: "See the changes", footer: "Thanks for every bug report — they shaped this release." },
  { category: "launch", name: "Grand Opening", blurb: "New branch or store opening announcement", color: "be185d", banner: "Grand Opening", heading: "We are now open in your city", intro: "Hi {{first_name | there}}, our newest location is officially open. Drop in this week for opening offers and a personal tour.", bullets: ["Opening-week special offers", "Meet the local team in person", "Free consultations all week"], cta: "Plan my visit", footer: "Find us on Google Maps — search Cachedigitech." },

  // Promotion & Sale
  { category: "promotion", name: "Flash Sale", blurb: "Urgent, high-converting short offer", color: "dc2626", banner: "Flash Sale", heading: "FLASH SALE — up to 50% off", intro: "Hi {{first_name | there}}, for the next 48 hours our most popular plans are at their lowest price of the season.", bullets: ["No coupon needed — price auto-applied", "Ends soon, stock of slots is limited", "Full support included as always"], cta: "Shop the sale", footer: "Offer valid for a limited time. Terms and conditions apply." },
  { category: "promotion", name: "Seasonal Offer", blurb: "Festive-season discount announcement", color: "ea580c", banner: "Season Special", heading: "A seasonal treat, just for you", intro: "To celebrate the season, we are offering a special discount for our existing customers and their teams.", bullets: ["Special pricing till stock lasts", "Gift it to a colleague or team", "Easy upgrade from any plan"], cta: "Claim my offer", footer: "Wishing you and your family a wonderful season." },
  { category: "promotion", name: "Limited-Time Discount", blurb: "Deadline-driven offer with clear savings", color: "9333ea", banner: "Save Today", heading: "Save 25% — this week only", intro: "Hi {{first_name | there}}, upgrade this week and save 25%. The discount applies automatically at checkout.", bullets: ["25% off annual plans", "Keep all your existing data", "Cancel anytime, no lock-in"], cta: "Upgrade and save", footer: "Price returns to normal after the deadline." },
  { category: "promotion", name: "Festival Offer", blurb: "Diwali/festival greeting plus offer", color: "d97706", banner: "Festival Offer", heading: "Festive greetings & a gift from us", intro: "Warm wishes to you and your family this festive season. As a thank-you, enjoy a special offer on all our services.", bullets: ["Festive pricing across all plans", "Free onboarding this month", "Refer a friend, you both benefit"], cta: "See festive offers", footer: "— With gratitude, Team Cachedigitech" },
  { category: "promotion", name: "Clearance Sale", blurb: "Last-chance clearance messaging", color: "475569", banner: "Last Chance", heading: "Final clearance — when it's gone, it's gone", intro: "We are clearing remaining slots at the lowest prices we will offer this year. Once they sell out, this pricing closes.", bullets: ["Lowest prices of the year", "Limited quantity remaining", "Same premium support included"], cta: "Grab the deal", footer: "No extensions and no rain checks on clearance pricing." },

  // Event Invitation
  { category: "event", name: "Webinar Invitation", blurb: "Online session with date, time and RSVP", color: "0369a1", banner: "Live Webinar", heading: "You are invited: Live Webinar", intro: "Join our specialists for a practical, no-fluff session with live Q&A. Bring your questions — we answer them all.", bullets: ["When: This Saturday, 11 AM IST", "Where: Online (link after RSVP)", "Cost: Free for customers"], cta: "RSVP now", footer: "Seats are limited — please register early." },
  { category: "event", name: "Conference Invite", blurb: "Formal conference invitation", color: "1e40af", banner: "Conference 2026", heading: "Invitation: Annual Industry Conference", intro: "Hi {{first_name | there}}, you are cordially invited to join industry leaders for a full day of talks, panels and networking.", bullets: ["Keynotes from industry experts", "Networking lunch included", "Early-bird pricing ends soon"], cta: "Register today", footer: "Group bookings: reply to this email for a team pass." },
  { category: "event", name: "Workshop Registration", blurb: "Hands-on workshop with limited seats", color: "0f766e", banner: "Workshop", heading: "Hands-on Workshop — Register Now", intro: "A small-group, practical workshop where you leave with a working result — not just notes.", bullets: ["Only 30 seats per batch", "Certificate on completion", "Materials and recordings included"], cta: "Book my seat", footer: "Previous batches filled in under a week." },
  { category: "event", name: "Demo Day Invite", blurb: "Product demo invitation for prospects", color: "6d28d9", banner: "Live Demo", heading: "See it live: Product Demo Day", intro: "Thinking about switching? Watch a full live demo, see real customer results, and ask anything in the open Q&A.", bullets: ["30-minute live walkthrough", "Real results, real numbers", "Special joining offer for attendees"], cta: "Save my spot", footer: "Cannot make it? Register anyway — we send the recording." },
  { category: "event", name: "Networking Meetup", blurb: "Casual community meetup invite", color: "c2410c", banner: "Meetup", heading: "Community Meetup — You're Invited", intro: "Meet fellow professionals from {{company | your industry}} over coffee. No slides, no pitches — just good conversation.", bullets: ["Informal, founder-friendly crowd", "Coffee and snacks on us", "Bring a colleague free"], cta: "Count me in", footer: "Venue details are shared after you RSVP." },

  // Newsletter & Updates
  { category: "newsletter", name: "Monthly Newsletter", blurb: "Classic monthly roundup layout", color: "0f766e", banner: "Monthly Note", heading: "This month at Cachedigitech", intro: "Hi {{first_name | there}}, here is your monthly roundup — the short version, with links if you want more.", bullets: ["Top story of the month", "One practical tip you can use today", "What we are launching next"], cta: "Read the full note", footer: "You receive this because you subscribed to our monthly note." },
  { category: "newsletter", name: "Weekly Digest", blurb: "Short weekly summary of highlights", color: "0284c7", banner: "Weekly Digest", heading: "Your week in five minutes", intro: "The five things worth your attention this week, curated by our team:", bullets: ["Biggest industry headline", "One customer result we loved", "One tool or tip to try"], cta: "Read this week's digest", footer: "Too busy? The first two bullets are the essentials." },
  { category: "newsletter", name: "Company News Update", blurb: "Announcements from inside the company", color: "334155", banner: "Company News", heading: "News from our team", intro: "A quick update on what has been happening at Cachedigitech and what it means for you:", bullets: ["New team members and roles", "Milestones we crossed together", "What is coming next quarter"], cta: "Read the update", footer: "Thank you for being part of the journey." },
  { category: "newsletter", name: "Industry Insights", blurb: "Thought-leadership style insight email", color: "7c2d12", banner: "Insights", heading: "One insight that matters this month", intro: "Hi {{first_name | there}}, our team studied the latest numbers so you do not have to. Here is the one insight that matters:", bullets: ["The trend, in plain language", "What it means for your business", "One action to take this week"], cta: "Read the insight", footer: "Share this with a colleague who would find it useful." },
  { category: "newsletter", name: "Customer Success Story", blurb: "Story-led email with social proof", color: "15803d", banner: "Success Story", heading: "How one customer grew 3×", intro: "Real people, real numbers. This month we share how a customer like you achieved measurable results — and the exact steps they took.", bullets: ["The problem they started with", "The three steps they followed", "Results in 90 days, with numbers"], cta: "Read their story", footer: "Want results like this? Reply and let's talk." },
];

function textBlock(section: Section, html: string, fontSize = 16, align: "left" | "center" | "right" = "left"): Block {
  return {
    id: uid(),
    section,
    type: "text",
    html,
    style: { fontSize, align, padding: "12px 28px", bg: "transparent" },
  };
}

function buildDesign(spec: StarterSpec): Design {
  const blocks: Block[] = [
    {
      // The banner title is a real text block on a coloured background - not
      // words baked into a picture - so it can be clicked and retyped in the
      // editor preview like any other text.
      id: uid(),
      section: "header",
      type: "text",
      html: `<p><span style="color:#ffffff"><strong>${spec.banner}</strong></span></p>`,
      style: { fontSize: 34, align: "center", padding: "36px 40px", bg: `#${spec.color}` },
    },
    textBlock("body", `<p><strong>${spec.heading}</strong></p>`, 24),
    textBlock("body", `<p>${spec.intro}</p>`),
  ];
  if (spec.heroImage) {
    blocks.push({
      id: uid(),
      section: "body",
      type: "image",
      src: `https://placehold.co/600x360/${spec.color}/ffffff?text=${encodeURIComponent(spec.name)}`,
      alt: spec.name,
      width: "100%",
      align: "center",
    });
  }
  if (spec.bullets && spec.bullets.length > 0) {
    blocks.push(textBlock("body", `<ul>${spec.bullets.map((item) => `<li>${item}</li>`).join("")}</ul>`));
  }
  blocks.push({
    id: uid(),
    section: "body",
    type: "button",
    label: spec.cta,
    href: "https://cachedigitech.com",
    style: { bg: `#${spec.color}`, color: "#ffffff", fontSize: 16, radius: 6, align: "center" },
  });
  blocks.push(textBlock("footer", `<p>${spec.footer}</p>`, 13));
  return {
    version: 1,
    settings: {
      outerBg: "#f3f4f6",
      contentBg: "#ffffff",
      width: 600,
      fontFamily: "Arial, Helvetica, sans-serif",
      baseFontSize: 16,
      textColor: "#1f2937",
      linkColor: "#0f766e",
      includeUnsubscribe: true,
      compose: "blocks",
      plainBody: "",
    },
    blocks,
  };
}

export type StarterTemplate = {
  category: string;
  name: string;
  blurb: string;
  color: string;
  banner: string;
  design: () => Design;
};

export const STARTER_TEMPLATES: StarterTemplate[] = SPECS.map((spec) => ({
  category: spec.category,
  name: spec.name,
  blurb: spec.blurb,
  color: spec.color,
  banner: spec.banner,
  design: () => buildDesign(spec),
}));
