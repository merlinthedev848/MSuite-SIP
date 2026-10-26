import AVFoundation
import Foundation

@MainActor
final class PhoneModel: ObservableObject {
    @Published var account = SipAccount(server: "", port: 5060, extensionNumber: "", username: "", displayName: "")
    @Published var portText = "5060"
    @Published var password = ""
    @Published var signedIn = false
    @Published var registered = false
    @Published var status = "Enter the SIP account for this phone."
    @Published var destination = ""
    @Published var contacts: [Contact] = []
    @Published var history: [CallRecord] = []
    @Published var liveCall: LiveCallState?
    @Published var incoming: IncomingState?
    @Published var speaker = false

    private let engine = SipEngine()
    private let bridge = CallKitBridge()
    private var callKitIds = Set<UUID>()
    private var localEnds = Set<UUID>()

    init() {
        contacts = PhoneStorage.loadContacts()
        history = PhoneStorage.loadHistory()
        speaker = PhoneStorage.speakerEnabled
        if let saved = PhoneStorage.loadAccount() {
            account = saved
            portText = String(saved.port)
            password = KeychainStore.password() ?? ""
            signedIn = !password.isEmpty
        }
        wire()
        if signedIn {
            engine.setSpeaker(speaker)
            engine.start(account: account, password: password)
            requestMicrophone()
        }
    }

    func connect() {
        guard let parsed = validatedAccount() else { return }
        account = parsed
        portText = String(parsed.port)
        PhoneStorage.saveAccount(parsed)
        KeychainStore.setPassword(password)
        signedIn = true
        registered = false
        status = "Registering..."
        engine.setSpeaker(speaker)
        engine.start(account: parsed, password: password)
        requestMicrophone()
    }

    func signOut() {
        engine.stop()
        signedIn = false
        registered = false
        liveCall = nil
        incoming = nil
        status = "Signed out."
    }

    func forgetAccount() {
        signOut()
        KeychainStore.clear()
        PhoneStorage.clearAccount()
        password = ""
        portText = "5060"
        account = SipAccount(server: "", port: 5060, extensionNumber: "", username: "", displayName: "")
        status = "Enter the SIP account for this phone."
    }

    func becameActive() {
        guard signedIn else { return }
        engine.refresh()
    }

    func retryRegistration() {
        guard signedIn else { return }
        status = "Registering..."
        engine.start(account: account, password: password)
    }

    func call(_ number: String) {
        let target = number.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !target.isEmpty else { return }
        guard registered else {
            status = "Register the phone before calling."
            return
        }
        guard liveCall == nil, incoming == nil else { return }
        let uuid = UUID()
        let name = contactName(for: target) ?? target
        AVAudioApplication.requestRecordPermission { [weak self] granted in
            Task { @MainActor in
                guard let self else { return }
                guard granted else {
                    self.status = "Allow microphone access to place calls."
                    return
                }
                self.callKitIds.insert(uuid)
                self.bridge.startOutgoing(uuid: uuid, number: target, name: name) { started in
                    Task { @MainActor in
                        guard !started else { return }
                        self.callKitIds.remove(uuid)
                        self.activateAudioFallback()
                        self.engine.placeCall(number: target, uuid: uuid)
                    }
                }
            }
        }
    }

    func answer() {
        guard let incoming else { return }
        if callKitIds.contains(incoming.id) {
            bridge.answer(incoming.id)
        } else {
            activateAudioFallback()
        }
        engine.answer()
    }

    func hangup() {
        let id = liveCall?.id ?? incoming?.id
        guard let id else { return }
        if callKitIds.contains(id) {
            localEnds.insert(id)
            bridge.end(id)
        }
        engine.hangup()
    }

    func toggleMute() {
        guard let liveCall else { return }
        engine.setMuted(!liveCall.muted)
    }

    func toggleHold() {
        guard let liveCall else { return }
        engine.setHeld(!liveCall.held)
    }

    func toggleSpeaker() {
        speaker.toggle()
        PhoneStorage.speakerEnabled = speaker
        engine.setSpeaker(speaker)
        if var liveCall {
            liveCall.speaker = speaker
            self.liveCall = liveCall
        }
    }

    func sendDigits(_ digits: String) {
        engine.sendDtmf(digits)
    }

    func addContact(name: String, number: String) {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedNumber = number.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, !trimmedNumber.isEmpty else { return }
        if let index = contacts.firstIndex(where: { $0.number == trimmedNumber }) {
            contacts[index].name = trimmedName
        } else {
            contacts.append(Contact(id: UUID(), name: trimmedName, number: trimmedNumber))
        }
        contacts.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        PhoneStorage.saveContacts(contacts)
    }

    func deleteContact(_ contact: Contact) {
        contacts.removeAll { $0.id == contact.id }
        PhoneStorage.saveContacts(contacts)
    }

    func clearHistory() {
        history = []
        PhoneStorage.saveHistory([])
    }

    func contactName(for number: String) -> String? {
        contacts.first { $0.number == number }?.name
    }

    private func wire() {
        engine.onEvent = { [weak self] event in
            Task { @MainActor in
                self?.handle(event)
            }
        }
        bridge.onStart = { [weak self] uuid, number in
            Task { @MainActor in self?.engine.placeCall(number: number, uuid: uuid) }
        }
        bridge.onAnswer = { [weak self] _ in
            Task { @MainActor in self?.engine.answer() }
        }
        bridge.onEnd = { [weak self] id in
            Task { @MainActor in
                self?.localEnds.insert(id)
                self?.engine.hangup()
            }
        }
        bridge.onMute = { [weak self] _, muted in
            Task { @MainActor in self?.engine.setMuted(muted) }
        }
        bridge.onHold = { [weak self] _, held in
            Task { @MainActor in self?.engine.setHeld(held) }
        }
        bridge.onDTMF = { [weak self] _, digits in
            Task { @MainActor in self?.engine.sendDtmf(digits) }
        }
        bridge.onAudio = { [weak self] active in
            Task { @MainActor in
                if active {
                    self?.engine.audioSessionActivated()
                } else {
                    self?.engine.audioSessionDeactivated()
                }
            }
        }
    }

    private func handle(_ event: SipEvent) {
        switch event {
        case .registration(let ok, let message):
            registered = ok
            status = message
        case .incoming(let call):
            let named = IncomingState(id: call.id, number: call.number, name: contactName(for: call.number) ?? call.name)
            incoming = named
            callKitIds.insert(named.id)
            bridge.reportIncoming(named) { [weak self] accepted in
                Task { @MainActor in
                    if !accepted { self?.callKitIds.remove(named.id) }
                }
            }
        case .outgoing(let state):
            var copy = named(state)
            if copy.phase == .connected && liveCall?.phase != .connected && callKitIds.contains(copy.id) {
                bridge.reportConnected(copy.id)
            }
            liveCall = copy
            if incoming?.id == copy.id { incoming = nil }
        case .progress(let id, let phase, _):
            guard var copy = liveCall, copy.id == id else { return }
            copy.phase = phase
            if phase == .connected, copy.connectedAt == nil { copy.connectedAt = Date() }
            liveCall = copy
        case .media(let id, let muted, let held, let speaker):
            guard var copy = liveCall, copy.id == id else { return }
            copy.muted = muted
            copy.held = held
            copy.speaker = speaker
            copy.phase = held ? .held : (copy.connectedAt == nil ? copy.phase : .connected)
            liveCall = copy
            self.speaker = speaker
        case .ended(let id, var record):
            if record.name.isEmpty, let name = contactName(for: record.number) {
                record.name = name
            }
            history.insert(record, at: 0)
            PhoneStorage.saveHistory(history)
            if liveCall?.id == id { liveCall = nil }
            if incoming?.id == id { incoming = nil }
            if localEnds.remove(id) != nil {
                callKitIds.remove(id)
            } else if callKitIds.remove(id) != nil {
                let kind: CallEndKind
                switch record.result {
                case "Answered": kind = .remote
                case "Missed", "Cancelled", "No Answer", "Declined", "Busy": kind = .unanswered
                default: kind = .failed
                }
                bridge.reportEnded(id, kind: kind)
            }
        case .incomingCleared(let id):
            if incoming?.id == id { incoming = nil }
        case .notice(let message):
            status = message
        }
    }

    private func named(_ state: LiveCallState) -> LiveCallState {
        var copy = state
        if let name = contactName(for: state.number) {
            copy.name = name
        }
        return copy
    }

    private func validatedAccount() -> SipAccount? {
        var server = account.server.trimmingCharacters(in: .whitespacesAndNewlines)
        if server.lowercased().hasPrefix("sip:") {
            server = String(server.dropFirst(4))
        }
        server = server.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        var port = Int(portText.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        if server.filter({ $0 == ":" }).count > 1 {
            status = "This phone uses IPv4. Enter a hostname or IPv4 address."
            return nil
        }
        if let colon = server.lastIndex(of: ":"), server.firstIndex(of: ":") == colon {
            let suffix = String(server[server.index(after: colon)...])
            if let embedded = Int(suffix) {
                server = String(server[..<colon])
                if port == 0 || portText.trimmingCharacters(in: .whitespacesAndNewlines) == "5060" {
                    port = embedded
                }
            }
        }
        if port == 0 { port = 5060 }
        guard !server.isEmpty else { status = "Enter the PBX server."; return nil }
        guard (1...65535).contains(port) else { status = "Enter a valid SIP port."; return nil }
        let ext = account.extensionNumber.trimmingCharacters(in: .whitespacesAndNewlines)
        let username = account.username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !ext.isEmpty else { status = "Enter the extension."; return nil }
        guard !username.isEmpty, !password.isEmpty else {
            status = "Enter the username and password."
            return nil
        }
        return SipAccount(
            server: server,
            port: port,
            extensionNumber: ext,
            username: username,
            displayName: account.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    private func requestMicrophone() {
        AVAudioApplication.requestRecordPermission { [weak self] granted in
            Task { @MainActor in
                guard let self, !granted else { return }
                self.status = "Allow microphone access to place and answer calls."
            }
        }
    }

    private func activateAudioFallback() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
        try? session.setPreferredIOBufferDuration(0.02)
        try? session.setActive(true)
        if speaker {
            try? session.overrideOutputAudioPort(.speaker)
        }
        engine.audioSessionActivated()
    }
}
