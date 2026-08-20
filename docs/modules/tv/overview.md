# TV — Module Overview

> Digital signage and corporate channel.

**Route:** `/tv`
**Color:** `#ef4444` (red)

## Purpose

The TV module powers digital signage displays in IT labs — showing events, videos, music, and announcements. It has two modes: admin (content management) and display (full-screen playback).

## Key Features

- **Events management** — create, edit, activate campus events
- **Video playlists** — YouTube integration with metadata fetch
- **Music queues** — background audio for displays
- **Announcements** — scrolling text announcements
- **Urgent alerts** — severity-based emergency messages
- **Photo galleries** — image carousels
- **Device management** — activation codes for TV devices

## Display Mode

Full-screen presentation with:
- Event carousel with transitions
- YouTube video player
- Music player with volume control
- Background audio
- Optimized for TV resolutions

## Data Source

- **Direct Supabase access** (no local sync)
- Tables: tv_events, tv_playlists, tv_music_*, tv_announcements, tv_galleries, etc.
- YouTube API for video metadata

## Related

- [Architecture: Backend](../../architecture/backend.md)
