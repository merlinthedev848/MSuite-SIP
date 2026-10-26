import AVFoundation
import Foundation

final class RtpAudio {
    let socket: UdpSocket
    private let lock = NSLock()
    private var remoteHost: String?
    private var remotePort: UInt16 = 0
    private var payloadType = 0
    private var dtmfPayload = 101
    private var sequence = UInt16.random(in: 0...UInt16.max)
    private var timestamp = UInt32.random(in: 0...UInt32.max)
    private let ssrc = UInt32.random(in: 0...UInt32.max)
    private var sendSilence = false
    private var playbackEnabled = true
    private var suppressMic = false
    private var leftovers: [Int16] = []
    private var pendingFrames: [UInt16: [Int16]] = [:]
    private var nextSequence: UInt16?
    private var primed = false

    private var stunCompletion: ((String, UInt16) -> Void)?
    private var stunTransaction = Data()
    private var stunFallback: (String, UInt16) = ("", 0)
    private var stunItem: DispatchWorkItem?

    private var engine: AVAudioEngine?
    private var player: AVAudioPlayerNode?
    private var converter: AVAudioConverter?
    private var playbackFormat: AVAudioFormat?
    private var playTimer: DispatchSourceTimer?
    private var runningEngine = false
    private var stopped = false
    private var voiceAttempts = 0
    var onAudioError: ((String) -> Void)?

    init(socket: UdpSocket) {
        self.socket = socket
        socket.onPacket = { [weak self] data, host, port in
            self?.receive(data, host: host, port: port)
        }
        socket.start(bufferSize: 2048)
    }

    func advertise(localIP: String, serverIsPrivate: Bool, completion: @escaping (String, UInt16) -> Void) {
        let localPort = socket.localPort
        if serverIsPrivate || !SipText.isPrivateIPv4(localIP) {
            completion(localIP, localPort)
            return
        }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            guard let stunIP = try? UdpSocket.resolveIPv4("stun.l.google.com") else {
                completion(localIP, localPort)
                return
            }
            self.beginStun(server: stunIP, fallback: (localIP, localPort), completion: completion)
        }
    }

    func setRemote(host: String, port: UInt16, payload: Int, dtmf: Int) {
        lock.lock()
        remoteHost = host
        remotePort = port
        payloadType = payload
        dtmfPayload = dtmf
        let silenceByte: UInt8 = payload == 8 ? G711.aLawSilence : G711.muLawSilence
        lock.unlock()
        let silence = Data(repeating: silenceByte, count: 160)
        for _ in 0..<4 {
            sendRTP(payload: silence, payloadType: payload, timestampStep: 160, marker: false, fixedTimestamp: nil, host: host, port: port)
        }
    }

    func setMuted(_ muted: Bool) {
        lock.lock()
        sendSilence = muted
        lock.unlock()
    }

    func setPlaybackEnabled(_ enabled: Bool) {
        lock.lock()
        playbackEnabled = enabled
        lock.unlock()
    }

    func setSpeaker(_ enabled: Bool) {
        DispatchQueue.main.async {
            try? AVAudioSession.sharedInstance().overrideOutputAudioPort(enabled ? .speaker : .none)
        }
    }

    func startVoice() {
        DispatchQueue.main.async { [weak self] in
            self?.startVoiceOnMain()
        }
    }

    func stop() {
        stopped = true
        lock.lock()
        stunCompletion = nil
        lock.unlock()
        stunItem?.cancel()
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.playTimer?.cancel()
            self.playTimer = nil
            self.engine?.inputNode.removeTap(onBus: 0)
            self.player?.stop()
            self.engine?.stop()
            self.engine = nil
            self.player = nil
            self.runningEngine = false
        }
        socket.onPacket = nil
        socket.close()
    }

    func sendDtmf(event: UInt8) {
        DispatchQueue.global(qos: .userInteractive).async { [weak self] in
            guard let self else { return }
            self.lock.lock()
            let host = self.remoteHost
            let port = self.remotePort
            let payload = self.dtmfPayload
            let start = self.timestamp
            self.suppressMic = true
            self.lock.unlock()
            guard let host, port > 0 else {
                self.lock.lock()
                self.suppressMic = false
                self.lock.unlock()
                return
            }
            var duration: UInt16 = 0
            for index in 0..<8 {
                duration = duration &+ 160
                let ended = index >= 5
                var body = Data(count: 4)
                body[0] = event
                body[1] = (ended ? 0x80 : 0x00) | 10
                body[2] = UInt8(duration >> 8)
                body[3] = UInt8(duration & 0xFF)
                self.sendRTP(
                    payload: body,
                    payloadType: payload,
                    timestampStep: 0,
                    marker: index == 0,
                    fixedTimestamp: start,
                    host: host,
                    port: port
                )
                usleep(20_000)
            }
            self.lock.lock()
            self.timestamp = start &+ UInt32(duration)
            self.suppressMic = false
            self.lock.unlock()
        }
    }

    private func beginStun(server: String, fallback: (String, UInt16), completion: @escaping (String, UInt16) -> Void) {
        var transaction = Data(count: 12)
        for index in 0..<12 { transaction[index] = UInt8.random(in: 0...255) }
        var request = Data(count: 20)
        request[0] = 0x00
        request[1] = 0x01
        request[4] = 0x21
        request[5] = 0x12
        request[6] = 0xA4
        request[7] = 0x42
        request.replaceSubrange(8..<20, with: transaction)

        lock.lock()
        stunTransaction = transaction
        stunFallback = fallback
        stunCompletion = completion
        lock.unlock()

        socket.send(request, host: server, port: 19302)
        let item = DispatchWorkItem { [weak self] in
            self?.completeStun(nil)
        }
        stunItem = item
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.8, execute: item)
    }

    private func completeStun(_ mapped: (String, UInt16)?) {
        lock.lock()
        let completion = stunCompletion
        let fallback = stunFallback
        stunCompletion = nil
        lock.unlock()
        guard let completion else { return }
        stunItem?.cancel()
        if let mapped {
            completion(mapped.0, mapped.1)
        } else {
            completion(fallback.0, fallback.1)
        }
    }

    private func receive(_ data: Data, host: String, port: UInt16) {
        lock.lock()
        let transaction = stunTransaction
        lock.unlock()
        if !transaction.isEmpty, let mapped = StunBinding.parse(data, transaction: transaction) {
            completeStun(mapped)
            return
        }
        guard data.count >= 12, (data[0] & 0xC0) == 0x80 else { return }
        let payloadType = Int(data[1] & 0x7F)
        let sequence = UInt16(data[2]) << 8 | UInt16(data[3])
        lock.lock()
        remoteHost = host
        remotePort = port
        let telephoneEvent = dtmfPayload
        let audioPayload = self.payloadType
        lock.unlock()
        if payloadType == telephoneEvent || payloadType == 13 { return }
        let payload = rtpPayload(data)
        guard !payload.isEmpty else { return }
        let samples: [Int16]
        if payloadType == 8 {
            samples = payload.map { G711.aLawToLinear($0) }
        } else if payloadType == 0 || payloadType == audioPayload {
            samples = payload.map { G711.muLawToLinear($0) }
        } else {
            return
        }
        guard samples.count >= 80 else { return }
        lock.lock()
        pendingFrames[sequence] = Array(samples.prefix(160))
        if pendingFrames.count > 24, let oldest = pendingFrames.keys.min(by: { sequenceBefore($0, $1) }) {
            pendingFrames[oldest] = nil
        }
        lock.unlock()
    }

    private func sendPCM(_ samples: [Int16]) {
        lock.lock()
        let blocked = suppressMic
        let silenced = sendSilence
        let payload = payloadType
        let host = remoteHost
        let port = remotePort
        lock.unlock()
        guard !blocked, let host, port > 0 else { return }
        let bytes: [UInt8]
        if silenced {
            let value: UInt8 = payload == 8 ? G711.aLawSilence : G711.muLawSilence
            bytes = Array(repeating: value, count: samples.count)
        } else if payload == 8 {
            bytes = samples.map { G711.linearToALaw($0) }
        } else {
            bytes = samples.map { G711.linearToMuLaw($0) }
        }
        sendRTP(payload: Data(bytes), payloadType: payload, timestampStep: 160, marker: false, fixedTimestamp: nil, host: host, port: port)
    }

    private func sendRTP(payload: Data, payloadType: Int, timestampStep: UInt32, marker: Bool, fixedTimestamp: UInt32?, host: String, port: UInt16) {
        lock.lock()
        let seq = sequence
        sequence &+= 1
        let ts = fixedTimestamp ?? timestamp
        if fixedTimestamp == nil {
            timestamp &+= timestampStep
        }
        let current = ssrc
        lock.unlock()

        var packet = Data(count: 12 + payload.count)
        packet[0] = 0x80
        packet[1] = UInt8(payloadType & 0x7F) | (marker ? 0x80 : 0)
        packet[2] = UInt8(seq >> 8)
        packet[3] = UInt8(truncatingIfNeeded: seq)
        writeBE(ts, into: &packet, at: 4)
        writeBE(current, into: &packet, at: 8)
        packet.replaceSubrange(12..<packet.count, with: payload)
        socket.send(packet, host: host, port: port)
    }

    private func startVoiceOnMain() {
        guard !stopped, !runningEngine else { return }
        voiceAttempts += 1
        do {
            let engine = AVAudioEngine()
            let player = AVAudioPlayerNode()
            engine.attach(player)
            guard let playback = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 8000, channels: 1, interleaved: false) else { return }
            engine.connect(player, to: engine.mainMixerNode, format: playback)
            let input = engine.inputNode
            let hardware = input.outputFormat(forBus: 0)
            guard hardware.sampleRate > 0, hardware.channelCount > 0 else {
                throw SocketError.failed("The microphone is not ready.")
            }
            guard let converter = AVAudioConverter(from: hardware, to: playback) else { return }
            input.installTap(onBus: 0, bufferSize: 960, format: hardware) { [weak self] buffer, _ in
                self?.consume(buffer)
            }
            engine.prepare()
            try engine.start()
            player.play()
            self.engine = engine
            self.player = player
            self.converter = converter
            self.playbackFormat = playback
            runningEngine = true
            startPlaybackTimer()
        } catch {
            engine?.stop()
            self.engine = nil
            if voiceAttempts < 3 && !stopped {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                    self?.startVoiceOnMain()
                }
            } else if !stopped {
                onAudioError?("Call audio could not start. Check the microphone permission.")
            }
        }
    }

    private func consume(_ buffer: AVAudioPCMBuffer) {
        guard runningEngine, let converter else { return }
        let ratio = 8000.0 / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 64
        guard let output = AVAudioPCMBuffer(pcmFormat: converter.outputFormat, frameCapacity: max(capacity, 160)) else { return }
        var fed = false
        var error: NSError?
        converter.convert(to: output, error: &error) { _, status in
            if fed {
                status.pointee = .noDataNow
                return nil
            }
            fed = true
            status.pointee = .haveData
            return buffer
        }
        guard let channel = output.int16ChannelData?[0], output.frameLength > 0 else { return }
        let samples = Array(UnsafeBufferPointer(start: channel, count: Int(output.frameLength)))
        var frames: [[Int16]] = []
        lock.lock()
        leftovers.append(contentsOf: samples)
        while leftovers.count >= 160 {
            frames.append(Array(leftovers.prefix(160)))
            leftovers.removeFirst(160)
        }
        lock.unlock()
        for frame in frames {
            sendPCM(frame)
        }
    }

    private func startPlaybackTimer() {
        playTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "media.chriskendall.MerlinSIP.playback"))
        timer.schedule(deadline: .now() + .milliseconds(40), repeating: .milliseconds(20))
        timer.setEventHandler { [weak self] in
            self?.playFrame()
        }
        playTimer = timer
        timer.resume()
    }

    private func playFrame() {
        guard runningEngine, let player, let playbackFormat else { return }
        lock.lock()
        let enabled = playbackEnabled
        let samples = enabled ? dequeueLocked() : [Int16](repeating: 0, count: 160)
        lock.unlock()
        guard let buffer = AVAudioPCMBuffer(pcmFormat: playbackFormat, frameCapacity: 160) else { return }
        buffer.frameLength = 160
        if let destination = buffer.int16ChannelData?[0] {
            for index in 0..<160 {
                destination[index] = index < samples.count ? samples[index] : 0
            }
        }
        player.scheduleBuffer(buffer, completionHandler: nil)
    }

    private func dequeueLocked() -> [Int16] {
        let silence = [Int16](repeating: 0, count: 160)
        if nextSequence == nil {
            guard pendingFrames.count >= 3 else { return silence }
            nextSequence = pendingFrames.keys.min(by: { sequenceBefore($0, $1) })
            primed = true
        }
        guard let expected = nextSequence else { return silence }
        if let frame = pendingFrames.removeValue(forKey: expected) {
            nextSequence = expected &+ 1
            return frame.count == 160 ? frame : frame + silence
        }
        if let newest = pendingFrames.keys.max(by: { sequenceBefore($0, $1) }), sequenceGap(from: expected, to: newest) > 4 {
            nextSequence = expected &+ 1
        }
        return silence
    }

    private func sequenceBefore(_ lhs: UInt16, _ rhs: UInt16) -> Bool {
        Int16(bitPattern: rhs &- lhs) > 0
    }

    private func sequenceGap(from older: UInt16, to newer: UInt16) -> Int {
        Int(newer &- older)
    }

    private func rtpPayload(_ data: Data) -> [UInt8] {
        let cc = Int(data[0] & 0x0F)
        var offset = 12 + (cc * 4)
        if (data[0] & 0x10) != 0 {
            guard data.count >= offset + 4 else { return [] }
            let length = Int(data[offset + 2]) << 8 | Int(data[offset + 3])
            offset += 4 + (length * 4)
        }
        guard offset < data.count else { return [] }
        return Array(data[offset...])
    }

    private func writeBE(_ value: UInt32, into packet: inout Data, at offset: Int) {
        packet[offset] = UInt8((value >> 24) & 0xFF)
        packet[offset + 1] = UInt8((value >> 16) & 0xFF)
        packet[offset + 2] = UInt8((value >> 8) & 0xFF)
        packet[offset + 3] = UInt8(value & 0xFF)
    }
}

private enum StunBinding {
    static func parse(_ data: Data, transaction: Data) -> (String, UInt16)? {
        guard data.count >= 20, data[0] == 0x01, data[1] == 0x01 else { return nil }
        guard data.subdata(in: 8..<20) == transaction else { return nil }
        var offset = 20
        while offset + 4 <= data.count {
            let type = (Int(data[offset]) << 8) | Int(data[offset + 1])
            let length = (Int(data[offset + 2]) << 8) | Int(data[offset + 3])
            let start = offset + 4
            guard start + length <= data.count else { return nil }
            if type == 0x0020 || type == 0x8020 || type == 0x0001, length >= 8, data[start + 1] == 0x01 {
                var port = (UInt16(data[start + 2]) << 8) | UInt16(data[start + 3])
                var bytes = [data[start + 4], data[start + 5], data[start + 6], data[start + 7]]
                if type == 0x0020 || type == 0x8020 {
                    port ^= 0x2112
                    let cookie: [UInt8] = [0x21, 0x12, 0xA4, 0x42]
                    for index in 0..<4 { bytes[index] ^= cookie[index] }
                }
                return (bytes.map(String.init).joined(separator: "."), port)
            }
            let padded = length + (4 - (length % 4)) % 4
            offset = start + padded
        }
        return nil
    }
}
