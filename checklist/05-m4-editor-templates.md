# 05 — M4: Email editor, templates, preview, images

P0 blocks: text, image, button, plus email-level styling, drag reorder, merge tags, preview, test send, plain text, footer. Divider and spacer are P1 and still in Phase 1.

## Editor

- [x] Document JSON matches the model in system design: `version`, `settings`, `blocks`.
- [ ] Left palette, center canvas, right settings panel.
- [ ] Text block uses TipTap: bold, italic, underline, font size, color, alignment, inline links, merge-tag insert.
- [ ] Image block: upload, alt text, width, alignment, optional link.
- [ ] Button block: label, link, colors, size, alignment.
- [ ] Blocks reorder with dnd-kit. Up/down, duplicate, and delete exist.
- [ ] Email settings: outer background, content background, width, default font, base size, text color, link color.
- [ ] Zustand holds editor state with undo/redo. Autosave runs about every 30 seconds.
- [x] Merge tags support fallbacks, for example `{{first_name | there}}`.

## Render and media

- [x] Server pipeline: sanitize HTML, blocks to MJML, MJML to HTML, `html-to-text` for the plain version.
- [x] `design_json`, `html`, and `text_version` are stored on the template.
- [x] Draft vs template, duplicate, rename, delete.
- [ ] Visibility is team-only or shared.
- [ ] Desktop and mobile preview.
- [ ] Test send goes to the current user through a connected mailbox.
- [x] Every rendered email includes a footer with an unsubscribe link and the company address.
- [ ] Uploads: JPG, PNG, GIF, WebP only, 5 MB max, no SVG. `sharp` re-encodes. File names are random.
- [ ] Public image URLs are cacheable. Local storage goes through `StorageService` (`save`, `getUrl`, `delete`).

## Exit check

- [ ] A newsletter-style email saves, reloads, and previews on desktop and a narrow width.
- [ ] A test send shows the recipient’s first name or the fallback.
- [ ] The footer unsubscribe link is present in HTML and in the plain-text version.
- [ ] Render check in Outlook (desktop and web), Gmail, and one mobile client.
