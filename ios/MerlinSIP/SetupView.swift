import SwiftUI

struct SetupView: View {
    @EnvironmentObject private var phone: PhoneModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                BrandMark()
                    .padding(.top, 12)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Merlin SIP")
                        .font(.system(size: 30, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    Text("Sign in with the SIP account for this phone.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                MerlinTextField(
                    title: "PBX server",
                    text: $phone.account.server,
                    prompt: "pbx.example.com",
                    keyboard: .URL,
                    textInput: .URL
                )
                MerlinTextField(
                    title: "Port",
                    text: $phone.portText,
                    prompt: "5060",
                    keyboard: .numberPad
                )
                MerlinTextField(
                    title: "Extension",
                    text: $phone.account.extensionNumber,
                    prompt: "100",
                    keyboard: .phonePad
                )
                MerlinTextField(
                    title: "Username",
                    text: $phone.account.username,
                    prompt: "SIP username",
                    textInput: .username
                )
                MerlinTextField(
                    title: "Password",
                    text: $phone.password,
                    prompt: "SIP password",
                    secure: true,
                    textInput: .password
                )
                MerlinTextField(
                    title: "Display name",
                    text: $phone.account.displayName,
                    prompt: "Optional",
                    textInput: .name
                )

                Button(action: phone.connect) {
                    Text("Connect")
                }
                .buttonStyle(GoldButtonStyle())
                .padding(.top, 4)

                if !phone.status.isEmpty && phone.status != "Enter the SIP account for this phone." && phone.status != "Signed out." {
                    Text(phone.status)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.danger)
                        .frame(maxWidth: .infinity, alignment: .center)
                }

                Text("Audio calls use G.711 over UDP.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 8)
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 28)
        }
        .background(Theme.canvas)
    }
}
