---
title: Bhu-Validate DILRMP
emoji: 📜
colorFrom: yellow
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: Land record digitisation and review console (SIH26018)
---

# Bhu-Validate — DILRMP land record digitisation

Upload a scanned Record of Rights (Jamabandi, 7/12 extract, Khatauni); the
pipeline reads it, checks that areas and shares add up, and routes anything it
cannot vouch for to a human reviewer.

Sign in with a demo account shown on the login page, e.g.
`patwari.demo` / `patwari@123`.

This Space is a demo: it has no persistent storage, so uploads and review
decisions are reset whenever the Space restarts or goes to sleep.

Source: https://github.com/tejas0407/SIH
