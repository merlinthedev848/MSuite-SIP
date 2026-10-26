import Foundation

struct SipAccount: Codable, Equatable {
    var server: String
    var port: Int
    var extensionNumber: String
    var username: String
    var displayName: String

    var domain: String {
        server.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var sipIdentity: String {
        "\(extensionNumber)@\(domain)"
    }
}

enum CallPhase: String, Codable {
    case dialing
    case ringing
    case connecting
    case connected
    case held
    case ending

    var label: String {
        switch self {
        case .dialing: return "Dialing..."
        case .ringing: return "Ringing..."
        case .connecting: return "Connecting..."
        case .connected: return "Connected"
        case .held: return "On hold"
        case .ending: return "Ending..."
        }
    }
}

struct LiveCallState: Identifiable, Equatable {
    var id: UUID
    var number: String
    var name: String
    var phase: CallPhase
    var muted: Bool
    var held: Bool
    var speaker: Bool
    var connectedAt: Date?

    var title: String {
        name.isEmpty || name == number ? number : name
    }
}

struct IncomingState: Identifiable, Equatable {
    var id: UUID
    var number: String
    var name: String

    var title: String {
        name.isEmpty || name == number ? number : name
    }
}

struct Contact: Identifiable, Codable, Equatable {
    var id: UUID
    var name: String
    var number: String
    var presence: String = "Offline"

    enum CodingKeys: String, CodingKey {
        case id, name, number
    }

    var initials: String {
        let source = name.isEmpty ? number : name
        let parts = source.split { $0 == " " || $0 == "." || $0 == "-" }
        if parts.count >= 2 {
            let first = parts[0].first.map(String.init) ?? ""
            let second = parts[1].first.map(String.init) ?? ""
            return (first + second).uppercased()
        }
        return String(source.prefix(2)).uppercased()
    }

    var presenceLabel: String {
        switch presence {
        case "Do Not Disturb": return "DND"
        case "Appear Away": return "Away"
        case "": return "Offline"
        default: return presence
        }
    }

    var blfDialNumber: String {
        presence == "Ringing" ? DeskPhone.directedPickup + number : number
    }

    var callSubtitle: String {
        presence == "Ringing" ? "Ringing · tap to pick up" : "\(presenceLabel) · \(number)"
    }
}

enum CallDirection: String, Codable {
    case inbound = "Inbound"
    case outbound = "Outbound"
    case missed = "Missed"
}

struct CallRecord: Identifiable, Codable, Equatable {
    var id: UUID
    var number: String
    var name: String
    var direction: CallDirection
    var startedAt: Date
    var duration: TimeInterval
    var result: String
    var quality: String = "Not measured"

    enum CodingKeys: String, CodingKey {
        case id, number, name, direction, startedAt, duration, result, quality
    }

    init(id: UUID, number: String, name: String, direction: CallDirection, startedAt: Date, duration: TimeInterval, result: String, quality: String = "Not measured") {
        self.id = id
        self.number = number
        self.name = name
        self.direction = direction
        self.startedAt = startedAt
        self.duration = duration
        self.result = result
        self.quality = quality
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        number = try container.decode(String.self, forKey: .number)
        name = try container.decode(String.self, forKey: .name)
        direction = try container.decode(CallDirection.self, forKey: .direction)
        startedAt = try container.decode(Date.self, forKey: .startedAt)
        duration = try container.decode(TimeInterval.self, forKey: .duration)
        result = try container.decode(String.self, forKey: .result)
        quality = try container.decodeIfPresent(String.self, forKey: .quality) ?? "Not measured"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(number, forKey: .number)
        try container.encode(name, forKey: .name)
        try container.encode(direction, forKey: .direction)
        try container.encode(startedAt, forKey: .startedAt)
        try container.encode(duration, forKey: .duration)
        try container.encode(result, forKey: .result)
        try container.encode(quality, forKey: .quality)
    }

    var title: String {
        name.isEmpty ? number : name
    }

    var subtitle: String {
        let when = CallRecord.format(startedAt)
        let length = duration > 0 ? CallRecord.format(duration: duration) : result
        return "\(direction.rawValue) · \(when) · \(length) · \(quality)"
    }

    static func format(_ date: Date) -> String {
        let calendar = Calendar.current
        let time = date.formatted(date: .omitted, time: .shortened)
        if calendar.isDateInToday(date) { return time }
        if calendar.isDateInYesterday(date) { return "Yesterday \(time)" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    static func format(duration: TimeInterval) -> String {
        let total = max(0, Int(duration.rounded()))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

enum LineStatus: String, Codable {
    case available = "Available"
    case busy = "Busy"
    case dnd = "DND"
}

enum SipEvent {
    case registration(ok: Bool, message: String)
    case incoming(IncomingState)
    case outgoing(LiveCallState)
    case progress(UUID, CallPhase, String)
    case media(UUID, muted: Bool, held: Bool, speaker: Bool)
    case ended(UUID, CallRecord)
    case incomingCleared(UUID)
    case notice(String)
    case blf(String, String)
    case quality(String)
}

enum DeskPhone {
    static let oneTouchRecord = "*1"
    static let voicemail = "*2"
    static let groupPickup = "*4"
    static let directedPickup = "*04"
    static let intercom = "*5"
    static let park = "*6"
    static let forwardAllOn = "*71"
    static let dndOn = "*74"
    static let dndOff = "*074"
    static let busyHere = "BusyHere"
    static let availableNote = "Phone is on the hook and available"

    static func digits(_ value: String?) -> String {
        guard let value else { return "" }
        return String(value.filter { $0.isASCII && $0.isNumber })
    }

    static func intercomTo(_ extensionNumber: String) -> String {
        intercom + digits(extensionNumber)
    }

    static func forwardAll(to destination: String?) -> String {
        let target = digits(destination)
        return target.isEmpty ? forwardAllOn : forwardAllOn + target
    }

    static func dtmfEvents(_ code: String) -> [UInt8] {
        var events: [UInt8] = []
        for character in code {
            switch character {
            case "0"..."9":
                if let ascii = character.asciiValue {
                    events.append(ascii - UInt8(48))
                }
            case "*":
                events.append(10)
            case "#":
                events.append(11)
            default:
                break
            }
        }
        return events
    }

    static func normalize(_ value: String) -> String {
        var source = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if let user = sipUser(source) {
            source = user
        }
        return String(source.filter { $0.isNumber || $0 == "*" || $0 == "#" })
    }

    static func isBusyOrDnd(_ status: String?) -> Bool {
        guard let status else { return false }
        switch status.lowercased() {
        case "busy", "dnd", "do not disturb", "busyhere":
            return true
        default:
            return false
        }
    }

    static func presenceNote(_ status: String) -> String {
        isBusyOrDnd(status) ? busyHere : status
    }

    static func mos(latencyMs: Double, jitterMs: Double, lossPercent: Double) -> Double {
        let effective = latencyMs + (2 * jitterMs) + 10
        let delayImpairment = effective < 160 ? effective / 40 : (effective / 40) + ((effective - 160) / 10)
        let lossImpairment = 95 * (lossPercent / (lossPercent + 10))
        var rFactor = 93.2 - delayImpairment - lossImpairment
        if rFactor < 0 { rFactor = 0 }
        let score: Double
        if rFactor <= 0 {
            score = 1
        } else if rFactor >= 100 {
            score = 4.4
        } else {
            score = 1 + (0.035 * rFactor) + (rFactor * (rFactor - 60) * (100 - rFactor) * 0.000007)
        }
        return (min(4.4, max(1, score)) * 100).rounded() / 100
    }

    static func qualityLabel(receivedPackets: Int, latencyMeasured: Bool, latencyMs: Double, jitterMs: Double, lossPercent: Double) -> String {
        guard receivedPackets > 0, latencyMeasured, latencyMs > 0 else { return "Not measured" }
        let score = mos(latencyMs: latencyMs, jitterMs: jitterMs, lossPercent: lossPercent)
        return String(
            format: "%.1f MOS · %.0f ms · jitter %.1f ms · loss %.1f%%",
            locale: Locale(identifier: "en_US_POSIX"),
            arguments: [score, latencyMs, jitterMs, lossPercent]
        )
    }

    private static func sipUser(_ header: String) -> String? {
        let pattern = #"sip:([^@>;\s]+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: header, range: NSRange(header.startIndex..., in: header)),
              let range = Range(match.range(at: 1), in: header) else { return nil }
        return String(header[range])
    }
}

struct BlfChannels: Equatable {
    var dialog = ""
    var reachability = ""

    func applying(_ incoming: String, eventName: String) -> BlfChannels {
        let value = incoming.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return self }
        let source = eventName.split(separator: ";").first.map {
            String($0).trimmingCharacters(in: .whitespacesAndNewlines)
        } ?? ""
        let isDialog = source.caseInsensitiveCompare("dialog") == .orderedSame
        let isPresence = source.caseInsensitiveCompare("presence") == .orderedSame
        var copy = self
        if isDialog || (!isPresence && (value == "Ringing" || value == "Busy")) {
            copy.dialog = value
        } else {
            copy.reachability = value
        }
        return copy
    }

    func resolve() -> String {
        if dialog == "Ringing" || dialog == "Busy" {
            return dialog
        }
        switch reachability {
        case "Offline", "DND", "Away", "Busy", "Available":
            return reachability
        default:
            return "Offline"
        }
    }
}

enum BlfParser {
    static func state(in body: String) -> String {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return "" }

        if let note = firstGroup(text, pattern: #"<note>\s*([^<]+)\s*</note>|<dm:note>\s*([^<]+)\s*</dm:note>"#) {
            switch note.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "available": return "Available"
            case "away": return "Away"
            case "dnd", "do not disturb": return "DND"
            case "busy": return "Busy"
            case "offline": return "Offline"
            default: break
            }
        }

        if found(text, #"<rpid:do-not-disturb\s*/>|<ep:do-not-disturb\s*/>"#) { return "DND" }
        if found(text, #"<rpid:busy\s*/>|<rpid:on-the-phone\s*/>|<ep:busy\s*/>"#) { return "Busy" }
        if found(text, #"<rpid:away\s*/>|<rpid:be-right-back\s*/>|<ep:away\s*/>"#) { return "Away" }
        if found(text, #"<rpid:available\s*/>"#) { return "Available" }

        if text.range(of: "dialog-info", options: .caseInsensitive) != nil {
            if found(text, #"<state>\s*(?:early|trying)\s*</state>|<dialog[^>]*\sstate\s*=\s*[\"']?(?:early|trying)"#) {
                return "Ringing"
            }
            if found(text, #"<state>\s*confirmed\s*</state>|<dialog[^>]*\sstate\s*=\s*[\"']?confirmed"#) {
                return "Busy"
            }
            if found(text, #"<state>\s*terminated\s*</state>|<dialog[^>]*\sstate\s*=\s*[\"']?terminated"#) {
                return "Available"
            }
            return "Available"
        }

        if found(text, #"<basic>\s*closed\s*</basic>"#) { return "Offline" }
        if found(text, #"<basic>\s*open\s*</basic>"#) { return "Available" }

        let lower = text.lowercased()
        if lower.contains("busy") || lower.contains("inuse") { return "Busy" }
        if lower.contains("ring") || lower.contains("early") { return "Ringing" }
        if lower.contains("dnd") { return "DND" }
        if lower.contains("away") { return "Away" }
        if lower.contains("open") || lower.contains("available") || lower.contains("idle") { return "Available" }
        return ""
    }

    static func extensionNumber(in body: String) -> String {
        let patterns = [
            #"entity\s*=\s*[\"']?(?:sip:)?([^@\"'>;\s]+)"#,
            #"<tuple\s+id\s*=\s*[\"']?(?:sip:)?([^@\"'>;\s]+)"#,
            #"<local>.*?<identity[^>]*>\s*(?:sip:)?([^<@>;\s]+)"#,
            #"<remote>.*?<identity[^>]*>\s*(?:sip:)?([^<@>;\s]+)"#,
            #"<identity[^>]*>\s*(?:sip:)?([^<@>;\s]+)"#
        ]
        for pattern in patterns {
            guard let candidate = firstGroup(body, pattern: pattern) else { continue }
            let normalized = DeskPhone.normalize(candidate)
            if !normalized.isEmpty && normalized.caseInsensitiveCompare("asterisk") != .orderedSame {
                return normalized
            }
        }
        return ""
    }

    private static func found(_ text: String, _ pattern: String) -> Bool {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive, .dotMatchesLineSeparators]) else {
            return false
        }
        let range = NSRange(text.startIndex..., in: text)
        return regex.firstMatch(in: text, options: [], range: range) != nil
    }

    private static func firstGroup(_ text: String, pattern: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive, .dotMatchesLineSeparators]) else {
            return nil
        }
        let range = NSRange(text.startIndex..., in: text)
        guard let match = regex.firstMatch(in: text, options: [], range: range) else { return nil }
        for index in 1..<match.numberOfRanges {
            if let group = Range(match.range(at: index), in: text) {
                let value = String(text[group]).trimmingCharacters(in: .whitespacesAndNewlines)
                if !value.isEmpty { return value }
            }
        }
        return nil
    }
}
