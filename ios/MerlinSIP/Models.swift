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

    var title: String {
        name.isEmpty ? number : name
    }

    var subtitle: String {
        let when = CallRecord.format(startedAt)
        let length = duration > 0 ? CallRecord.format(duration: duration) : result
        return "\(direction.rawValue) · \(when) · \(length)"
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

enum SipEvent {
    case registration(ok: Bool, message: String)
    case incoming(IncomingState)
    case outgoing(LiveCallState)
    case progress(UUID, CallPhase, String)
    case media(UUID, muted: Bool, held: Bool, speaker: Bool)
    case ended(UUID, CallRecord)
    case incomingCleared(UUID)
    case notice(String)
}
