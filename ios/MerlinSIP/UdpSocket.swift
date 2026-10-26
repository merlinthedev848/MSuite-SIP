import Darwin
import Foundation

final class UdpSocket {
    let fd: Int32
    let localPort: UInt16
    private(set) var localAddress: String
    private let queue = DispatchQueue(label: "media.chriskendall.MerlinSIP.udp.\(UUID().uuidString)")
    private var source: DispatchSourceRead?
    private var closed = false
    var onPacket: ((Data, String, UInt16) -> Void)?

    private init(fd: Int32, localAddress: String, localPort: UInt16) {
        self.fd = fd
        self.localAddress = localAddress
        self.localPort = localPort
    }

    static func bind(port: UInt16 = 0) throws -> UdpSocket {
        let fd = Darwin.socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard fd >= 0 else { throw SocketError.failed("Could not open a UDP socket.") }
        var reuse: Int32 = 1
        Darwin.setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout.size(ofValue: reuse)))
        var nosig: Int32 = 1
        Darwin.setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &nosig, socklen_t(MemoryLayout.size(ofValue: nosig)))

        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        addr.sin_addr.s_addr = in_addr_t(0)
        let bound = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0 else {
            Darwin.close(fd)
            throw SocketError.failed("Could not bind a local UDP port.")
        }
        let endpoint = try endpointName(fd)
        return UdpSocket(fd: fd, localAddress: endpoint.0, localPort: endpoint.1)
    }

    func connect(host: String, port: UInt16) throws {
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        guard inet_pton(AF_INET, host, &addr.sin_addr) == 1 else {
            throw SocketError.failed("The PBX address is not a valid IPv4 address.")
        }
        let result = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard result == 0 else { throw SocketError.failed("Could not reach the PBX.") }
        let endpoint = try Self.endpointName(fd)
        if endpoint.0 != "0.0.0.0" {
            localAddress = endpoint.0
        }
    }

    func start(bufferSize: Int = 65535) {
        let flags = Darwin.fcntl(fd, F_GETFL, 0)
        _ = Darwin.fcntl(fd, F_SETFL, flags | O_NONBLOCK)
        let source = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
        source.setEventHandler { [weak self] in
            self?.drain(bufferSize: bufferSize)
        }
        source.setCancelHandler {
            Darwin.close(self.fd)
        }
        self.source = source
        source.resume()
    }

    func send(_ data: Data) {
        data.withUnsafeBytes { raw in
            guard let base = raw.baseAddress else { return }
            _ = Darwin.send(fd, base, raw.count, 0)
        }
    }

    func send(_ data: Data, host: String, port: UInt16) {
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        guard inet_pton(AF_INET, host, &addr.sin_addr) == 1 else { return }
        data.withUnsafeBytes { raw in
            guard let base = raw.baseAddress else { return }
            _ = withUnsafePointer(to: &addr) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    Darwin.sendto(fd, base, raw.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                }
            }
        }
    }

    func close() {
        queue.sync {
            guard !closed else { return }
            closed = true
            onPacket = nil
            if let source {
                source.cancel()
                self.source = nil
            } else {
                Darwin.close(fd)
            }
        }
    }

    private func drain(bufferSize: Int) {
        while !closed {
            var buffer = [UInt8](repeating: 0, count: bufferSize)
            var addr = sockaddr_in()
            var length = socklen_t(MemoryLayout<sockaddr_in>.size)
            let count = withUnsafeMutablePointer(to: &addr) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    Darwin.recvfrom(fd, &buffer, buffer.count, 0, $0, &length)
                }
            }
            if count > 0 {
                let data = Data(buffer.prefix(count))
                let host = Self.string(from: addr.sin_addr)
                let port = UInt16(bigEndian: addr.sin_port)
                onPacket?(data, host, port)
            } else {
                return
            }
        }
    }

    private static func endpointName(_ fd: Int32) throws -> (String, UInt16) {
        var storage = sockaddr_in()
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let result = withUnsafeMutablePointer(to: &storage) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.getsockname(fd, $0, &length)
            }
        }
        guard result == 0 else { throw SocketError.failed("Could not read the local UDP port.") }
        return (string(from: storage.sin_addr), UInt16(bigEndian: storage.sin_port))
    }

    private static func string(from address: in_addr) -> String {
        var address = address
        var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
        inet_ntop(AF_INET, &address, &buffer, socklen_t(INET_ADDRSTRLEN))
        return String(cString: buffer)
    }

    static func resolveIPv4(_ host: String) throws -> String {
        if isIPv4(host) {
            return host
        }
        var hints = addrinfo()
        hints.ai_family = AF_INET
        hints.ai_socktype = SOCK_DGRAM
        var info: UnsafeMutablePointer<addrinfo>?
        let err = getaddrinfo(host, nil, &hints, &info)
        defer { if let info { freeaddrinfo(info) } }
        guard err == 0, let info, let addr = info.pointee.ai_addr else {
            throw SocketError.failed("Could not resolve \(host).")
        }
        var storage = sockaddr_in()
        memcpy(&storage, addr, MemoryLayout<sockaddr_in>.size)
        return string(from: storage.sin_addr)
    }

    private static func isIPv4(_ host: String) -> Bool {
        var addr = in_addr()
        return inet_pton(AF_INET, host, &addr) == 1
    }
}

enum SocketError: LocalizedError {
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .failed(let message): return message
        }
    }
}
