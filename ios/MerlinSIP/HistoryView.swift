import SwiftUI

struct HistoryView: View {
    @EnvironmentObject private var phone: PhoneModel
    var onSelect: (String) -> Void
    @State private var query = ""
    @State private var confirmClear = false

    private var rows: [CallRecord] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return phone.history }
        return phone.history.filter {
            $0.number.lowercased().contains(needle) || $0.name.lowercased().contains(needle)
        }
    }

    private var clearHistory: (() -> Void)? {
        guard !phone.history.isEmpty else { return nil }
        return { confirmClear = true }
    }

    var body: some View {
        VStack(spacing: 12) {
            SearchBar(prompt: "Search history...", text: $query, onClear: clearHistory)
            if rows.isEmpty {
                Spacer()
                EmptyHint(icon: "clock", text: "No call history recorded.")
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 6) {
                        ForEach(rows) { record in
                            Button {
                                onSelect(record.number)
                            } label: {
                                PhoneRow(
                                    title: record.title,
                                    subtitle: record.subtitle,
                                    tint: color(record.direction),
                                    icon: icon(record.direction)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.bottom, 12)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .confirmationDialog("Clear all call history?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Clear history", role: .destructive) { phone.clearHistory() }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func color(_ direction: CallDirection) -> Color {
        switch direction {
        case .inbound: return Theme.inbound
        case .outbound: return Theme.success
        case .missed: return Theme.danger
        }
    }

    private func icon(_ direction: CallDirection) -> String {
        switch direction {
        case .inbound: return "phone.arrow.down.left"
        case .outbound: return "phone.arrow.up.right"
        case .missed: return "phone.down"
        }
    }
}
