import Foundation
import CryptoKit

struct SipPacket {
    var startLine: String
    var headers: [(name: String, value: String)]
    var body: String

    var isResponse: Bool {
        startLine.uppercased().hasPrefix("SIP/2.0")
    }

    var statusCode: Int {
        let parts = startLine.split(separator: " ", omittingEmptySubsequences: true)
        guard parts.count >= 2 else { return 0 }
        return Int(parts[1]) ?? 0
    }

    var reason: String {
        let parts = startLine.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true)
        return parts.count >= 3 ? String(parts[2]) : ""
    }

    var method: String {
        if isResponse { return cseqMethod }
        return startLine.split(separator: " ").first.map(String.init) ?? ""
    }

    var callId: String { value("Call-ID") ?? value("i") ?? "" }
    var cseq: String { value("CSeq") ?? "" }

    var cseqNumber: Int {
        Int(cseq.split(separator: " ").first.map(String.init) ?? "") ?? 0
    }

    var cseqMethod: String {
        cseq.split(separator: " ").last.map { String($0).uppercased() } ?? ""
    }

    func values(_ name: String) -> [String] {
        headers.compactMap { header in
            header.name.caseInsensitiveCompare(name) == .orderedSame ? header.value : nil
        }
    }

    func value(_ name: String) -> String? {
        values(name).first
    }

    static func parse(_ raw: String) -> SipPacket? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.uppercased().contains("SIP/2.0") else { return nil }

        let split = splitHeadAndBody(trimmed)
        let headerLines = split.head.components(separatedBy: "\n").map {
            $0.trimmingCharacters(in: .init(charactersIn: "\r"))
        }.filter { !$0.isEmpty }
        guard let start = headerLines.first else { return nil }

        var headers: [(name: String, value: String)] = []
        for line in headerLines.dropFirst() {
            if line.first == " " || line.first == "\t", !headers.isEmpty {
                let last = headers.removeLast()
                headers.append((last.name, last.value + " " + line.trimmingCharacters(in: .whitespaces)))
                continue
            }
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = String(line[..<colon]).trimmingCharacters(in: .whitespaces)
            let value = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
            headers.append((name, value))
        }
        return SipPacket(startLine: start, headers: headers, body: split.body)
    }

    private static func splitHeadAndBody(_ raw: String) -> (head: String, body: String) {
        if let range = raw.range(of: "\r\n\r\n") {
            return (String(raw[..<range.lowerBound]), String(raw[range.upperBound...]))
        }
        if let range = raw.range(of: "\n\n") {
            return (String(raw[..<range.lowerBound]), String(raw[range.upperBound...]))
        }
        return (raw, "")
    }
}

enum SipText {
    static let userAgent = "CK Media Services Merlin SIP"

    static func branch() -> String {
        "z9hG4bK-\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
    }

    static func tag() -> String {
        String(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased().prefix(12))
    }

    static func callId(host: String) -> String {
        "\(UUID().uuidString.lowercased())@\(host)"
    }

    static func parameter(_ name: String, in header: String) -> String? {
        let pattern = "(?:^|[;\\s])\(NSRegularExpression.escapedPattern(for: name))=([^;>\\s]+)"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let range = NSRange(header.startIndex..., in: header)
        guard let match = regex.firstMatch(in: header, options: [], range: range),
              let valueRange = Range(match.range(at: 1), in: header) else { return nil }
        return String(header[valueRange])
    }

    static func contactURI(_ header: String) -> String? {
        if let start = header.firstIndex(of: "<"), let end = header[header.index(after: start)...].firstIndex(of: ">") {
            let uri = header[header.index(after: start)..<end]
            let trimmed = uri.trimmingCharacters(in: .whitespaces)
            return trimmed.isEmpty ? nil : trimmed
        }
        let token = header.split(separator: ";").first.map(String.init) ?? header
        let trimmed = token.trimmingCharacters(in: .whitespaces)
        return trimmed.lowercased().hasPrefix("sip:") ? trimmed : nil
    }

    static func displayName(from header: String) -> String {
        if let regex = try? NSRegularExpression(pattern: #"^\s*"([^"]+)""#),
           let match = regex.firstMatch(in: header, range: NSRange(header.startIndex..., in: header)),
           let range = Range(match.range(at: 1), in: header) {
            return String(header[range]).trimmingCharacters(in: .whitespaces)
        }
        if let angle = header.firstIndex(of: "<") {
            let prefix = header[..<angle].trimmingCharacters(in: .whitespaces)
            if !prefix.isEmpty && prefix != "\"" { return prefix.trimmingCharacters(in: CharacterSet(charactersIn: "\"")) }
        }
        return ""
    }

    static func sipUser(from header: String) -> String {
        let pattern = #"sip:([^@>;]+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: header, range: NSRange(header.startIndex..., in: header)),
              let range = Range(match.range(at: 1), in: header) else {
            return header
        }
        return String(header[range])
    }

    static func requestURI(target: String, domain: String) -> String {
        var value = target.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.lowercased().hasPrefix("sip:") {
            value = String(value.dropFirst(4))
        }
        value = value.trimmingCharacters(in: CharacterSet(charactersIn: "<>"))
        if value.contains("@") {
            return "sip:\(value)"
        }
        return "sip:\(value)@\(domain)"
    }

    static func digest(method: String, uri: String, username: String, password: String, challengeHeader: String, nc: String) -> String? {
        let challenge = parseChallenge(challengeHeader)
        let realm = challenge["realm"] ?? ""
        let nonce = challenge["nonce"] ?? ""
        guard !nonce.isEmpty else { return nil }
        let qopToken = (challenge["qop"] ?? "")
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
        let qop = qopToken.contains("auth") ? "auth" : ""
        let cnonce = String(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased().prefix(16))
        let ha1 = md5("\(username):\(realm):\(password)")
        let ha2 = md5("\(method):\(uri)")
        let response = qop.isEmpty
            ? md5("\(ha1):\(nonce):\(ha2)")
            : md5("\(ha1):\(nonce):\(nc):\(cnonce):\(qop):\(ha2)")

        var fields = [
            "username=\"\(username)\"",
            "realm=\"\(realm)\"",
            "nonce=\"\(nonce)\"",
            "uri=\"\(uri)\"",
            "response=\"\(response)\"",
            "algorithm=MD5"
        ]
        if let opaque = challenge["opaque"] {
            fields.append("opaque=\"\(opaque)\"")
        }
        if !qop.isEmpty {
            fields.append("qop=\(qop)")
            fields.append("nc=\(nc)")
            fields.append("cnonce=\"\(cnonce)\"")
        }
        return "Digest " + fields.joined(separator: ", ")
    }

    static func parseChallenge(_ header: String) -> [String: String] {
        var value = header.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.lowercased().hasPrefix("digest") {
            value = String(value.dropFirst(6)).trimmingCharacters(in: .whitespaces)
        }
        guard let regex = try? NSRegularExpression(pattern: #"(\w+)=(?:"([^"]*)"|([^,\s]*))"#) else { return [:] }
        let ns = value as NSString
        var result: [String: String] = [:]
        for match in regex.matches(in: value, range: NSRange(location: 0, length: ns.length)) {
            let key = ns.substring(with: match.range(at: 1)).lowercased()
            if match.range(at: 2).location != NSNotFound {
                result[key] = ns.substring(with: match.range(at: 2))
            } else if match.range(at: 3).location != NSNotFound {
                result[key] = ns.substring(with: match.range(at: 3))
            }
        }
        return result
    }

    static func md5(_ value: String) -> String {
        let digest = Insecure.MD5.hash(data: Data(value.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    static func render(start: String, headers: [(String, String)], body: String) -> String {
        var lines = [start]
        for header in headers where !header.0.isEmpty {
            lines.append("\(header.0): \(header.1)")
        }
        let bodyText = body
        lines.append("Content-Length: \(Data(bodyText.utf8).count)")
        if bodyText.isEmpty {
            return lines.joined(separator: "\r\n") + "\r\n\r\n"
        }
        return lines.joined(separator: "\r\n") + "\r\n\r\n" + bodyText
    }

    static func response(code: Int, reason: String, to request: SipPacket, toHeader: String? = nil, extra: [(String, String)] = [], body: String = "") -> String {
        var headers: [(String, String)] = request.headers.compactMap { header in
            header.name.caseInsensitiveCompare("Via") == .orderedSame || header.name.caseInsensitiveCompare("v") == .orderedSame
                ? ("Via", header.value)
                : nil
        }
        headers.append(("From", request.value("From") ?? request.value("f") ?? ""))
        headers.append(("To", toHeader ?? request.value("To") ?? request.value("t") ?? ""))
        headers.append(("Call-ID", request.callId))
        headers.append(("CSeq", request.cseq))
        headers.append(("User-Agent", userAgent))
        headers.append(contentsOf: extra)
        return render(start: "SIP/2.0 \(code) \(reason)", headers: headers, body: body)
    }

    static func withTag(_ header: String, tag: String) -> String {
        if parameter("tag", in: header) != nil { return header }
        return header + ";tag=\(tag)"
    }

    static func routes(from packet: SipPacket) -> [String] {
        Array(packet.values("Record-Route").reversed())
    }

    static func sdp(ip: String, port: UInt16, payloads: [Int], direction: String, sessionVersion: Int) -> String {
        var lines = [
            "v=0",
            "o=MerlinSIP 1 \(sessionVersion) IN IP4 \(ip)",
            "s=Merlin SIP",
            "c=IN IP4 \(ip)",
            "t=0 0",
            "m=audio \(port) RTP/AVP \(payloads.map(String.init).joined(separator: " ")) 101"
        ]
        if payloads.contains(0) { lines.append("a=rtpmap:0 PCMU/8000") }
        if payloads.contains(8) { lines.append("a=rtpmap:8 PCMA/8000") }
        lines.append("a=rtpmap:101 telephone-event/8000")
        lines.append("a=fmtp:101 0-16")
        lines.append("a=ptime:20")
        lines.append("a=\(direction)")
        return lines.joined(separator: "\r\n") + "\r\n"
    }

    static func audio(in body: String) -> (address: String, port: Int, payload: Int, dtmf: Int, direction: String)? {
        var address = ""
        var port = 0
        var payload = -1
        var dtmf = 101
        var direction = "sendrecv"
        var inAudio = false
        var rtpmap: [Int: String] = [:]

        for raw in body.components(separatedBy: .newlines) {
            let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.lowercased().hasPrefix("m=") {
                inAudio = line.lowercased().hasPrefix("m=audio ")
                if inAudio {
                    let parts = line.split(separator: " ")
                    if parts.count >= 2 { port = Int(parts[1]) ?? 0 }
                    let formats = parts.dropFirst(3).compactMap { Int($0) }
                    payload = formats.first(where: { $0 == 0 || $0 == 8 }) ?? -1
                }
                continue
            }
            if line.lowercased().hasPrefix("c=in ip4 ") {
                let value = String(line.dropFirst("c=IN IP4 ".count)).trimmingCharacters(in: .whitespaces)
                if address.isEmpty || inAudio { address = value }
                continue
            }
            if !inAudio { continue }
            if line.lowercased().hasPrefix("a=rtpmap:") {
                let value = String(line.dropFirst("a=rtpmap:".count))
                let bits = value.split(separator: " ", maxSplits: 1)
                if let pt = bits.first.flatMap({ Int($0) }) {
                    rtpmap[pt] = bits.count > 1 ? String(bits[1]).lowercased() : ""
                    if rtpmap[pt]?.contains("telephone-event") == true { dtmf = pt }
                }
            } else if line.lowercased().hasPrefix("a=sendrecv") || line.lowercased().hasPrefix("a=sendonly")
                        || line.lowercased().hasPrefix("a=recvonly") || line.lowercased().hasPrefix("a=inactive") {
                direction = String(line.dropFirst(2)).lowercased()
            }
        }

        if payload < 0 {
            payload = rtpmap.first(where: { $0.value.contains("pcmu") })?.key
                ?? rtpmap.first(where: { $0.value.contains("pcma") })?.key
                ?? -1
        }
        guard port > 0, !address.isEmpty, payload == 0 || payload == 8 else { return nil }
        return (address, port, payload, dtmf, direction)
    }

    static func isPrivateIPv4(_ address: String) -> Bool {
        let parts = address.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        if parts[0] == 10 || parts[0] == 127 { return true }
        if parts[0] == 192 && parts[1] == 168 { return true }
        if parts[0] == 172 && (16...31).contains(parts[1]) { return true }
        return false
    }

    static func sanitized(_ value: String) -> String {
        value.replacingOccurrences(of: "\r", with: "").replacingOccurrences(of: "\n", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
