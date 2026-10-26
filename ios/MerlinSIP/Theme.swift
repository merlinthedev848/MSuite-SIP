import SwiftUI

enum Theme {
    static let ink = Color(hex: 0x111317)
    static let muted = Color(hex: 0x5D6B7C)
    static let panel = Color(hex: 0xF3F4F6)
    static let line = Color(hex: 0xE2E8F0)
    static let amber = Color(hex: 0xD97706)
    static let goldTop = Color(hex: 0xFCD34D)
    static let goldBottom = Color(hex: 0xFBBF24)
    static let danger = Color(hex: 0xEF4444)
    static let dangerDeep = Color(hex: 0xDC2626)
    static let success = Color(hex: 0x10B981)
    static let successBg = Color(hex: 0xDFF8EE)
    static let successText = Color(hex: 0x0F513F)
    static let dangerBg = Color(hex: 0xF8D7DA)
    static let dangerText = Color(hex: 0x842029)
    static let canvas = Color(hex: 0xF4F7FB)
    static let night = Color(hex: 0x111317)
    static let brand = Color(hex: 0x101622)
    static let fieldBorder = Color(hex: 0xD4C9B3)
    static let cardBorder = Color(hex: 0xCBD5E1)
    static let inbound = Color(hex: 0x2563EB)
    static let slate = Color(hex: 0x94A3B8)

    static let gold = LinearGradient(
        colors: [goldTop, goldBottom],
        startPoint: .top,
        endPoint: .bottom
    )

    static let dangerFill = LinearGradient(
        colors: [danger, dangerDeep],
        startPoint: .top,
        endPoint: .bottom
    )
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        let red = Double((hex >> 16) & 0xFF) / 255
        let green = Double((hex >> 8) & 0xFF) / 255
        let blue = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
}

struct GoldButtonStyle: ButtonStyle {
    var enabled: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Theme.gold)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .opacity(enabled ? (configuration.isPressed ? 0.82 : 1) : 0.45)
            .offset(y: configuration.isPressed ? 1 : 0)
    }
}

struct DangerButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Theme.dangerFill)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .opacity(configuration.isPressed ? 0.82 : 1)
            .offset(y: configuration.isPressed ? 1 : 0)
    }
}

struct FieldLabel: View {
    var text: String

    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct MerlinTextField: View {
    var title: String
    var text: Binding<String>
    var prompt: String
    var secure: Bool = false
    var keyboard: UIKeyboardType = .default
    var textInput: TextContentType? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            FieldLabel(text: title)
            Group {
                if secure {
                    SecureField(prompt, text: text)
                } else {
                    TextField(prompt, text: text)
                        .keyboardType(keyboard)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .textContentType(textInput)
            .font(.system(size: 16))
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .background(Color.white)
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Theme.fieldBorder, lineWidth: 1)
            )
        }
    }
}

struct SearchBar: View {
    var prompt: String
    @Binding var text: String
    var onClear: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.muted)
            TextField(prompt, text: $text)
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if let onClear {
                Button(action: onClear) {
                    Image(systemName: "trash")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Theme.cardBorder, lineWidth: 1)
        )
    }
}

struct PhoneRow: View {
    var title: String
    var subtitle: String
    var tint: Color = Theme.muted
    var icon: String

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(tint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Theme.line, lineWidth: 1)
        )
    }
}

struct EmptyHint: View {
    var icon: String
    var text: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 28, weight: .regular))
            Text(text)
                .font(.system(size: 13))
                .multilineTextAlignment(.center)
        }
        .foregroundStyle(Theme.muted)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
    }
}

struct BrandMark: View {
    var size: CGFloat = 54

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.26, style: .continuous)
                .fill(Theme.brand)
            Image("Logo")
                .resizable()
                .scaledToFit()
                .padding(size * 0.18)
        }
        .frame(width: size, height: size)
    }
}
