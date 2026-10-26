import AudioToolbox
import SwiftUI

struct ActiveCallView: View {
    @EnvironmentObject private var phone: PhoneModel
    @State private var keypad = false
    @State private var digits = ""

    var body: some View {
        if let call = phone.liveCall {
            ZStack {
                Theme.night.ignoresSafeArea()
                VStack(spacing: 0) {
                    Spacer()
                    avatar(call)
                    Text(call.title)
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .padding(.top, 18)
                    if call.name != call.number && !call.name.isEmpty {
                        Text(call.number)
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(Theme.slate)
                            .padding(.top, 4)
                    }
                    status(call)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.slate)
                        .padding(.top, 8)
                    if keypad {
                        dtmfPad
                            .padding(.top, 22)
                    } else {
                        controls(call)
                            .padding(.top, 36)
                    }
                    Button {
                        keypad.toggle()
                    } label: {
                        Text(keypad ? "Hide keypad" : "Keypad")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(keypad ? Theme.goldTop : Theme.slate)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 18)
                    Button(action: phone.hangup) {
                        Label("Hang Up", systemImage: "phone.down.fill")
                    }
                    .buttonStyle(DangerButtonStyle())
                    .frame(width: 180)
                    .padding(.top, 22)
                    .padding(.bottom, 28)
                }
                .padding(.horizontal, 28)
            }
        }
    }

    private func avatar(_ call: LiveCallState) -> some View {
        ZStack {
            Circle()
                .fill(Color(hex: 0xFCD34D, alpha: 0.12))
            Circle()
                .stroke(Theme.goldTop, lineWidth: 2)
            Text(initials(call.title))
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(Theme.goldTop)
        }
        .frame(width: 92, height: 92)
    }

    private func status(_ call: LiveCallState) -> some View {
        Group {
            if (call.phase == .connected || call.phase == .held), let start = call.connectedAt {
                TimelineView(.periodic(from: start, by: 1)) { context in
                    let elapsed = Int(context.date.timeIntervalSince(start))
                    Text("\(call.phase.label)  \(elapsed / 60):\(String(format: "%02d", elapsed % 60))")
                }
            } else {
                Text(call.phase.label)
            }
        }
    }

    private func controls(_ call: LiveCallState) -> some View {
        HStack(spacing: 22) {
            actionButton(title: call.muted ? "Unmute" : "Mute", system: call.muted ? "mic.slash.fill" : "mic.fill", active: call.muted, action: phone.toggleMute)
            actionButton(title: call.held ? "Resume" : "Hold", system: call.held ? "play.fill" : "pause.fill", active: call.held, action: phone.toggleHold)
            actionButton(title: "Speaker", system: call.speaker ? "speaker.wave.2.fill" : "speaker.fill", active: call.speaker, action: phone.toggleSpeaker)
        }
    }

    private func actionButton(title: String, system: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: system)
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 52, height: 52)
                    .background(active ? Color(hex: 0xFCD34D, alpha: 0.2) : Color.white.opacity(0.06))
                    .overlay(Circle().stroke(active ? Theme.goldTop : Color.white.opacity(0.12), lineWidth: 1))
                    .clipShape(Circle())
                Text(title)
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundStyle(active ? Theme.goldTop : Theme.slate)
        }
        .buttonStyle(.plain)
        .opacity(phone.liveCall?.connectedAt == nil && title != "Speaker" ? 0.35 : 1)
        .disabled(phone.liveCall?.connectedAt == nil && title != "Speaker")
    }

    private var dtmfPad: some View {
        VStack(spacing: 12) {
            Text(digits.isEmpty ? " " : digits)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(.white)
                .lineLimit(1)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 10) {
                ForEach(["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"], id: \.self) { digit in
                    Button {
                        digits.append(digit)
                        phone.sendDigits(digit)
                        AudioServicesPlaySystemSound(1104)
                    } label: {
                        Text(digit)
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(Color.white.opacity(0.06))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func initials(_ text: String) -> String {
        let parts = text.split { $0 == " " || $0 == "." || $0 == "-" }
        if parts.count >= 2 {
            return (String(parts[0].prefix(1)) + String(parts[1].prefix(1))).uppercased()
        }
        return String(text.prefix(2)).uppercased()
    }
}

struct IncomingCallView: View {
    @EnvironmentObject private var phone: PhoneModel

    var body: some View {
        if let incoming = phone.incoming {
            ZStack {
                Theme.night.ignoresSafeArea()
                VStack(spacing: 0) {
                    HStack(spacing: 10) {
                        BrandMark(size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Incoming call")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundStyle(.white)
                            Text("Merlin SIP")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Theme.slate)
                        }
                        Spacer()
                    }
                    .padding(.top, 24)
                    Spacer()
                    Text(incoming.title)
                        .font(.system(size: 32, weight: .bold))
                        .foregroundStyle(Theme.goldTop)
                        .multilineTextAlignment(.center)
                    if incoming.name != incoming.number && !incoming.name.isEmpty {
                        Text(incoming.number)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.slate)
                            .padding(.top, 6)
                    }
                    Spacer()
                    HStack(spacing: 12) {
                        Button(action: phone.answer) {
                            Label("Answer", systemImage: "phone.fill")
                        }
                        .buttonStyle(GoldButtonStyle())
                        Button(action: phone.hangup) {
                            Label("Decline", systemImage: "phone.down.fill")
                        }
                        .buttonStyle(DangerButtonStyle())
                    }
                    .padding(.bottom, 28)
                }
                .padding(.horizontal, 24)
            }
        }
    }
}
