import type { RefPage } from './topics';

// Help → FAQ: why Open Gate is built the way it is, and what that means for you. Every answer must
// be true for the version that ships it: check it against the app when a decision changes
// (Dev/Release process in the vault).

export interface FaqLink { label: string; tab?: string; ref?: string; url?: string }
export interface Faq { id: string; group: string; q: string; a: string; links?: FaqLink[] }

export const FAQ_GROUPS = ['About Open Gate', 'Your data and privacy', 'Why it’s built this way', 'Using it', 'Feedback'];

export const FAQ: Faq[] = [
  // ---- About Open Gate
  { id: 'what', group: 'About Open Gate', q: 'What is Open Gate?', a: 'A free, open-source pre-production app for filmmakers that takes a project from script to release: writing, breakdown, scheduling, budget, paperwork, call sheets, festivals and the press kit, all in one place.' },
  { id: 'free', group: 'About Open Gate', q: 'Is it really free?', a: 'Yes. No subscription, no ads, no paid tier. It’s open source under the GPL-3.0 licence: anyone can read the code, and it stays free.', links: [{ label: 'The code on GitHub', url: 'https://github.com/opengateapp/opengate' }] },
  { id: 'who', group: 'About Open Gate', q: 'Who makes it?', a: 'An independent filmmaker, with help from contributors. The open projects it builds on are credited on the Home screen.' },
  { id: 'different', group: 'About Open Gate', q: 'How is it different from other production software?', a: 'Many production tools are paid subscriptions that keep your project on their servers and need an account. Open Gate is free, works without an account, keeps your project on your device, works offline, and covers the whole pipeline in one app.' },
  // ---- Your data and privacy
  { id: 'where', group: 'Your data and privacy', q: 'Where is my project stored?', a: 'On your device, in your browser’s storage. It isn’t on our servers unless you share it, and then only encrypted.' },
  { id: 'backup', group: 'Your data and privacy', q: 'How do I back it up?', a: 'Save a .opengate project file regularly (⌘S, or Save in the project menu) and keep it somewhere safe; a cloud folder of your choice works. Settings → Data & backups downloads every project at once. Clearing your browser’s site data deletes the projects stored in that browser.', links: [{ label: 'Settings → Data & backups', tab: 'setup' }] },
  { id: 'account', group: 'Your data and privacy', q: 'Do I need an account?', a: 'No. No account means nothing to sign up for, no password to leak, and no profile about you for anyone to sell.' },
  { id: 'sharing', group: 'Your data and privacy', q: 'How does sharing work without accounts?', a: 'You send an invite link. Your project is encrypted on your device (AES-256), and the key is in the part of the link after the “#”, which browsers never send to the server. The relay that passes updates between collaborators only stores encrypted data it can’t read. The budget, paperwork and festival fees have their own separate key, so you choose who sees money.' },
  { id: 'offline', group: 'Your data and privacy', q: 'Does it work offline?', a: 'Yes. Once it’s loaded (or installed), you can work without internet, and shared projects catch up when you’re back online.' },
  { id: 'tabs', group: 'Your data and privacy', q: 'Can I open my project in two tabs or on two devices?', a: 'Two devices: yes, through sharing. Two tabs of the same browser: one tab edits and the other opens the project read only, with “Use it here” to move editing to it, so the two can’t overwrite each other.' },
  // ---- Why it's built this way
  { id: 'google', group: 'Why it’s built this way', q: 'Why no “Sign in with Google”, Google Drive or Google Calendar?', a: 'Connecting to Google needs a server that holds every user’s Google login tokens, plus Google’s app verification. That would mean storing access to your accounts, which is a security risk and against Open Gate’s design of keeping your work on your device. Instead, save your .opengate file into any cloud folder you like, and download the shoot schedule as an .ics file (Plan → Calendar) to add it to Google, Apple or Outlook calendar.', links: [{ label: 'Plan → Calendar', tab: 'calendar' }] },
  { id: 'social', group: 'Why it’s built this way', q: 'Why can’t Open Gate post straight to Instagram, TikTok or YouTube?', a: 'Those platforms need a server holding everyone’s social media logins, app reviews by each company, and paid API access in some cases. Instead, Open Gate prepares the post (caption, photos, and a check that everyone in it has signed a release). You share it with your phone’s share sheet, open X, Threads or Bluesky with the caption filled in, or export the calendar for a scheduling tool like Buffer.', links: [{ label: 'Release → Social & BTS', tab: 'social' }] },
  { id: 'filmfreeway', group: 'Why it’s built this way', q: 'Why can’t it import festivals from FilmFreeway automatically?', a: 'FilmFreeway’s terms don’t allow automated reading of its site. So you paste a festival’s dates and fees and Open Gate reads them on your device; you still submit on FilmFreeway.', links: [{ label: 'Release → Festivals', tab: 'festivals' }] },
  { id: 'rates', group: 'Why it’s built this way', q: 'Why aren’t union rates built in?', a: 'Union rates and rules change often, and their rate sheets belong to the unions. Open Gate explains each union and agreement in plain words, links to the official terms with a “checked on” date, and lets you type your own rates.', links: [{ label: 'Reference → Guilds & Unions', ref: 'guild-sag-aftra' }] },
  { id: 'currency', group: 'Why it’s built this way', q: 'Why doesn’t Open Gate convert currencies?', a: 'Exchange rates change daily, and a budget should use the rates you actually get. Pick your project’s currency in Settings → Units & currency; amounts stay as you typed them.', links: [{ label: 'Settings', tab: 'setup' }] },
  { id: 'advice', group: 'Why it’s built this way', q: 'Is the legal, union, tax or money information advice?', a: 'No. It’s plain-language guidance with sources, to help you ask the right questions. For decisions, read the official terms and talk to the union, a lawyer or an accountant.' },
  // ---- Using it
  { id: 'phone', group: 'Using it', q: 'Can I use it on my phone or iPad?', a: 'Yes. Phones get “Open Gate Lite”: you choose which tabs show (Settings → Phone layout). On iPad, storyboards and boards work with Apple Pencil, with pressure and palm rejection.' },
  { id: 'desktop', group: 'Using it', q: 'Is there a desktop app?', a: 'One is in progress for Mac, Windows and Linux. Until then, the web app works in any modern browser, and you can install it from your browser (Install app, or Add to Home Screen on a phone or iPad) so it opens in its own window and works offline.' },
  { id: 'import', group: 'Using it', q: 'What script formats can I import?', a: 'Fountain (and plain text or Markdown written in Fountain), Final Draft (.fdx), PDF, Word (.docx), Highland, Celtx and HTML. Old .doc files need saving as .docx or PDF first.' },
  { id: 'budget', group: 'Using it', q: 'I’m new to budgeting. Where do I start?', a: 'Use “Set up my budget” in the Budget tab, which asks one question at a time, or start a project from “Start from a budget” on the Home screen. The sample production shows a finished example.', links: [{ label: 'Budget', tab: 'budget' }] },
  { id: 'future', group: 'Using it', q: 'What happens to my work if Open Gate stops being developed?', a: 'Your project files stay on your device and keep working. The format is open and the code is open source, so anyone can keep it going.' },
  // ---- Feedback
  { id: 'feedback', group: 'Feedback', q: 'How do I report a bug or suggest a feature?', a: 'Help (?) → Report a bug, or Send feedback. It opens a GitHub form with your app version filled in. GitHub posts are public, so don’t include private project details. You need a free GitHub account to post.' },
  { id: 'help-out', group: 'Feedback', q: 'Can I help?', a: 'Yes: report bugs, suggest resources for the Reference library, or contribute code on GitHub.', links: [{ label: 'Open Gate on GitHub', url: 'https://github.com/opengateapp/opengate' }] },
];

export const FAQ_PAGE: RefPage = {
  id: 'faq', category: 'help', title: 'Questions about Open Gate', lead: 'Why it’s free, local-first and account-free, what that means for your data, and how to get help.',
  sections: [], tool: 'faq', topics: [],
  keywords: FAQ.map((f) => `${f.q} ${f.a}`).join(' '),
};
