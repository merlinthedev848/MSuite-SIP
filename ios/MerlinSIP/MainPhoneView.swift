import SwiftUI

enum PhoneTab: String, CaseIterable {
    case phone = "Phone"
    case history = "History"
    case contacts = "Contacts"
}

struct MainPhoneView: View {
    @EnvironmentObject private var phone: PhoneModel
    @State private var tab = PhoneTab.phone
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            header
            presenceBar
            tabBar
            Group {
                switch tab {
                case .phone:
                    DialPadView()
                case .history:
                    HistoryView { number in
                        tab = .phone
                        phone.destination = number
                    }
                case .contacts:
                    ContactsView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            footer
        }
        .background(Theme.canvas)
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(phone)
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            BrandMark(size: 28)
            Text("Merlin SIP")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.ink)
            Spacer()
            statusPill
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Color.white)
        .overlay(alignment: .bottom) { Divider().overlay(Theme.line) }
    }

    private var statusPill: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(phone.registered ? Theme.success : Theme.danger)
                .frame(width: 6, height: 6)
            Text(phone.registered ? "Connected" : "Offline")
                .font(.system(size: 10, weight: .bold))
        }
        .foregroundStyle(phone.registered ? Theme.successText : Theme.dangerText)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(phone.registered ? Theme.successBg : Theme.dangerBg)
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    }

    private var presenceBar: some View {
        HStack(spacing: 8) {
            presenceButton(.available, title: "Available")
            presenceButton(.busy, title: "Busy")
            presenceButton(.dnd, title: "DND")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.white)
    }

    private func presenceButton(_ status: LineStatus, title: String) -> some View {
        let selected = phone.lineStatus == status
        return Button {
            phone.selectLineStatus(status)
        } label: {
            Text(title)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(selected ? Theme.ink : Theme.muted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(selected ? fill(status) : Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(selected ? fill(status) : Theme.cardBorder, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private func fill(_ status: LineStatus) -> Color {
        switch status {
        case .available: return Theme.successBg
        case .busy: return Color(hex: 0xFEE2E2)
        case .dnd: return Color(hex: 0xFEE2E2)
        }
    }

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(PhoneTab.allCases, id: \.self) { item in
                Button {
                    tab = item
                } label: {
                    Text(item.rawValue)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(tab == item ? Theme.ink : Theme.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .overlay(alignment: .bottom) {
                            if tab == item {
                                Rectangle()
                                    .fill(Theme.amber)
                                    .frame(height: 2)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .background(Theme.canvas)
        .overlay(alignment: .bottom) { Divider().overlay(Theme.line) }
    }

    private var footer: some View {
        HStack {
            Button(action: phone.retryRegistration) {
                Text(phone.status)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .buttonStyle(.plain)
            Spacer(minLength: 12)
            Button("Settings") { showSettings = true }
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Theme.amber)
                .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.white)
        .overlay(alignment: .top) { Divider().overlay(Theme.line) }
    }
}
