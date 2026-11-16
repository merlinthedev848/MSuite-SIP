# MSuite SIP feature review

Reviewed on current `main` at `11dbb624` (merge of PR #4, handler probes and client status). Open and not merged: [PR #5](https://github.com/merlinthedev848/MSuite-SIP/pull/5) on `cursor/deskphone-profiles-and-logs-e598`. That pull request is mentioned only where `main` still lacks the behaviour.

Surfaces read: CKM Handler admin (`ckm-handler/public/admin/index.html`, `app.js`, `src/routes/admin.ts`, `src/routes/hardwareProvision.ts`, `src/templates/`), the Windows app (`MerlinSIP/`), the Mac app (`MerlinSIP.Mac/`), the PHP/WebRTC app (`merlin-webapp/`), and the React preview (`WEB/`).

## What is already solid

The handler is an operations console, not a settings form. The sidebar in `ckm-handler/public/admin/index.html` is Overview, Extensions & Softphones, Shared Address Books, IP Deskphone Fleet (with a pending-adoption badge), Network Gateways, Firmware Repository, Live Device Shell, and Global System Settings. Settings holds PBX instances, branding, RBAC, and the GDPR vault. Extensions can be created, given a password, and handed out as an 8-digit PIN (`POST /api/admin/pins`, `POST /sip/provision/:code`). Shared address books are assignment-scoped and exported as CSV. Deskphone fetch (`GET /provision/:filename` in `hardwareProvision.ts`) parses Yealink, Snom, Grandstream, Poly, Fanvil, Gigaset, and Cisco filenames, blocks a deactivated extension, can auto-adopt, and can serve a per-MAC `custom_config` with variable substitution. Router scripts and a firmware store with range requests are real. PR #4 made the overview PBX chip honest: a UDP probe with no SIP answer is unreachable, and creating an extension or handset that already exists returns 409 instead of overwriting it.

The Windows softphone (`MerlinSIP`, shell version 1.3.9.5) is a two-line phone. `RtpAudioSession.cs` keeps a second RTP socket, mixes a conference, and writes a WAV under Documents/Merlin SIP/Recordings. Invites offer PCMU, PCMA, and telephone-event, and a video call adds H.264 and VP8 (`SipRegistrationService.BuildInvite`). Presence and BLF are SIP subscriptions. The contacts screen loads the handler directory with `GET /api/v1/contacts`. PIN provisioning and the license gate are wired.

The Mac app is a real SIP phone, not a mock. `MacSipEngine.cs` registers, holds two lines, sends and receives SIP MESSAGE, subscribes to `dialog` and `presence`, and records locally. The Phone tab exposes hold, mute, transfer, record, voicemail, pickup, park, and queue as desk feature codes.

The PHP app (`merlin-webapp`, SIP.js 0.21.2) places real WebRTC calls: register, invite, answer, hold, blind REFER, DTMF, and a second session slot on the dial view. PR #4 kept `Declined (DND)` in call history and stopped diagnostics from certifying NAT, SIP ALG, and RTP checks the server does not measure.

The React preview (`WEB`) is now labelled correctly. `App.tsx` tells the user the page does not register, and `useCallManager.ts` only advances a local timer. That honesty is the right state for a layout preview.

## Gaps that make the product feel basic

**A registered deskphone is still one line, and the file it boots is thin.** `+ Register Physical Deskphone` asks for MAC, brand, model, one extension, and an optional label (`index.html` around the `formAddHandset` fields). Submit sends only those fields (`app.js`, the `formAddHandset` handler). Every generator writes a single account: `account.1` in `yealink.ts`, `<P271>` in `grandstream.ts`, `user_* idx="1"` in `snom.ts`, `reg.1` in `poly.ts`, `<Line_1>` in `fanvil.ts`, `Line1.*` in `gigaset.ts`, and `<Line_Enable_1_>` in `ciscoPhone.ts`. Yealink’s file has no DTMF mode, dial plan, VLAN, timezone, or line-key identity. Grandstream’s timezone is `<P64>0</P64>` (GMT) and it has no VLAN or dial plan. Snom is the only template that already sets VLAN 20, London (`GBR-0`), and a GB tone scheme. A T46U or GXP2170 provisioned from this admin comes up as a single-account phone with whatever clock the brand defaulted to. `main` does not have the two-line profiles in PR #5.

**The handset Logs button is a filter on one shared buffer.** `telemetryStream.ts` keeps 1,000 events in process memory. `viewDeviceLogs` in `app.js` keeps a row when the MAC, the message text, or the IP contains the filter string, and `getFilteredDeviceLogs` does the same on the server. One phone’s modal can show another phone. A restart empties the buffer. There is no `provision_log` column on `physical_handsets` (`systemDb.ts`). PR #5 stores provision, fetch, and error lines on that handset’s own row and polls them from the Logs view. `main` does not.

**Busy-lamp keys cannot be set from the screen that implies they exist.** `physical_handsets.blf_keys_json` is stored, and Yealink, Snom, and Poly templates emit keys when the JSON is present. The register and adopt forms never send `blfKeys`. The column stays null unless someone pastes a raw file into Edit Config.

**Two directory URLs in the generated profiles 404.** `poly.ts` sets `dir.corp.address` to `/phonebook/poly.xml`. `gigaset.ts` sets `OnlineDirUrl` to `/phonebook/gigaset.xml`. `directory.ts` serves Yealink, Fanvil, Grandstream, Snom, and Cisco only. `ciscoPhone.ts` never points at the Cisco book the handler already serves. The Company Directory button on a Poly or Gigaset is a dead link. A Cisco SPA gets no book at all.

**The firmware button the fleet screen leads with cannot fetch Yealink.** Yealink rows in `catalog.ts` use `https://support.yealink.com/` as `firmwareUrl` and have no `directDownloadUrl`. Snom and Grandstream rows have direct binaries. The Firmware Repository subtitle already says Yealink, Poly, and Cisco are upload-only. The catalog notes still read like those ROMs are one click away.

**The PHP switchboard, conference control, and recording library are shells.** The rail has Switchboard, and `renderBlfGrid` draws cards from `state.blfExtensions`, which is initialised to `[]` and never filled. Refresh BLF sets the notice “BLF presence is not polled from the PBX.” Line 2 can hold a second SIP session, then Merge runs `mergeConference()`, which only warns that the phone cannot join the lines. Record saves a WebM blob in the tab and posts metadata to `recordings.php`, which drops the bytes. After a reload the row says “Audio archived” and has no player. The rail footer and About page print `v1.3.0` (`index.php`) while `MERLIN_WEBAPP_VERSION` and the SIP User-Agent are `1.3.2`.

**The Mac phone and the Windows phone do not speak the codecs the handler just wrote onto the desk set.** Windows `GetSupportedAudioPayloads` accepts only payload 0 and 8, and the invite always adds `a=rtpmap:0 PCMU/8000` and `a=rtpmap:8 PCMA/8000`. Mac `MacSipEngine` keeps a format only when the codec is PCMU or PCMA. The Yealink, Grandstream, Fanvil, and Gigaset templates enable G.722 and Opus. A call between the softphone and a phone this handler provisioned falls back to G.711. The Mac Video button passes `video: true` into `Dial`; there is no video RTP session in `MerlinSIP.Mac`. The Mac Contacts tab does not call `/api/v1/contacts`. Windows does, in `MainWindow.xaml.cs`.

**The React Phone tab still looks like a phone.** Dial, History, and Contacts are on screen. Contacts are four hardcoded rows in `App.tsx` (`INITIAL_CONTACTS`). Dial waits 800 ms, then 2 seconds, and shows Connected (`useCallManager.ts`). Video uses that same timer. PR #4 stopped it claiming a live registration. The screen is still a demo of a call.

**A few operator surfaces still overclaim.** The sidebar footer is the literal string “Online (Port 443)” next to a green dot, independent of the PBX chip PR #4 fixed. `POST /api/admin/catalogs/preview` has no `adminAuth` and embeds the sample password `StandardPassword123!` in the preview body. `README.md` and `ckm-handler/README.md` still tell an operator to `git pull origin beta/provisioning-and-contractor-licensing`. `docs/PRODUCT_PLAN.md` still lists native registration as a future step. The Windows app already does that.

## Feature-rich improvements worth doing

Ordered by what a desk, a receptionist, or a technician would notice first.

1. **Land the two-line profile and the per-handset fault log.** Client: CKM Handler, IP Deskphone Fleet and the files phones fetch. Why: this is the difference between “we provision phones” and “the phone boots as a desk set.” `main` is one account and one shared log, as above. PR #5 already generates two identities (unless `line_count` is 1), codecs, DTMF, a dial plan, London time, VLAN 20, the directory URL, registration expiry, and a built-in ring per line, and it stores redacted provision events on that MAC. Merge that. Do not write a second version of it.

2. **Give the fleet screen the keys and directories the templates already know how to emit.** Client: CKM Handler, the register/adopt dialogs and `directory.ts`. Why: a colour screen phone is sold on side keys and a company book. Add a key list on the handset row that writes `blf_keys_json` (extension, label, key index) so Yealink, Snom, and Poly actually get BLF without a hand-edited file. Serve `/phonebook/poly.xml` and `/phonebook/gigaset.xml` the same way the other books are served, or stop writing those URLs. Point `ciscoPhone.ts` at the Cisco book that already exists. After PR #5, Grandstream programmable keys and a third SIP account are still absent on purpose; leave them out until there is one P-value map per model family.

3. **Make the PHP switchboard and the recording library do what the buttons say.** Client: `merlin-webapp` (Dial, Switchboard, Recordings). Why: this is the browser phone that actually registers. Fill `blfExtensions` from SIP dialog/presence, or from a handler poll of registered extensions, and light the lamps the wallboard already renders. Store the WebM next to `recordings.json` so the player survives a refresh. Either mix the two line sessions or remove Merge. Finish attended transfer as a second REFER, instead of hold-then-dial. Fix the visible version to `1.3.2` so the rail matches the User-Agent.

4. **Add G.722 to the Windows and Mac softphones.** Client: `MerlinSIP` (`RtpAudioSession.cs`, `GetSupportedAudioPayloads`) and `MerlinSIP.Mac` (`MacSipEngine` codec filter). Why: the handler turns G.722 on for the deskphones it ships. Until both softphones can offer it, every call from those phones to Merlin is narrowband, and the “HD” lines in the profile are decorative. Opus can wait. G.722 is the codec both the Yealink and Grandstream templates already prefer after G.711.

5. **Load the shared address book on the Mac.** Client: `MerlinSIP.Mac` Contacts tab. Why: Global Shared Address Books are already the directory for Windows and for the XML phonebooks. The Mac contacts list is only what was typed or imported on that machine, so a book assigned in the admin never appears there.

6. **One timezone and one dial plan per PBX instance, written into every brand file.** Client: CKM Handler, Global System Settings and the seven templates. Why: `main` disagrees with itself. Snom is London, Grandstream and Poly are GMT, Yealink and Cisco set neither. PR #5 standardises the brands it edits onto London. That is the right default for this deployment and the wrong long-term behaviour on a handler that already has multiple `pbx_instances`. A timezone and a dial-plan string on the PBX row should be what the template prints, including a second site that is not London.

7. **Stop the admin chrome from inventing health.** Client: CKM Handler sidebar and the profile explorer. Why: PR #4 fixed the measured PBX chip. The footer still says the process is online on port 443, and the unauthenticated preview endpoint hands out a config that contains a fake password. Drive the footer from the same probe as the chip. Require admin auth on `/api/admin/catalogs` and `/api/admin/catalogs/preview`. Leave `GET /provision/:filename` open; the phone has no admin session.

## What not to build

- **A second browser softphone inside `WEB`.** The React app is a layout with a timer. The PHP app already has SIP.js, two sessions, and the settings APIs. Porting SIP into React duplicates the only browser phone that places calls. Keep `WEB` as the visual preview, or redirect its Phone tab at `merlin-webapp`. Do not add call features there.

- **A Grandstream key map for every GXP and GRP, or SIP accounts past line 2.** PR #5 already records why: those P-values change by model, and account 2’s older transport value has no TLS. Two working accounts beat a third account that mis-sets transport.

- **A TR-069 configuration server.** `cwmpRoute.ts` answers Inform with InformResponse and can insert a discovery row. It does not set parameters, push firmware, or manage a session. Calling that GenieACS in the SOAP header oversells a probe. Option 66 plus the fleet screen is the provisioning product.

- **More firewall brands.** `routerTemplates.ts` already emits MikroTik, TP-Link, Technicolor, Cisco, DrayTek, Ubiquiti, UniFi, pfSense, OPNsense, Meraki, FortiGate, SonicWall, Sophos, and dnsmasq. Another template does not make a deskphone register.

- **Scraping Yealink, Poly, or Cisco firmware portals.** Those brands have no stable direct URL in the catalog. Keep the upload button. Auto-download stays on Snom and Grandstream, where `directDownloadUrl` exists.

- **A mobile rewrite to look complete.** Android and the SwiftUI iPhone app are present and are not the desk product. Windows, Mac, the PHP phone, and the handler are the surfaces a customer hits. Parking feature work in `Beta/` while `MerlinSIP` is the published Windows app splits the same phone in two.

- **Call recording or packet capture on the handler.** The live shell is provisioning telemetry. Windows already records the call audio on the PC. Putting media on the handler fights the GDPR split between `system.db` and the vault, and it is not what the Logs button is for.

- **An admin password on the phone boot URL.** Phones request `/provision/:filename` with no cookie. The control is “this MAC is registered, and the extension is active.” A login wall there stops every handset from booting.
