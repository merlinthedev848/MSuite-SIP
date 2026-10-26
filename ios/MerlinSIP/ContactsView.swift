import SwiftUI

struct ContactsView: View {
    @EnvironmentObject private var phone: PhoneModel
    var onCall: (String) -> Void
    @State private var query = ""
    @State private var adding = false
    @State private var name = ""
    @State private var number = ""

    private var rows: [Contact] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return phone.contacts }
        return phone.contacts.filter {
            $0.name.lowercased().contains(needle) || $0.number.lowercased().contains(needle)
        }
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                SearchBar(prompt: "Search contacts...", text: $query)
                Button {
                    name = ""
                    number = ""
                    adding = true
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 42, height: 42)
                        .background(Theme.gold)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            if rows.isEmpty {
                Spacer()
                EmptyHint(icon: "person.crop.circle", text: phone.contacts.isEmpty ? "No contacts yet." : "No matching contacts.")
                Spacer()
            } else {
                List {
                    ForEach(rows) { contact in
                        Button {
                            onCall(contact.number)
                        } label: {
                            PhoneRow(title: contact.name, subtitle: "Extension \(contact.number)", tint: Theme.amber, icon: "phone.fill")
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: 3, leading: 0, bottom: 3, trailing: 0))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .swipeActions {
                            Button("Delete", role: .destructive) { phone.deleteContact(contact) }
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .sheet(isPresented: $adding) {
            NavigationStack {
                VStack(alignment: .leading, spacing: 16) {
                    MerlinTextField(title: "Name", text: $name, prompt: "Reception", textInput: .name)
                    MerlinTextField(title: "Number", text: $number, prompt: "100", keyboard: .phonePad)
                    Button {
                        phone.addContact(name: name, number: number)
                        adding = false
                    } label: {
                        Text("Save contact")
                    }
                    .buttonStyle(GoldButtonStyle(enabled: !name.trimmingCharacters(in: .whitespaces).isEmpty && !number.trimmingCharacters(in: .whitespaces).isEmpty))
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || number.trimmingCharacters(in: .whitespaces).isEmpty)
                    Spacer()
                }
                .padding(20)
                .background(Theme.canvas)
                .navigationTitle("New contact")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { adding = false }
                    }
                }
            }
            .presentationDetents([.medium])
        }
    }
}
