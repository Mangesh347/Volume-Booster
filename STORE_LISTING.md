# XCoda — Chrome Web Store dashboard, section by section (2.12.x)

Images: `Coco\Extensions\Studio\store-assets\xcoda\` (all JPEG, no transparency, exact sizes).

## Store listing
**Title (from package):** XCoda – Volume Booster, Equalizer & Bass Boost
**Summary (from package):** Boost tab volume up to 600%, add bass, make voices clear and mix every playing tab. Free up to 300%. No ads, no tracking.
**Category:** Tools (keep) · **Language:** English (United States)

**Description** (paste as is; leads with what people search: volume booster, sound booster, bass boost, equalizer, louder):
```
Too quiet? XCoda makes any Chrome tab louder, clearer and richer, in one tap.

🔊 VOLUME BOOSTER UP TO 600%
Turn quiet videos, music, podcasts and calls up beyond Chrome's normal maximum. Free up to 300%, up to 600% with Pro.

🎚 ONE-TAP PRESETS AND HOTKEYS
Jump straight to 100, 150, 200 or 300%. Press Alt+Shift+↑ / ↓ on any tab to change its volume without opening XCoda, and Alt+Shift+0 to reset.

🎛 TAB MIXER
See every tab that's playing sound and set each one's volume, or mute it, from a single popup. Turn down the meeting, turn up the music.

🎵 SOUND MODES (EQUALIZER)
• Clear – a soft, clean boost
• Bass – deep, punchy low end (Pro)
• Voice – clearer speech for podcasts, lectures and calls (Pro)
• Movie – a wide, cinematic mix (Pro)

🚫 MUSIC AD BLOCK (PRO)
Skip supported music and video ads on popular streaming sites.

💾 REMEMBERS EACH SITE
XCoda remembers your volume per website, so YouTube, Spotify and Netflix each come back the way you like them.

✨ XCODA PRO
600% boost, every sound mode, Music Ad Block, and every new Pro feature. Monthly, yearly or lifetime.

🔒 PRIVATE BY DESIGN
• No analytics, no ads, no tracking.
• Your audio and browsing history never leave your browser.
• Sign-in is only used for Pro.

Works on YouTube, Spotify, Netflix, Twitch, SoundCloud, Google Meet, Zoom (web), online courses and most sites that play audio. Some protected or browser-internal pages can't be processed by any extension.

XCoda is an independent extension and is not affiliated with Google, YouTube, Spotify or any service it works with.
```

**Graphic assets**
| Field | File |
|---|---|
| Store icon (128×128) | `store-icon-128.png` |
| Screenshots (1280×800, up to 5) | `screenshot-1.jpg` … `screenshot-5.jpg` (in this order) |
| Small promo tile (440×280) | `small-promo-440x280.jpg` |
| Marquee promo tile (1400×560) | `marquee-1400x560.jpg` |
| Global promo video | leave empty for now |

**Additional fields**
- Official URL: none (needs Search Console verification; skip)
- Homepage URL: `https://volume-booster-ten.vercel.app/`
- Support URL: `https://volume-booster-ten.vercel.app/support.html`
- Mature content: **No**
- Google Analytics 4: **leave off** (we promise no analytics)
- Item support: **On**

## Privacy
**Single purpose:** Make audio playing in Chrome tabs louder and clearer, and control each tab's volume.

| Permission | Justification |
|---|---|
| Host `<all_urls>` | Applies XCoda's volume boost and sound modes to the media on whichever website the user is listening to; the user chooses the sites. Audio and page content are processed locally and never sent anywhere. |
| `storage` | Saves the user's volume and sound settings per site, and temporary sign-in state for Pro. |
| `identity` | Only when the user chooses "Continue with Google" to sign in for Pro. |
| `alarms` | Re-checks the Pro plan in the background and ends fixed-term plans on time. |
| Remote code | **No**, all code is in the package. |

**Data usage** (tick exactly these):
- ✅ Personally identifiable information: email and name, only for users who sign in for Pro.
- ✅ Authentication information: sign-in session for Pro, kept in session storage.
- ✅ Financial and payment information: plan, order reference and payment status (card details never reach XCoda).
- Everything else unchecked (no browsing history, website content, location or analytics).
- ✅ I do not sell or transfer user data to third parties outside the approved use cases
- ✅ I do not use or transfer user data for purposes unrelated to the item's single purpose
- ✅ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://volume-booster-ten.vercel.app/privacy.html`

## Distribution
Public · All regions · Free with in-app purchases (Pro). Visible to everyone.

## Test instructions (for the reviewer)
```
No account is needed to test the free features.
1. Open any page playing audio (for example a YouTube video), click the XCoda icon, and move the boost slider or tap the 150% / 200% presets.
2. Open two tabs playing audio: the "Other tabs playing" mixer in the popup lists the other tab; move its slider or tap its icon to mute it.
3. Keyboard: Alt+Shift+Up / Down changes the current tab's volume, Alt+Shift+0 resets it.
Pro features (600%, Bass/Voice/Movie, Music Ad Block) show a Pro prompt when tapped. A Pro test login can be provided on request.
```

## What's new in 2.12.0 (for the "release notes" style blurb, optional)
New look, one-tap presets, keyboard shortcuts, Tab Mixer, and a calmer, clearer volume dial.
