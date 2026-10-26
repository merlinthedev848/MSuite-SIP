import AudioToolbox
import SwiftUI

struct DialPadView: View {
    @EnvironmentObject private var phone: PhoneModel

    private let keys: [(String, String)] = [
        ("1", ""), ("2", "ABC"), ("3", "DEF"),
        ("4", "GHI"), ("5", "JKL"), ("6", "MNO"),
        ("7", "PQRS"), ("8", "TUV"), ("9", "WXYZ"),
        ("*", ""), ("0", "+"), ("#", "")
    ]

    var body: some View {
        VStack(spacing: 22) {
            destination
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 18), count: 3), spacing: 14) {
                ForEach(keys, id: \.0) { key in
                    dialKey(key.0, letters: key.1)
                }
            }
            .padding(.horizontal, 28)
            Button {
                phone.call(phone.destination)
            } label: {
                Label("Call", systemImage: "phone.fill")
            }
            .buttonStyle(GoldButtonStyle(enabled: phone.registered && !phone.destination.isEmpty))
            .disabled(!phone.registered || phone.destination.isEmpty)
            .padding(.horizontal, 28)
            Spacer(minLength: 0)
        }
        .padding(.top, 18)
    }

    private var destination: some View {
        HStack(spacing: 8) {
            TextField("Extension or number", text: $phone.destination)
                .font(.system(size: 28, weight: .medium))
                .foregroundStyle(Theme.ink)
                .keyboardType(.phonePad)
                .multilineTextAlignment(.center)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !phone.destination.isEmpty {
                Button {
                    phone.destination = String(phone.destination.dropLast())
                } label: {
                    Image(systemName: "delete.left")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(Theme.muted)
                }
                .buttonStyle(.plain)
                .simultaneousGesture(LongPressGesture().onEnded { _ in
                    phone.destination = ""
                })
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Theme.fieldBorder, lineWidth: 1)
        )
        .padding(.horizontal, 20)
    }

    private func dialKey(_ number: String, letters: String) -> some View {
        Button {
            phone.destination.append(number)
            AudioServicesPlaySystemSound(1104)
        } label: {
            VStack(spacing: 1) {
                Text(number)
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(Theme.ink)
                Text(letters)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(height: 11)
            }
        }
        .buttonStyle(DialKeyStyle())
    }
}

private struct DialKeyStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .aspectRatio(1, contentMode: .fit)
            .background(configuration.isPressed ? Theme.goldTop : Color.white)
            .clipShape(Circle())
            .overlay(Circle().stroke(configuration.isPressed ? Theme.goldTop : Theme.cardBorder, lineWidth: 1))
            .offset(y: configuration.isPressed ? 1 : 0)
    }
}
