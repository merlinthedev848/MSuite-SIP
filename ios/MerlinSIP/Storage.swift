import Foundation
import Security

enum PhoneStorage {
    private static let accountKey = "merlin.sip.account"
    private static let contactsFile = "contacts.json"
    private static let historyFile = "history.json"
    private static let speakerKey = "merlin.sip.speaker"

    static func loadAccount() -> SipAccount? {
        guard let data = UserDefaults.standard.data(forKey: accountKey) else { return nil }
        return try? JSONDecoder().decode(SipAccount.self, from: data)
    }

    static func saveAccount(_ account: SipAccount) {
        if let data = try? JSONEncoder().encode(account) {
            UserDefaults.standard.set(data, forKey: accountKey)
        }
    }

    static func clearAccount() {
        UserDefaults.standard.removeObject(forKey: accountKey)
    }

    static var speakerEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: speakerKey) }
        set { UserDefaults.standard.set(newValue, forKey: speakerKey) }
    }

    static func loadContacts() -> [Contact] {
        load([Contact].self, file: contactsFile) ?? []
    }

    static func saveContacts(_ contacts: [Contact]) {
        save(contacts, file: contactsFile)
    }

    static func loadHistory() -> [CallRecord] {
        load([CallRecord].self, file: historyFile) ?? []
    }

    static func saveHistory(_ history: [CallRecord]) {
        save(Array(history.prefix(200)), file: historyFile)
    }

    private static func directory() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MerlinSIP", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }

    private static func load<T: Decodable>(_ type: T.Type, file: String) -> T? {
        let url = directory().appendingPathComponent(file)
        guard let data = try? Data(contentsOf: url) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(type, from: data)
    }

    private static func save<T: Encodable>(_ value: T, file: String) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(value) else { return }
        try? data.write(to: directory().appendingPathComponent(file), options: .atomic)
    }
}

enum KeychainStore {
    private static let service = "media.chriskendall.MerlinSIP"
    private static let account = "sip-password"

    static func setPassword(_ password: String) {
        let data = Data(password.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    static func password() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
