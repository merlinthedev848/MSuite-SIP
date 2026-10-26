# Merlin SIP for iPhone

Native SwiftUI softphone that follows the Merlin SIP theme. This build is the phone only: SIP registration, inbound and outbound G.711 calls, mute, hold, keypad tones, speaker, contacts, and call history.

Video, chat, licensing, provisioning, diagnostics, transfer, recording, and a second line are not included.

## Open

Open `ios/MerlinSIP.xcodeproj` in Xcode on a Mac, select your team, and run it on an iPhone. A real device is required for microphone calls. The simulator can show the interface, but it is not a useful audio test.

## Account

Enter the PBX hostname, UDP port (usually 5060), extension, username, and password. The password is stored in the Keychain.

The phone registers over UDP and keeps the registration while the app is open. Leave it in the foreground to stay registered. Audio continues if you switch away during a call. Inbound calls after the app has been closed need a later push-notification setup.

## PBX

- Codec: G.711 PCMU or PCMA, plus RFC 2833 DTMF.
- Transport: UDP.
- For phones behind NAT, enable symmetric RTP on the PBX (Asterisk: `rtp_symmetric=yes` and `direct_media=no`).
