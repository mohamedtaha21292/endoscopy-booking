Endoscopy Booking - v15 source

Source base: v13 (rename to ليسته المناظير). This version adds the booked-days
summary card at the top of the bookings tab (الأيام اللي فيها حجز): each booked
date with its case count; tapping a day selects it and scrolls to its bookings.
Storage keys, OCR flow, data and app behavior unchanged.

Deployed: main 0c12c9b (live), source 44657c1 on branch source.
Edited files vs v13: src/App.tsx, src/style.css, public/sw.js (cache v15).

Build: npm ci && npm run build
No credentials, tokens or node_modules are included.
