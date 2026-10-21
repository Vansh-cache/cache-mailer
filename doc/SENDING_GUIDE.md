# Cachedigitech Mailer — roles and how to send

This is the working guide for the app at http://localhost:5173. It explains the words the product uses, what each role can do, what is still missing before a real send, what to ask IT, and the click path from an imported customer list to a sent campaign.

Sign-in starts with one bootstrap admin: `admin@mailer.com` (password set by `SEED_ADMIN_PASSWORD` in `apps/server/.env`, default `Qwe@123` — change it after the first sign-in). There are no demo accounts. The admin creates each person's login under **Users**, choosing a role and team:

| Role | Team | Can do |
|---|---|---|
| Admin | none (sees every team) | Everything, including Users, Mailboxes and Settings |
| Marketing | Marketing | Marketing campaigns and mailboxes |
| Sales | Sales | Sales campaigns and mailboxes |

These are app logins. They are not Microsoft 365 mailboxes. A person can sign in as Marketing and still be unable to send until an admin has added a Marketing mailbox and IT has allowed Microsoft 365 to send as that address.

## Words used in the app

**Mailer.** The product itself. The sidebar title is Mailer. It is the website, the API, the worker, and the tracking server together. It does not send mail by itself. It asks Microsoft 365 to send.

**Team.** Sales or Marketing. A campaign and a mailbox belong to one team. A Marketing user only works with Marketing campaigns and Marketing mailboxes. An admin can work with both.

**Role.** What a login is allowed to do: Admin, Marketing, or Sales. The role is separate from the mailbox. Giving someone the Marketing role does not create an email address for them.

**User.** A person who signs in to this app. Admins create users on the Users screen. Each Marketing or Sales user must be assigned a team.

**Mailbox.** A Microsoft 365 address the app is allowed to send from, such as `marketing@cachedigitech.com`. In the database this is a sender. You add it on the Mailboxes screen. It has a from-name, a from-email, an optional reply-to, a team, a daily limit (default 500), and a per-minute limit (default 20). Status is Active, Paused, or Error. Only an Active mailbox on the same team as the campaign can send.

**Microsoft 365 / Graph.** The company mail system. The app talks to it with one app registration (tenant id, client id, client secret). Those three values are shared by every mailbox. They are not typed into the Mailboxes screen. They go in `apps/server/.env`.

**Contact.** One person in the list: email, name, company, job title, status (active, unsubscribed, or bounced), and tags.

**Tag.** A label on contacts, such as Customer or Lead. Importing a file can apply one tag to every row. A campaign sends to a tag, or to a saved segment. When the last contact in a tag is deleted, that tag disappears and the Contacts screen returns to all contacts.

**Segment.** A saved rule, for example “tag equals Lead and company contains Tech”. Built on the Audience screen. A campaign can use a tag, a segment, or both.

**Suppression.** An email address that must never receive a campaign, even if it is still on a tag. Unsubscribes and hard bounces are added here. You can also block an address by hand on Audience.

**Template.** The saved design of the email: text, image, button, divider, and spacer blocks. Three shared starters are seeded: Plain personal, Announcement, and Newsletter. The app does not import an HTML file, a Mailchimp export, or an MJML file. Rebuild an outside design with those blocks, or start from a seeded template and edit it.

**Merge tag.** A placeholder filled in per person at send time. Write `{{first_name | there}}` and a contact with no first name sees “there”. Available fields: `email`, `first_name`, `last_name`, `company`, `job_title`.

**Campaign.** One send. It ties together a name, subject, preheader, template, team, mailbox, and audience (tag and/or segment). Leave the schedule empty to send now, or set a time to send later.

**Worker.** The background process that actually sends. `npm run dev` starts it with the API and the website. If the worker is not running, a campaign can pass the checks and still never leave the queue.

**Tracking.** A separate process on port 4100. It records opens, clicks, and unsubscribes. The email footer includes an unsubscribe link.

**Pre-send check.** The gate on “Review and send”. The campaign is refused until the subject is set, Settings has a real postal address, the email renders with an unsubscribe link, the chosen mailbox is Active and on that team, and at least one active contact remains after suppression.

## What each role can do

Contacts are shared. Every signed-in role can see and import the same contact list. Campaigns, templates, and mailboxes are limited by team, except for an admin.

| | Admin | Marketing | Sales |
|---|---|---|---|
| Sign in and use Dashboard, Contacts, Templates, Campaigns | Yes | Yes | Yes |
| Import, edit, delete, export contacts | Yes | Yes | Yes |
| Create tags, segments, and suppression entries | Yes | Yes | Yes |
| Delete a tag | Yes | Yes | No |
| Build and edit templates for their own team | Yes | Yes, Marketing only | Yes, Sales only |
| See shared templates (the three starters) | Yes | Yes | Yes |
| Mark a template as shared with both teams | Yes | No | No |
| Create a campaign | Yes, and must pick Sales or Marketing | Yes, Marketing only | Yes, Sales only |
| See the other team’s campaigns | Yes | No | No |
| See mailboxes | Every team | Marketing only | Sales only |
| Add, pause, or edit a mailbox | Yes | No | No |
| Check a mailbox connection | Yes | Yes, for Marketing mailboxes | Yes, for Sales mailboxes |
| Settings: company name and postal address | Yes | Yes | Yes |
| Connect Zoho and edit Zoho field mapping | Yes | No | No |
| Run Zoho sync | Yes | Yes | No |
| Users screen (create logins) | Yes | Hidden | Hidden |
| Health screen | Yes | Hidden | Hidden |

A Marketing user sends only through a mailbox whose team is Marketing. A Sales user sends only through a Sales mailbox. The admin adds both.

## Where you are now

You can practice import, tags, and the editor on this PC. A real customer send is blocked until the items below are done.

| Gap | What you feel in the app | What closes it |
|---|---|---|
| Microsoft 365 is not connected | `MS_TENANT_ID`, `MS_CLIENT_ID`, and `MS_CLIENT_SECRET` in `apps/server/.env` are empty. Check connection fails with “Microsoft 365 is not configured”. | IT creates the Entra app and you paste the three values, then restart the app. |
| No sending mailbox for Marketing or Sales | Campaign check says “Choose an active mailbox on this team”. | After Graph works, an admin adds each mailbox on Mailboxes and assigns the team. |
| Company address is still the seed placeholder, unless you already replaced it | Campaign check says “Set the company address in Settings”. | Settings → Company footer. Use the real postal address. |
| Office people do not have their own logins | Only the three local practice users exist. | Admin → Users. Create one user per person, with role and team. |
| Zoho is not connected | Settings says the Zoho client is not configured. | Optional for a file import. Required only if the list should come from Zoho CRM. |
| Worker must stay running | Campaign is accepted but nothing is delivered. | Leave `npm run dev` running (API, worker, tracking, and the website). |

You do not need Docker. MySQL for this project is the local server on `127.0.0.1:3307`, started with `scripts/dev-db.ps1`, before `npm run dev`.

## What to ask at the office

Ask IT for one Microsoft 365 app that this mailer can use. Ask for the mailboxes by name. Do not ask them to type into the Mailer screens; you do that part.

1. An Entra ID (Azure AD) app registration using client credentials (a client secret is what this app reads today).
2. These three values, sent to you privately, not in chat or email threads that get forwarded widely: **Directory (tenant) ID**, **Application (client) ID**, **client secret value**. The secret is shown only once when they create it.
3. Admin consent for application permissions **Mail.Send** and **Mail.Read** (or Mail.ReadWrite). Mail.Send is what delivers the campaign. Mail.Read is what the bounce and reply reader uses.
4. An Exchange application access policy that allows this app to send only as the chosen mailboxes, not as every mailbox in the company.
5. The actual From addresses, one or more for Marketing and one or more for Sales. Example shape: a shared mailbox `marketing@cachedigitech.com` and a shared mailbox `sales@cachedigitech.com`. Each must already exist in Microsoft 365. The From email you type in Mailer must match that mailbox exactly.
6. Who reads replies. That address becomes Reply-to. It can be the same as From, or a person who watches the inbox.
7. Confirmation that SPF, DKIM, and DMARC already pass for the sending domain. IT owns DNS. You do not set those in this app.
8. Their current send limits (recipients per day, messages per minute). Keep the mailbox daily limit and per-minute limit under those numbers. The form defaults are 500 a day and 20 a minute.
9. Only if you also want Zoho: a Zoho CRM API client for the India data center (`.in`), scopes `ZohoCRM.modules.contacts.READ` and `ZohoCRM.modules.leads.READ`, plus the client id and secret. That is separate from Microsoft 365.

Legal or Marketing should confirm the customer list is opted-in, or that a written legitimate-interest rule covers it, before a real send.

## Where each answer goes

**Microsoft 365 app ids.** On this PC, edit `apps/server/.env`:

```
MS_TENANT_ID=...
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...
```

Stop the app and start it again with `npm run dev`. The API and the worker both read this file. Saving the file while they are running does not pick the new values up.

**Zoho ids, only if you use CRM sync.** Same file: `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET`. Then sign in as admin, open Settings, and use Connect Zoho. Marketing can press Sync now after that connection exists. Sales cannot.

**Mailboxes for Marketing and for Sales.** In the app, signed in as admin: **Mailboxes → Add mailbox**.

| Field | What to enter |
|---|---|
| Team | Marketing, or Sales |
| From name | The name recipients should see |
| From email | The Microsoft 365 mailbox IT created |
| Reply-to | The inbox a human reads, or leave blank to use From |
| Daily limit | At or below the number IT gave you. Default 500 |
| Per minute | At or below the number IT gave you. Default 20 |

Press **Check connection**. Success means Graph can see that mailbox. Then send a small test campaign to yourself before any customer list. Pause a mailbox on that same card when it must not send.

Marketing users and Sales users never see Add mailbox. They only choose, on a campaign, a mailbox an admin already added for their team.

**Logins for the people on each team.** Signed in as admin: **Users**.

| Field | Marketing person | Sales person |
|---|---|---|
| Name | Their name | Their name |
| Email | Their app login (this can be their work email; it is only the Mailer password login) | Same |
| Password | At least 10 characters | At least 10 characters |
| Role | Marketing | Sales |
| Team | Marketing | Sales |

Role Marketing without team Marketing cannot be saved. The same rule applies to Sales. Admin may leave team empty. Disabling a user is on that same page. This does not create a Microsoft mailbox. The mailbox is the earlier step.

**Company address.** **Settings → Company footer.** Company name and the real postal address. Every send appends this to the footer. The check refuses the placeholder text that the database seed put there.

## Send one bulk mail to customers

Do the office steps above before step 6. Steps 1–5 can be practiced now with the admin login.

### 1. Start the app

1. If MySQL is not already listening on port 3307, run `powershell -File scripts/dev-db.ps1` and leave that window open.
2. From the project folder, run `npm run dev`.
3. Open http://localhost:5173 and sign in as `admin@mailer.com`.

### 2. Put the company address in

Settings → Company footer → postal address → Save.

### 3. Import the customer file

Contacts → **Import list**.

- File: CSV or Excel, up to 8 MB.
- Headers the importer recognizes, in any case: Email, E-mail, Name, First Name, last name, Company, Job title, tags.
- Email is required. A tags column is optional.
- **File category: Customer.** That tags every row Customer, which is how you select them later. Tags already in the file are kept as well.
- Leave “demo file” unchecked for a real list. Check it only for a trial file you plan to delete. Those rows are tagged Demo data.
- Import. The toast reports how many were created, updated, or invalid.

Contacts → tag dropdown → Customer. Confirm the rows. A search that matches nobody leaves the tag selected. Deleting the last contact in that tag clears the tag and shows all contacts again.

### 4. Make the email

You have two sources, and both end in the same editor.

**Use a template already in the app.** Templates → open Plain personal, Announcement, or Newsletter → change the text. Duplicate first if you want to keep the starter.

**Bring a design from outside.** There is no upload for an HTML file or a template from another tool. Open the outside design beside the editor and rebuild it: Templates → **New email**. Add text, image, button, divider, and spacer blocks. Put the outside copy into a text block. Put each outside button in as a button block with a real `https://` link. Put images on image blocks with alt text.

In the body, greet people with `{{first_name | there}}`. Use Preview and look at desktop and mobile. The footer and unsubscribe link are added at send time. You do not paste those in by hand.

Save before you leave the editor.

### 5. Optional: a saved segment

Skip this if “everyone tagged Customer” is the audience. Audience → Saved segment if you need a narrower rule (tag equals Customer, and company contains something). Suppression is the place to block a single address that must be left out.

### 6. Add the Marketing mailbox

This is the step that waits on the office.

1. Paste the three `MS_*` values into `apps/server/.env`.
2. Restart `npm run dev`.
3. Sign in as admin → Mailboxes → Add mailbox → Team **Marketing** → the From address IT gave you → Save.
4. Check connection. The badge should stay Active, and the card should not show a Graph error.
5. Repeat with Team **Sales** when Sales should send too.

### 7. Create the campaign

Campaigns → **New campaign**.

| Field | For this customer send |
|---|---|
| Name | Internal name, for example “October customer update” |
| Subject | What the inbox shows |
| Preheader | The short line next to the subject. Optional |
| Template | The email you saved |
| Team | Marketing. An admin must choose this. A Marketing user does not see a choice; the campaign is Marketing automatically |
| Mailbox | The Marketing mailbox from step 6. It must be Active |
| Tag | Customer |
| Segment | None, unless you saved one |
| Schedule | Empty to send now. A future date to wait |

**Review and send.** The app runs the pre-send check and then queues the campaign. If a line says Fix, the send did not start. The usual fixes are: subject empty, address still the placeholder, mailbox missing or not Active, tag empty, or everyone in the tag is suppressed.

### 8. Watch the send

Leave the worker running. Open the campaign from Campaigns. Status moves to Sending, or Scheduled if you set a time. Recipients move to Sent as the worker goes through the list. Opens, clicks, and unsubscribes show on that report after someone interacts with the message.

Pause or cancel from that campaign if the list is wrong. Pause the mailbox on Mailboxes if Microsoft starts rejecting it. The worker skips a mailbox in Error or Paused.

## A short map of “who does what”

| Job | Who | Screen or file |
|---|---|---|
| Create the Microsoft app and mailboxes in Microsoft 365 | IT, at the office | Entra and Exchange, not this app |
| Store tenant id, client id, secret | You, after IT replies | `apps/server/.env`, then restart |
| Add Marketing and Sales From addresses | Admin | Mailboxes |
| Create Marketing and Sales logins | Admin | Users |
| Set the postal address | Admin (Marketing and Sales can also save it) | Settings |
| Import customers and tag them Customer | Admin, Marketing, or Sales | Contacts → Import list |
| Design the email | Admin, Marketing, or Sales | Templates |
| Send as Marketing | A Marketing user, or an admin who picks Marketing | Campaigns → New campaign |
| Send as Sales | A Sales user, or an admin who picks Sales | Campaigns → New campaign |
