import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var phone: PhoneModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmForget = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    accountCard
                    aboutCard
                    Button(action: phone.signOut) {
                        Text("Sign out")
                    }
                    .buttonStyle(GoldButtonStyle())
                    Button {
                        confirmForget = true
                    } label: {
                        Text("Forget this account")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(Theme.danger)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(.plain)
                }
                .padding(20)
            }
            .background(Theme.canvas)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog("Remove the saved SIP account from this iPhone?", isPresented: $confirmForget, titleVisibility: .visible) {
                Button("Forget account", role: .destructive) {
                    phone.forgetAccount()
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private var accountCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Account")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Theme.ink)
            row("Server", phone.account.server.isEmpty ? "—" : phone.account.server)
            row("Port", phone.portText)
            row("Extension", phone.account.extensionNumber.isEmpty ? "—" : phone.account.extensionNumber)
            row("Username", phone.account.username.isEmpty ? "—" : phone.account.username)
            row("Transport", "UDP")
            row("Audio", "G.711 PCMU / PCMA")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Theme.cardBorder, lineWidth: 1)
        )
    }

    private var aboutCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("About")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Theme.ink)
            Text("Merlin SIP for iPhone places and receives G.711 calls while the app is open. Keep it in the foreground to stay registered. Inbound calls after the app is closed need a later push setup.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            Text(versionLabel)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.muted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Theme.cardBorder, lineWidth: 1)
        )
    }

    private var versionLabel: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        let marketing = short.isEmpty || short.contains("$") ? "1.3.9.1" : short
        let current = build.isEmpty || build.contains("$") ? marketing : build
        return marketing == current ? "Version \(marketing)" : "Version \(marketing) (\(current))"
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(Theme.muted)
            Spacer()
            Text(value)
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.trailing)
        }
        .font(.system(size: 14))
    }
}
