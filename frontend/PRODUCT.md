# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Existing fans of Tock, Keezen, Dog and Pegs and Jokers who already know the rules and want to play them online. They play on a phone (Android app or mobile browser) or on desktop, against friends via a shared room code, against random opponents, or against bots when no one is around. Players sign in with Google or play as guests without an account.

## Product Purpose
Mercury is a real-time multiplayer card and marble board game. A board always seats exactly 4 players, played as 2v2 teams (red and blue against green and orange). Success is a player getting into a game quickly (solo vs bots, matchmaking, or a custom room) and finishing it with rules enforced fairly by the server.

## Positioning
An online version of the Tock/Keezen family of games with server-authoritative rules, bot seats to fill empty places, reconnection into in-flight games after a drop or a server redeploy, and a team-based ranking. Rules content for the game variants is published as separate static SEO pages.

## Operating Context
- Sessions are long-lived: a signed-in player stays signed in for years on a device.
- Games are in-progress state held on the server; a player can leave and rejoin the same game.
- Invites reach players on the home screen through an always-on presence socket.
- The Android app is a Capacitor shell around the same Angular/Ionic UI; Android 15+ edge-to-edge insets apply.

## Capabilities and Constraints
- Exactly 4 players per board, 2v2 teams only; no 1v3 mode.
- Entry paths: solo vs bots, matchmaking, custom room (shareable code, friend invites).
- Accounts: Google sign-in or guest (browser id only). Profile, avatar, leaderboard, inbox messages, account deletion.
- Shop with coins and boosters (Double Points, Double Coins).
- Frontend: Angular standalone components with Ionic; routes are home, game, profile, leaderboard, shop, privacy, delete-account.
- A separate non-Angular static site under frontend/content/ serves landing and /rules pages for SEO.
- Nobody serves the app during design sessions; verification is build and type checks only, and the owner tests on their own Android device.

## Brand Commitments
- Name: Mercury.
- User-facing copy is English by default, with a neutral, informative tone and no em dashes.

## Evidence on Hand
- Existing rules content in frontend/content/ for Tock, Keezen, Dog and Pegs and Jokers.
- No testimonials, press, download counts or benchmarks are recorded; do not fabricate them.

## Product Principles
- The board and the current turn come first; chrome stays out of the way during a game.
- Rules shown to the player match the rules enforced by the server.
- Getting into a game takes as few steps as possible, whether guest or signed in.
- Players who already know the game should never be taught it again to start playing.
- Controls feel like objects: every button is a chunky keycap with a visible base that gives under the thumb, readable and easy to hit on a phone, the same family as the board pieces.

## Accessibility & Inclusion
No product-specific standard established; mobile touch targets and Android edge-to-edge safe areas are known requirements.
