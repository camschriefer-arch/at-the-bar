# App Store listing copy

Reference copy for App Store Connect. Character limits noted where Apple enforces
them.

## Name (30)

```
At The Bar
```

## Subtitle (30)

```
Tell friends you're out
```

## Promotional text (170, editable without a new build)

```
Every bar, pub and restaurant in the country is already in here. Confirm you're at one and your friends know you're out — nothing else about where you are is ever shared.
```

## Keywords (100, comma separated, no spaces after commas)

```
bar,pub,friends,nightlife,drinks,check in,beer,location,share,meetup,going out,happy hour
```

## Description (4000)

```
At The Bar answers one question for the people you actually go out with: are you out right now, and where?

Confirm you're at a bar and your friends see it. That's it. When you leave, your status clears itself. When you're anywhere else — work, home, the gym — your friends see nothing at all, because there is nothing to see.

NOTHING IS SHARED UNTIL YOU SAY SO
Your phone notices when you've settled in somewhere that serves a drink and asks you first. Say yes and your friends see the venue. Ignore it and nothing happens. Being near a bar never checks you in by itself, so the pub under your office can't out you at 10am.

YOUR LOCATION STAYS ON YOUR PHONE
This is the part most apps get wrong. Your coordinates are never uploaded and never stored. Your device figures out which venue you're near by itself, and the only thing that ever reaches our servers is the name of the bar you confirmed. Those confirmed check-ins become the "frequently visited" list on your profile, which your friends can see and you can delete from at any time.

FRIENDS ONLY, BY INVITATION
Nobody can follow you. Send someone an invite link by text or email, and only after they accept can they see when you're out. Remove them and they lose it instantly.

EVERY BAR IN AMERICA
More than 250,000 bars, pubs and restaurants nationwide, refreshed every month from OpenStreetMap. Your local is in here.

KEEP THE NIGHT
Photograph what you're drinking, rate it, and keep a gallery of every good round — visible to your friends, nobody else.

ONE FEED, JUST YOUR FRIENDS
The feed collects your friends' arrivals, departures and photos in one place, newest first, and you can comment or react on any of them. Share a friend's photo and it goes to your friends, with the comments staying on the original so the photographer hears everything. There is no public timeline, no strangers and no algorithm — only the people who accepted your invite.

At The Bar is for people over 21 and involves places that serve alcohol. Please drink responsibly, and don't check in while driving.
```

## What's New (first release)

```
The first release of At The Bar. Find your friends when they're out, and let them find you.
```

## Support and marketing URLs

- Support URL: `https://camschriefer-arch.github.io/at-the-bar/`
- Privacy policy URL: `https://camschriefer-arch.github.io/at-the-bar/privacy-policy`

## Category and rating

- Primary category: Social Networking
- Secondary category: Lifestyle
- Age rating: 17+ (Frequent/Intense Alcohol, Tobacco, or Drug Use or References)

## App Privacy answers

| Data type | Collected | Linked to identity | Used for tracking | Purpose |
| --- | --- | --- | --- | --- |
| Precise Location | Yes | Yes | No | App Functionality |
| Email Address | Yes | Yes | No | App Functionality |
| Name | Yes | Yes | No | App Functionality |
| Photos | Yes | Yes | No | App Functionality |
| User Content (drink notes/ratings) | Yes | Yes | No | App Functionality |
| Identifiers (push token) | Yes | Yes | No | App Functionality |

Nothing is used for advertising, analytics or tracking.

Note on Precise Location: coordinates are processed on the device and are never
transmitted or stored. Only the identifier of a venue the user explicitly
confirmed is stored — as the current status while they are there, and as a
check-in count shown to their accepted friends. Apple still requires
declaring Precise Location because the app reads it on the device.

## App Review notes

```
WHY THIS APP USES BACKGROUND LOCATION
The app's single purpose is letting a user tell accepted friends that they are out at a bar. Background location is required to notice that the user has arrived somewhere: the device compares its position, on-device, against a catalog of bars, and after the user has remained within about 0.1 miles of one for five minutes it asks them to confirm. Coordinates are never transmitted to the server. Only the identifier of the venue the user confirms is stored: as the current status, which is cleared when they leave, and as a check-in record that feeds the "frequently visited" list on their profile, which the user can delete per venue. The app has no ability to record or display a user's location at any other time.

MODERATING USER CONTENT
The only user-generated content is drink photos, their notes, and comments and emoji reactions on photos and on arrivals and departures. A user can share a photo they can see onto their own feed, which shows it to their accepted friends; nothing is ever visible without an accepted friendship, and there is no public timeline. Every post in the feed can be reported by anyone who can see it (long-press the card, or the post screen) and every author can be blocked, which hides both people's posts and comments from each other. Reports reach the developer, who removes content and accounts.

HOW TO TEST
Sign in with the demo account below. The Feed tab shows a seeded friend's arrivals, departures and photos, with report and block behind a long press. The Friends tab shows that friend checked in at a venue; tapping them shows the venue and a map pin, which is the only location data any user can see about another. The You tab has "Check in now", which performs the location read immediately rather than waiting for the five-minute dwell, and shows the confirmation prompt. The Invite tab creates a shareable invite link.

Demo account: cam.schriefer+review@gmail.com / <password, entered in App Store Connect only>
```

## Screenshots

Six-point-nine inch iPhone (1290 x 2796), in order:

1. Friends list, one friend out at Jake & Joe's
2. Friend detail with the venue map pin
3. The confirmation prompt on the You tab
4. Drink gallery
5. Invite by link
