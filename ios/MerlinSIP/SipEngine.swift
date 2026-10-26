import Foundation
import os

final class LiveDialog {
    enum Role { case outgoing, incoming }

    let uuid: UUID
    let role: Role
    var number: String
    var displayName: String
    var callId: String
    var localTag: String
    var remoteTag = ""
    var localURI: String
    var remoteURI: String
    var remoteTarget: String
    var routes: [String] = []
    var localCSeq: Int
    var inviteCSeq: Int
    var inviteBranch: String
    var payload = 0
    var dtmfPayload = 101
    var muted = false
    var locallyHeld = false
    var remotelyHeld = false
    var answered = false
    var finished = false
    var connectedAt: Date?
    let startedAt = Date()
    var lastResponse: Data?
    var lastAck: String?
    var request: SipPacket?
    var mediaIP = ""
    var mediaPort: UInt16 = 0
    var mediaReady = false
    var answerWhenReady = false

    init(uuid: UUID, role: Role, number: String, displayName: String, callId: String, localTag: String, localURI: String, remoteURI: String, remoteTarget: String, localCSeq: Int, inviteCSeq: Int, inviteBranch: String) {
        self.uuid = uuid
        self.role = role
        self.number = number
        self.displayName = displayName
        self.callId = callId
        self.localTag = localTag
        self.localURI = localURI
        self.remoteURI = remoteURI
        self.remoteTarget = remoteTarget
        self.localCSeq = localCSeq
        self.inviteCSeq = inviteCSeq
        self.inviteBranch = inviteBranch
    }

    var phase: CallPhase {
        if finished { return .ending }
        if locallyHeld || remotelyHeld { return .held }
        if connectedAt != nil { return .connected }
        if role == .outgoing && answered { return .connecting }
        if role == .outgoing { return .ringing }
        return .connecting
    }
}

private final class PendingRequest {
    var method: String
    var uri: String
    var callId: String
    var cseq: Int
    var branch: String
    var from: String
    var to: String
    var routes: [String]
    var extra: [(String, String)]
    var body: String
    var alreadyRetried: Bool
    var retransmit: Bool
    var retries = 0
    var packet: String
    var timer: DispatchWorkItem?
    var onProvisional: ((SipPacket) -> Void)?
    var onFinal: (SipPacket) -> Void

    init(method: String, uri: String, callId: String, cseq: Int, branch: String, from: String, to: String, routes: [String], extra: [(String, String)], body: String, alreadyRetried: Bool, retransmit: Bool, packet: String, onProvisional: ((SipPacket) -> Void)?, onFinal: @escaping (SipPacket) -> Void) {
        self.method = method
        self.uri = uri
        self.callId = callId
        self.cseq = cseq
        self.branch = branch
        self.from = from
        self.to = to
        self.routes = routes
        self.extra = extra
        self.body = body
        self.alreadyRetried = alreadyRetried
        self.retransmit = retransmit
        self.packet = packet
        self.onProvisional = onProvisional
        self.onFinal = onFinal
    }
}

final class SipEngine {
    var onEvent: ((SipEvent) -> Void)?

    private let queue = DispatchQueue(label: "media.chriskendall.MerlinSIP.sip")
    private let log = Logger(subsystem: "media.chriskendall.MerlinSIP", category: "sip")
    private var account: SipAccount?
    private var password = ""
    private var socket: UdpSocket?
    private var serverIP = ""
    private var advertisedIP = ""
    private var advertisedPort: UInt16 = 0
    private var localIP = ""
    private var registerCallId = ""
    private var registerTag = ""
    private var registerCSeq = 1
    private var authCount = 1
    private var registered = false
    private var generation = 0
    private var refreshItem: DispatchWorkItem?
    private var keepaliveItem: DispatchWorkItem?
    private var retryItem: DispatchWorkItem?
    private var okItem: DispatchWorkItem?
    private var okRetransmits = 0
    private var pending: [String: PendingRequest] = [:]
    private var call: LiveDialog?
    private var endingCall: LiveDialog?
    private var rtp: RtpAudio?
    private var sessionVersion = 1
    private var speakerEnabled = false
    private var registerExpires = 3600
    private var lineStatus = "Available"
    private var presenceNeedsPublish = true
    private var presenceGeneration = 0
    private var rejectIncoming = false
    private var watchedExtensions: [String] = []
    private var blfChannels: [String: BlfChannels] = [:]
    private var subscriptionExtensions: [String: String] = [:]
    private var subscribeCSeq = 1
    private var publishCallId = ""
    private var publishTag = ""
    private var publishCSeq = 1
    private var publishEtag = ""
    private var notifyCallId = ""
    private var notifyTag = ""
    private var notifyCSeq = 1
    private var optionsCSeq = 1
    private var latencyMs = 0.0
    private var latencyMeasured = false
    private var measurementToken = 0
    private var qualityItem: DispatchWorkItem?
    private var latencyItem: DispatchWorkItem?

    func start(account: SipAccount, password: String) {
        let host = account.domain
        queue.async { [weak self] in
            guard let self else { return }
            self.generation += 1
            let token = self.generation
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                do {
                    let ip = try UdpSocket.resolveIPv4(host)
                    self?.queue.async {
                        guard let self, token == self.generation else { return }
                        self.startOnQueue(account: account, password: password, serverIP: ip)
                    }
                } catch {
                    self?.emit(.registration(ok: false, message: error.localizedDescription))
                }
            }
        }
    }

    func stop() {
        queue.async { [weak self] in
            guard let self else { return }
            self.generation += 1
            self.tearDown(sendUnregister: true)
        }
    }

    func refresh() {
        queue.async { [weak self] in
            guard let self, let account = self.account else { return }
            if self.socket == nil {
                self.start(account: account, password: self.password)
            } else {
                self.beginRegister(expires: self.registerExpires)
            }
        }
    }

    func placeCall(number: String, uuid: UUID) {
        queue.async { [weak self] in
            self?.placeCallOnQueue(number: number, uuid: uuid)
        }
    }

    func answer() {
        queue.async { [weak self] in
            self?.answerOnQueue()
        }
    }

    func hangup() {
        queue.async { [weak self] in
            self?.hangupOnQueue()
        }
    }

    func setMuted(_ muted: Bool) {
        queue.async { [weak self] in
            guard let self, let call = self.call else { return }
            call.muted = muted
            self.applyMediaFlags()
            self.emitMedia()
        }
    }

    func setHeld(_ held: Bool) {
        queue.async { [weak self] in
            self?.setHeldOnQueue(held)
        }
    }

    func setSpeaker(_ enabled: Bool) {
        queue.async { [weak self] in
            guard let self else { return }
            self.speakerEnabled = enabled
            self.rtp?.setSpeaker(enabled)
            self.emitMedia()
        }
    }

    func sendDtmf(_ digits: String) {
        queue.async { [weak self] in
            guard let self, let call = self.call, call.connectedAt != nil else { return }
            let events = DeskPhone.dtmfEvents(digits)
            guard !events.isEmpty else { return }
            if self.rtp?.sendDtmfSequence(events) != true {
                self.emit(.notice("The call audio is not ready to send \(digits)."))
            }
        }
    }

    func publishLineStatus(_ status: String) {
        queue.async { [weak self] in
            guard let self else { return }
            let trimmed = status.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }
            self.lineStatus = trimmed
            self.presenceGeneration += 1
            self.presenceNeedsPublish = true
            guard self.registered else { return }
            self.sendPresence()
            self.sendDialogNote()
        }
    }

    func setRejectIncoming(_ reject: Bool) {
        queue.async { [weak self] in
            self?.rejectIncoming = reject
        }
    }

    func setWatchedExtensions(_ numbers: [String]) {
        queue.async { [weak self] in
            guard let self else { return }
            self.watchedExtensions = numbers
            guard self.registered else { return }
            self.subscribeWatched()
        }
    }

    func audioSessionActivated() {
        queue.async { [weak self] in
            self?.rtp?.setSpeaker(self?.speakerEnabled ?? false)
            self?.rtp?.startVoice()
        }
    }

    func audioSessionDeactivated() {
        queue.async { [weak self] in
            guard let self, self.call == nil else { return }
            self.rtp?.stop()
            self.rtp = nil
        }
    }

    private func startOnQueue(account: SipAccount, password: String, serverIP: String) {
        tearDown(sendUnregister: false)
        self.account = account
        self.password = password
        self.serverIP = serverIP
        do {
            let socket = try UdpSocket.bind()
            try socket.connect(host: serverIP, port: UInt16(account.port))
            socket.onPacket = { [weak self] data, _, _ in
                self?.queue.async { self?.receive(data) }
            }
            socket.start()
            self.socket = socket
            localIP = socket.localAddress
            advertisedIP = socket.localAddress
            advertisedPort = socket.localPort
            registerCallId = SipText.callId(host: socket.localAddress)
            registerTag = SipText.tag()
            registerCSeq = 1
            registered = false
            emit(.registration(ok: false, message: "Registering..."))
            beginRegister(expires: 3600)
            scheduleKeepalive()
        } catch {
            emit(.registration(ok: false, message: error.localizedDescription))
            scheduleRegisterRetry()
        }
    }

    private func tearDown(sendUnregister: Bool) {
        refreshItem?.cancel()
        keepaliveItem?.cancel()
        retryItem?.cancel()
        okItem?.cancel()
        stopQualityWatch()
        let watched = Array(blfChannels.keys)
        blfChannels.removeAll()
        subscriptionExtensions.removeAll()
        for extensionNumber in watched {
            emit(.blf(extensionNumber, "Offline"))
        }
        if let call, !call.finished {
            sendBye(call)
            finish(call, result: "Ended", direction: call.role == .incoming ? .inbound : .outbound)
        }
        if sendUnregister && registered { sendUnregisterNow() }
        pending.values.forEach { $0.timer?.cancel() }
        pending.removeAll()
        rtp?.stop()
        rtp = nil
        socket?.close()
        socket = nil
        registered = false
    }

    private func beginRegister(expires: Int) {
        guard let account else { return }
        registerExpires = expires
        let cseq = registerCSeq
        registerCSeq += 1
        let uri = "sip:\(account.domain)"
        let from = fromHeader(tag: registerTag)
        let to = "<sip:\(account.extensionNumber)@\(account.domain)>"
        transmit(
            method: "REGISTER",
            uri: uri,
            callId: registerCallId,
            cseq: cseq,
            branch: SipText.branch(),
            from: from,
            to: to,
            routes: [],
            extra: [
                ("Contact", contactHeader(expires: expires)),
                ("Expires", "\(expires)"),
                ("Allow", "INVITE, ACK, CANCEL, BYE, OPTIONS, REGISTER, SUBSCRIBE, NOTIFY, PUBLISH, INFO")
            ],
            body: "",
            auth: nil,
            proxyAuth: false,
            alreadyRetried: false,
            retransmit: true,
            onProvisional: nil,
            onFinal: { [weak self] packet in
                self?.handleRegister(packet, expires: expires)
            }
        )
    }

    private func handleRegister(_ packet: SipPacket, expires: Int) {
        switch packet.statusCode {
        case 200:
            registered = true
            let lifetime = packet.value("Expires").flatMap(Int.init) ?? expires
            registerExpires = lifetime
            let refresh = max(30, min(lifetime / 2, 600))
            emit(.registration(ok: true, message: "Registered and listening for calls."))
            scheduleRefresh(after: TimeInterval(refresh))
            if presenceNeedsPublish || DeskPhone.isBusyOrDnd(lineStatus) {
                sendPresence()
                sendDialogNote()
            }
            subscribeWatched()
        case 423:
            let minimum = packet.value("Min-Expires").flatMap(Int.init) ?? 3600
            beginRegister(expires: minimum)
        default:
            registered = false
            let message = packet.statusCode == 401 || packet.statusCode == 403 || packet.statusCode == 407
                ? "The PBX rejected the username or password."
                : "Registration failed (\(packet.statusCode) \(packet.reason))."
            emit(.registration(ok: false, message: message))
            scheduleRegisterRetry()
        }
    }

    private func scheduleRefresh(after seconds: TimeInterval) {
        refreshItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            self?.beginRegister(expires: self?.registerExpires ?? 3600)
        }
        refreshItem = item
        queue.asyncAfter(deadline: .now() + seconds, execute: item)
    }

    private func scheduleRegisterRetry() {
        retryItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self, self.account != nil, self.socket != nil, !self.registered else { return }
            self.beginRegister(expires: self.registerExpires)
        }
        retryItem = item
        queue.asyncAfter(deadline: .now() + 15, execute: item)
    }

    private func scheduleKeepalive() {
        keepaliveItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self else { return }
            if self.registered {
                self.socket?.send(Data("\r\n\r\n".utf8))
            }
            self.scheduleKeepalive()
        }
        keepaliveItem = item
        queue.asyncAfter(deadline: .now() + 20, execute: item)
    }

    private func sendUnregisterNow() {
        guard let account, socket != nil else { return }
        let message = SipText.render(
            start: "REGISTER sip:\(account.domain) SIP/2.0",
            headers: [
                ("Via", via(SipText.branch())),
                ("Max-Forwards", "70"),
                ("From", fromHeader(tag: registerTag)),
                ("To", "<sip:\(account.extensionNumber)@\(account.domain)>"),
                ("Call-ID", registerCallId),
                ("CSeq", "\(registerCSeq) REGISTER"),
                ("Contact", contactHeader(expires: 0)),
                ("Expires", "0"),
                ("User-Agent", SipText.userAgent)
            ],
            body: ""
        )
        socket?.send(Data(message.utf8))
    }

    private func placeCallOnQueue(number: String, uuid: UUID) {
        guard let account else { return }
        guard registered else {
            emit(.notice("Register the phone before calling."))
            emitFailed(uuid: uuid, number: number, name: number, direction: .outbound, result: "Failed")
            return
        }
        guard call == nil else {
            emit(.notice("Already on a call."))
            emitFailed(uuid: uuid, number: number, name: number, direction: .outbound, result: "Failed")
            return
        }
        resetCallMeasurement()
        let target = number.trimmingCharacters(in: .whitespacesAndNewlines)
        let uri = SipText.requestURI(target: target, domain: account.domain)
        let user = SipText.sipUser(from: uri)
        let dialog = LiveDialog(
            uuid: uuid,
            role: .outgoing,
            number: user,
            displayName: user,
            callId: SipText.callId(host: advertisedIP),
            localTag: SipText.tag(),
            localURI: "sip:\(account.extensionNumber)@\(account.domain)",
            remoteURI: uri,
            remoteTarget: uri,
            localCSeq: 1,
            inviteCSeq: 1,
            inviteBranch: SipText.branch()
        )
        call = dialog
        emit(callState(dialog, phase: .dialing))
        prepareMedia(dialog) { [weak self] in
            self?.sendInvite(dialog, auth: nil, proxy: false, retried: false)
        }
    }

    private func sendInvite(_ dialog: LiveDialog, auth: String?, proxy: Bool, retried: Bool) {
        guard call === dialog else { return }
        sessionVersion += 1
        let offer = SipText.sdp(ip: dialog.mediaIP, port: dialog.mediaPort, payloads: [0, 8], direction: "sendrecv", sessionVersion: sessionVersion)
        var extra = [
            ("Contact", contactHeader(expires: nil)),
            ("Allow", "INVITE, ACK, CANCEL, BYE, OPTIONS, REGISTER, INFO"),
            ("Supported", "100rel")
        ]
        if let auth {
            extra.append((proxy ? "Proxy-Authorization" : "Authorization", auth))
        }
        dialog.inviteBranch = SipText.branch()
        dialog.inviteCSeq = dialog.localCSeq
        transmit(
            method: "INVITE",
            uri: dialog.remoteTarget,
            callId: dialog.callId,
            cseq: dialog.inviteCSeq,
            branch: dialog.inviteBranch,
            from: fromHeader(tag: dialog.localTag),
            to: dialog.remoteTag.isEmpty ? "<\(dialog.remoteURI)>" : "<\(dialog.remoteURI)>;tag=\(dialog.remoteTag)",
            routes: dialog.routes,
            extra: extra,
            body: offer,
            auth: nil,
            proxyAuth: false,
            alreadyRetried: retried,
            retransmit: true,
            onProvisional: { [weak self] packet in
                self?.handleInviteProgress(dialog, packet)
            },
            onFinal: { [weak self] packet in
                self?.handleInviteFinal(dialog, packet)
            }
        )
    }

    private func handleInviteProgress(_ dialog: LiveDialog, _ packet: SipPacket) {
        guard call === dialog else { return }
        learnDialog(dialog, from: packet)
        if packet.body.contains("m=audio") {
            _ = applyRemoteAudio(dialog, body: packet.body)
        }
        if packet.statusCode == 180 || packet.statusCode == 183 {
            emit(callState(dialog, phase: .ringing))
        }
        maybePrack(dialog, packet)
    }

    private func handleInviteFinal(_ dialog: LiveDialog, _ packet: SipPacket) {
        guard call === dialog else { return }
        learnDialog(dialog, from: packet)
        if packet.statusCode == 200 {
            guard applyRemoteAudio(dialog, body: packet.body) else {
                sendAck(dialog, sameTransaction: false)
                sendBye(dialog)
                finish(dialog, result: "Failed", direction: .outbound)
                emit(.notice("This phone supports G.711 calls only."))
                return
            }
            dialog.answered = true
            dialog.connectedAt = Date()
            sendAck(dialog, sameTransaction: false)
            emit(callState(dialog, phase: .connected))
            startQualityWatch()
            return
        }
        sendAck(dialog, sameTransaction: true)
        let result: String
        switch packet.statusCode {
        case 486: result = "Busy"
        case 487: result = "Cancelled"
        case 603: result = "Declined"
        case 480, 408: result = "No Answer"
        default: result = "Failed"
        }
        finish(dialog, result: result, direction: .outbound)
        if result == "Failed" {
            emit(.notice(describe(packet)))
        }
    }

    private func maybePrack(_ dialog: LiveDialog, _ packet: SipPacket) {
        guard let require = packet.value("Require")?.lowercased(), require.contains("100rel"),
              let rseq = packet.value("RSeq") else { return }
        dialog.localCSeq += 1
        transmit(
            method: "PRACK",
            uri: dialog.remoteTarget,
            callId: dialog.callId,
            cseq: dialog.localCSeq,
            branch: SipText.branch(),
            from: fromHeader(tag: dialog.localTag),
            to: toHeader(dialog),
            routes: dialog.routes,
            extra: [("RAck", "\(rseq) \(packet.cseqNumber) INVITE")],
            body: "",
            auth: nil,
            proxyAuth: false,
            alreadyRetried: false,
            retransmit: false,
            onProvisional: nil,
            onFinal: { _ in }
        )
    }

    private func answerOnQueue() {
        guard let dialog = call, dialog.role == .incoming, !dialog.answered, !dialog.finished else { return }
        dialog.answerWhenReady = true
        if dialog.mediaReady {
            sendAnswer(dialog)
        }
    }

    private func sendAnswer(_ dialog: LiveDialog) {
        guard let request = dialog.request, !dialog.answered else { return }
        dialog.answered = true
        dialog.connectedAt = Date()
        sessionVersion += 1
        let answer = SipText.sdp(
            ip: dialog.mediaIP,
            port: dialog.mediaPort,
            payloads: [dialog.payload],
            direction: "sendrecv",
            sessionVersion: sessionVersion
        )
        if let audio = SipText.audio(in: request.body) {
            _ = applyRemoteAudio(dialog, body: request.body)
            _ = audio
        }
        respond(200, "OK", to: request, tag: dialog.localTag, extra: [
            ("Contact", contactHeader(expires: nil)),
            ("Allow", "INVITE, ACK, CANCEL, BYE, OPTIONS, REGISTER, SUBSCRIBE, NOTIFY, PUBLISH, INFO")
        ], body: answer)
        emit(callState(dialog, phase: .connected))
        startQualityWatch()
    }

    private func hangupOnQueue() {
        guard let dialog = call else { return }
        if dialog.role == .incoming && !dialog.answered {
            decline(dialog)
            return
        }
        if dialog.connectedAt == nil && dialog.role == .outgoing {
            sendCancel(dialog)
            finish(dialog, result: "Cancelled", direction: .outbound)
            return
        }
        sendBye(dialog)
        let direction: CallDirection = dialog.role == .incoming ? .inbound : .outbound
        finish(dialog, result: dialog.connectedAt == nil ? "Cancelled" : "Answered", direction: direction)
    }

    private func decline(_ dialog: LiveDialog) {
        if let request = dialog.request {
            respond(603, "Decline", to: request, tag: dialog.localTag)
        }
        finish(dialog, result: "Declined", direction: .inbound)
    }

    private func setHeldOnQueue(_ held: Bool) {
        guard let dialog = call, dialog.connectedAt != nil else { return }
        dialog.locallyHeld = held
        dialog.localCSeq += 1
        sessionVersion += 1
        let direction = held ? "sendonly" : "sendrecv"
        let offer = SipText.sdp(ip: dialog.mediaIP, port: dialog.mediaPort, payloads: [dialog.payload], direction: direction, sessionVersion: sessionVersion)
        applyMediaFlags()
        emit(callState(dialog, phase: dialog.phase))
        transmit(
            method: "INVITE",
            uri: dialog.remoteTarget,
            callId: dialog.callId,
            cseq: dialog.localCSeq,
            branch: SipText.branch(),
            from: fromHeader(tag: dialog.localTag),
            to: toHeader(dialog),
            routes: dialog.routes,
            extra: [("Contact", contactHeader(expires: nil))],
            body: offer,
            auth: nil,
            proxyAuth: false,
            alreadyRetried: false,
            retransmit: true,
            onProvisional: nil,
            onFinal: { [weak self] packet in
                guard let self else { return }
                self.learnDialog(dialog, from: packet)
                if packet.statusCode == 200 {
                    self.sendAck(dialog, sameTransaction: false, cseq: packet.cseqNumber)
                } else if packet.statusCode >= 300 {
                    self.sendAck(dialog, sameTransaction: true, cseq: packet.cseqNumber)
                    dialog.locallyHeld.toggle()
                    self.applyMediaFlags()
                    self.emit(.notice("Hold was rejected by the PBX."))
                }
                self.emit(self.callState(dialog, phase: dialog.phase))
            }
        )
    }

    private func prepareMedia(_ dialog: LiveDialog, ready: @escaping () -> Void) {
        do {
            if rtp == nil {
                let mediaSocket = try UdpSocket.bind()
                let audio = RtpAudio(socket: mediaSocket)
                audio.onAudioError = { [weak self] message in
                    self?.emit(.notice(message))
                }
                rtp = audio
            }
            guard let rtp else { return }
            let local = localIP.isEmpty ? advertisedIP : localIP
            let serverPrivate = SipText.isPrivateIPv4(serverIP)
            rtp.advertise(localIP: local, serverIsPrivate: serverPrivate) { [weak self] ip, port in
                self?.queue.async {
                    guard let self, self.call === dialog else { return }
                    dialog.mediaIP = ip
                    dialog.mediaPort = port
                    dialog.mediaReady = true
                    if dialog.answerWhenReady { self.sendAnswer(dialog) }
                    ready()
                }
            }
        } catch {
            emit(.notice("Could not open the audio port."))
            if dialog.role == .outgoing {
                finish(dialog, result: "Failed", direction: .outbound)
            } else if let request = dialog.request {
                respond(500, "Server Internal Error", to: request, tag: dialog.localTag)
                finish(dialog, result: "Failed", direction: .missed)
            }
        }
    }

    @discardableResult
    private func applyRemoteAudio(_ dialog: LiveDialog, body: String) -> Bool {
        guard let audio = SipText.audio(in: body) else { return false }
        dialog.payload = audio.payload
        dialog.dtmfPayload = audio.dtmf
        let host = mediaHost(audio.address)
        rtp?.setRemote(host: host, port: UInt16(audio.port), payload: audio.payload, dtmf: audio.dtmf)
        if audio.direction == "sendonly" || audio.direction == "inactive" {
            dialog.remotelyHeld = true
        } else if audio.direction == "sendrecv" {
            dialog.remotelyHeld = false
        }
        applyMediaFlags()
        return true
    }

    private func applyMediaFlags() {
        guard let call else { return }
        rtp?.setMuted(call.muted || call.locallyHeld || call.remotelyHeld)
        rtp?.setPlaybackEnabled(!call.locallyHeld)
    }

    private func mediaHost(_ sdpAddress: String) -> String {
        if sdpAddress.isEmpty || sdpAddress == "0.0.0.0" { return serverIP }
        if SipText.isPrivateIPv4(sdpAddress) && !SipText.isPrivateIPv4(serverIP) {
            return serverIP
        }
        return sdpAddress
    }

    private func receive(_ data: Data) {
        guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let packet = SipPacket.parse(trimmed) else { return }
        log.info("\(packet.startLine, privacy: .public)")
        if packet.isResponse {
            handleResponse(packet)
        } else {
            handleRequest(packet)
        }
    }

    private func handleResponse(_ packet: SipPacket) {
        learnNat(packet)
        let key = pendingKey(packet.callId, packet.cseqMethod)
        guard let item = pending[key] else {
            if packet.cseqMethod == "INVITE", (200..<300).contains(packet.statusCode) {
                if let call, call.callId.caseInsensitiveCompare(packet.callId) == .orderedSame, let ack = call.lastAck {
                    socket?.send(Data(ack.utf8))
                } else if let endingCall, endingCall.callId.caseInsensitiveCompare(packet.callId) == .orderedSame {
                    learnDialog(endingCall, from: packet)
                    endingCall.answered = true
                    endingCall.connectedAt = endingCall.connectedAt ?? Date()
                    sendAck(endingCall, sameTransaction: false, cseq: packet.cseqNumber)
                    sendBye(endingCall)
                }
            }
            return
        }
        if packet.statusCode < 200 {
            item.retransmit = false
            item.timer?.cancel()
            item.onProvisional?(packet)
            return
        }
        item.retransmit = false
        item.timer?.cancel()
        pending[key] = nil
        if (packet.statusCode == 401 || packet.statusCode == 407), !item.alreadyRetried {
            retryAuth(item, challenge: packet)
            return
        }
        item.onFinal(packet)
    }

    private func handleRequest(_ packet: SipPacket) {
        switch packet.method.uppercased() {
        case "INVITE":
            handleIncomingInvite(packet)
        case "ACK":
            okItem?.cancel()
            if let call, call.callId.caseInsensitiveCompare(packet.callId) == .orderedSame {
                call.answered = true
            }
        case "BYE":
            respond(200, "OK", to: packet, tag: nil)
            if let call, call.callId.caseInsensitiveCompare(packet.callId) == .orderedSame {
                let direction: CallDirection = call.role == .incoming ? .inbound : .outbound
                finish(call, result: call.connectedAt == nil ? "Cancelled" : "Answered", direction: direction)
            }
        case "CANCEL":
            respond(200, "OK", to: packet, tag: nil)
            if let call, call.callId.caseInsensitiveCompare(packet.callId) == .orderedSame, !call.answered {
                if let invite = call.request {
                    respond(487, "Request Terminated", to: invite, tag: call.localTag)
                }
                finish(call, result: "Missed", direction: .missed)
            }
        case "OPTIONS":
            respond(200, "OK", to: packet, tag: nil, extra: [("Allow", "INVITE, ACK, CANCEL, BYE, OPTIONS, REGISTER, SUBSCRIBE, NOTIFY, PUBLISH, INFO")])
        case "INFO":
            respond(200, "OK", to: packet, tag: nil)
        case "NOTIFY":
            respond(200, "OK", to: packet, tag: SipText.tag())
            handleBlfNotify(packet)
        default:
            respond(405, "Method Not Allowed", to: packet, tag: nil)
        }
    }

    private func handleIncomingInvite(_ packet: SipPacket) {
        if let call, call.callId.caseInsensitiveCompare(packet.callId) == .orderedSame {
            if packet.body.contains("m=audio"), call.connectedAt != nil {
                handleRemoteReinvite(call, packet)
            } else if let last = call.lastResponse {
                socket?.send(last)
            }
            return
        }
        guard let account else {
            respond(480, "Temporarily Unavailable", to: packet, tag: nil)
            return
        }
        if call != nil || !registered || rejectIncoming {
            respond(486, "Busy Here", to: packet, tag: rejectIncoming ? SipText.tag() : nil)
            return
        }
        resetCallMeasurement()
        guard packet.body.contains("m=audio"), SipText.audio(in: packet.body) != nil else {
            respond(488, "Not Acceptable Here", to: packet, tag: SipText.tag())
            return
        }
        let from = packet.value("From") ?? ""
        let number = SipText.sipUser(from: from)
        let name = SipText.displayName(from: from)
        let remoteURI = SipText.contactURI(from) ?? SipText.requestURI(target: number, domain: account.domain)
        let contact = packet.value("Contact").flatMap(SipText.contactURI) ?? remoteURI
        let dialog = LiveDialog(
            uuid: UUID(),
            role: .incoming,
            number: number,
            displayName: name.isEmpty ? number : name,
            callId: packet.callId,
            localTag: SipText.tag(),
            localURI: "sip:\(account.extensionNumber)@\(account.domain)",
            remoteURI: remoteURI,
            remoteTarget: contact,
            localCSeq: 1,
            inviteCSeq: packet.cseqNumber,
            inviteBranch: ""
        )
        dialog.remoteTag = SipText.parameter("tag", in: from) ?? ""
        dialog.routes = packet.values("Record-Route")
        dialog.request = packet
        dialog.payload = SipText.audio(in: packet.body)?.payload ?? 0
        call = dialog
        respond(100, "Trying", to: packet, tag: nil)
        respond(180, "Ringing", to: packet, tag: dialog.localTag)
        emit(.incoming(IncomingState(id: dialog.uuid, number: dialog.number, name: dialog.displayName)))
        prepareMedia(dialog) {}
    }

    private func handleRemoteReinvite(_ dialog: LiveDialog, _ packet: SipPacket) {
        guard let audio = SipText.audio(in: packet.body) else {
            respond(488, "Not Acceptable Here", to: packet, tag: dialog.localTag)
            return
        }
        _ = applyRemoteAudio(dialog, body: packet.body)
        let answerDirection: String
        switch audio.direction {
        case "sendonly": answerDirection = "recvonly"
        case "recvonly": answerDirection = "sendonly"
        case "inactive": answerDirection = "inactive"
        default: answerDirection = dialog.locallyHeld ? "sendonly" : "sendrecv"
        }
        sessionVersion += 1
        let body = SipText.sdp(ip: dialog.mediaIP, port: dialog.mediaPort, payloads: [audio.payload], direction: answerDirection, sessionVersion: sessionVersion)
        respond(200, "OK", to: packet, tag: dialog.localTag, extra: [("Contact", contactHeader(expires: nil))], body: body)
        emit(callState(dialog, phase: dialog.phase))
    }

    private func retryAuth(_ item: PendingRequest, challenge packet: SipPacket) {
        guard let account else { return }
        let proxy = packet.statusCode == 407
        let headerName = proxy ? "Proxy-Authenticate" : "WWW-Authenticate"
        guard let challenge = packet.value(headerName) else {
            item.onFinal(packet)
            return
        }
        let nc = String(format: "%08x", authCount)
        authCount += 1
        guard let authorization = SipText.digest(
            method: item.method,
            uri: item.uri,
            username: account.username,
            password: password,
            challengeHeader: challenge,
            nc: nc
        ) else {
            item.onFinal(packet)
            return
        }
        let cseq: Int
        if item.callId.caseInsensitiveCompare(registerCallId) == .orderedSame {
            cseq = registerCSeq
            registerCSeq += 1
        } else if let call, call.callId.caseInsensitiveCompare(item.callId) == .orderedSame {
            call.localCSeq += 1
            cseq = call.localCSeq
            if item.method == "INVITE" && call.connectedAt == nil && call.role == .outgoing {
                call.inviteCSeq = cseq
            }
        } else if item.method == "PUBLISH" {
            publishCSeq += 1
            cseq = publishCSeq
        } else if item.method == "NOTIFY" {
            notifyCSeq += 1
            cseq = notifyCSeq
        } else if item.method == "SUBSCRIBE" {
            subscribeCSeq += 1
            cseq = subscribeCSeq
        } else if item.method == "OPTIONS" {
            optionsCSeq += 1
            cseq = optionsCSeq
        } else {
            cseq = item.cseq + 1
        }
        var extra = item.extra.filter { name, _ in
            name.caseInsensitiveCompare("Authorization") != .orderedSame && name.caseInsensitiveCompare("Proxy-Authorization") != .orderedSame
        }
        extra.append((proxy ? "Proxy-Authorization" : "Authorization", authorization))
        transmit(
            method: item.method,
            uri: item.uri,
            callId: item.callId,
            cseq: cseq,
            branch: SipText.branch(),
            from: item.from,
            to: item.to,
            routes: item.routes,
            extra: extra,
            body: item.body,
            auth: nil,
            proxyAuth: false,
            alreadyRetried: true,
            retransmit: item.method == "INVITE" || item.method == "REGISTER",
            onProvisional: item.onProvisional,
            onFinal: item.onFinal
        )
    }

    private func transmit(method: String, uri: String, callId: String, cseq: Int, branch: String, from: String, to: String, routes: [String], extra: [(String, String)], body: String, auth: String?, proxyAuth: Bool, alreadyRetried: Bool, retransmit: Bool, onProvisional: ((SipPacket) -> Void)?, onFinal: @escaping (SipPacket) -> Void) {
        var headers: [(String, String)] = [
            ("Via", via(branch)),
            ("Max-Forwards", "70"),
            ("From", from),
            ("To", to),
            ("Call-ID", callId),
            ("CSeq", "\(cseq) \(method)")
        ]
        for route in routes where !route.isEmpty {
            headers.append(("Route", route))
        }
        headers.append(contentsOf: extra)
        if let auth {
            headers.append((proxyAuth ? "Proxy-Authorization" : "Authorization", auth))
        }
        headers.append(("User-Agent", SipText.userAgent))
        if !body.isEmpty && !headers.contains(where: { $0.0.caseInsensitiveCompare("Content-Type") == .orderedSame }) {
            headers.append(("Content-Type", "application/sdp"))
        }
        let message = SipText.render(start: "\(method) \(uri) SIP/2.0", headers: headers, body: body)
        if method == "INVITE", let call, call.callId.caseInsensitiveCompare(callId) == .orderedSame {
            call.inviteBranch = branch
            call.inviteCSeq = cseq
        }
        log.info("SEND \(method, privacy: .public)")
        socket?.send(Data(message.utf8))
        let item = PendingRequest(
            method: method,
            uri: uri,
            callId: callId,
            cseq: cseq,
            branch: branch,
            from: from,
            to: to,
            routes: routes,
            extra: extra,
            body: body,
            alreadyRetried: alreadyRetried,
            retransmit: retransmit,
            packet: message,
            onProvisional: onProvisional,
            onFinal: onFinal
        )
        let key = pendingKey(callId, method)
        pending[key]?.timer?.cancel()
        pending[key] = item
        if retransmit { scheduleRetransmit(key) }
    }

    private func scheduleRetransmit(_ key: String) {
        let item = DispatchWorkItem { [weak self] in
            guard let self, let pending = self.pending[key], pending.retransmit else { return }
            pending.retries += 1
            if pending.retries > 5 {
                self.pending[key] = nil
                pending.onFinal(SipPacket(startLine: "SIP/2.0 408 Request Timeout", headers: [
                    ("Call-ID", pending.callId),
                    ("CSeq", "\(pending.cseq) \(pending.method)")
                ], body: ""))
                return
            }
            self.socket?.send(Data(pending.packet.utf8))
            self.scheduleRetransmit(key)
        }
        pending[key]?.timer?.cancel()
        pending[key]?.timer = item
        queue.asyncAfter(deadline: .now() + 1, execute: item)
    }

    private func scheduleOkRetransmit() {
        okItem?.cancel()
        okRetransmits = 0
        let item = DispatchWorkItem { [weak self] in
            guard let self, let data = self.call?.lastResponse else { return }
            self.okRetransmits += 1
            guard self.okRetransmits <= 6 else { return }
            self.socket?.send(data)
            self.scheduleOkRetransmitContinue()
        }
        okItem = item
        queue.asyncAfter(deadline: .now() + 1, execute: item)
    }

    private func scheduleOkRetransmitContinue() {
        let item = DispatchWorkItem { [weak self] in
            guard let self, let data = self.call?.lastResponse else { return }
            self.okRetransmits += 1
            guard self.okRetransmits <= 6 else { return }
            self.socket?.send(data)
            self.scheduleOkRetransmitContinue()
        }
        okItem = item
        queue.asyncAfter(deadline: .now() + 1, execute: item)
    }

    private func sendAck(_ dialog: LiveDialog, sameTransaction: Bool, cseq: Int? = nil) {
        let branch = sameTransaction ? dialog.inviteBranch : SipText.branch()
        let number = cseq ?? dialog.inviteCSeq
        let message = SipText.render(
            start: "ACK \(dialog.remoteTarget) SIP/2.0",
            headers: [
                ("Via", via(branch)),
                ("Max-Forwards", "70"),
                ("From", fromHeader(tag: dialog.localTag)),
                ("To", toHeader(dialog)),
                ("Call-ID", dialog.callId),
                ("CSeq", "\(number) ACK"),
                ("User-Agent", SipText.userAgent)
            ] + dialog.routes.map { ("Route", $0) },
            body: ""
        )
        dialog.lastAck = message
        socket?.send(Data(message.utf8))
    }

    private func sendBye(_ dialog: LiveDialog) {
        guard dialog.connectedAt != nil || dialog.answered else { return }
        dialog.localCSeq += 1
        let message = SipText.render(
            start: "BYE \(dialog.remoteTarget) SIP/2.0",
            headers: [
                ("Via", via(SipText.branch())),
                ("Max-Forwards", "70"),
                ("From", fromHeader(tag: dialog.localTag)),
                ("To", toHeader(dialog)),
                ("Call-ID", dialog.callId),
                ("CSeq", "\(dialog.localCSeq) BYE"),
                ("User-Agent", SipText.userAgent)
            ] + dialog.routes.map { ("Route", $0) },
            body: ""
        )
        socket?.send(Data(message.utf8))
    }

    private func sendCancel(_ dialog: LiveDialog) {
        let key = pendingKey(dialog.callId, "INVITE")
        pending[key]?.timer?.cancel()
        pending[key] = nil
        let message = SipText.render(
            start: "CANCEL \(dialog.remoteURI) SIP/2.0",
            headers: [
                ("Via", via(dialog.inviteBranch)),
                ("Max-Forwards", "70"),
                ("From", fromHeader(tag: dialog.localTag)),
                ("To", "<\(dialog.remoteURI)>"),
                ("Call-ID", dialog.callId),
                ("CSeq", "\(dialog.inviteCSeq) CANCEL"),
                ("User-Agent", SipText.userAgent)
            ],
            body: ""
        )
        socket?.send(Data(message.utf8))
    }

    private func respond(_ code: Int, _ reason: String, to request: SipPacket, tag: String?, extra: [(String, String)] = [], body: String = "") {
        var to = request.value("To") ?? request.value("t") ?? ""
        if let tag { to = SipText.withTag(to, tag: tag) }
        var headers = extra
        if !body.isEmpty && !headers.contains(where: { $0.0.caseInsensitiveCompare("Content-Type") == .orderedSame }) {
            headers.append(("Content-Type", "application/sdp"))
        }
        let message = SipText.response(code: code, reason: reason, to: request, toHeader: to, extra: headers, body: body)
        if request.method.uppercased() == "INVITE" || request.cseqMethod == "INVITE" {
            call?.lastResponse = Data(message.utf8)
            if code == 200 { scheduleOkRetransmit() }
        }
        log.info("SEND \(code, privacy: .public) \(reason, privacy: .public)")
        socket?.send(Data(message.utf8))
    }

    private func learnDialog(_ dialog: LiveDialog, from packet: SipPacket) {
        if let to = packet.value("To"), let tag = SipText.parameter("tag", in: to), !tag.isEmpty {
            dialog.remoteTag = tag
        }
        if let contact = packet.value("Contact"), let uri = SipText.contactURI(contact) {
            dialog.remoteTarget = uri
        }
        let routes = SipText.routes(from: packet)
        if !routes.isEmpty { dialog.routes = routes }
    }

    private func learnNat(_ packet: SipPacket) {
        guard let via = packet.values("Via").first ?? packet.values("v").first else { return }
        if let received = SipText.parameter("received", in: via), !received.isEmpty, !received.contains(":") {
            advertisedIP = received
        }
        if let rport = SipText.parameter("rport", in: via), let port = UInt16(rport), port > 0 {
            advertisedPort = port
        }
    }

    private func finish(_ dialog: LiveDialog, result: String, direction: CallDirection) {
        guard !dialog.finished else { return }
        dialog.finished = true
        endingCall = dialog
        okItem?.cancel()
        let keys = pending.keys.filter { $0.hasPrefix(dialog.callId.lowercased() + "|") }
        for key in keys {
            pending[key]?.timer?.cancel()
            pending[key] = nil
        }
        let duration = dialog.connectedAt.map { Date().timeIntervalSince($0) } ?? 0
        let quality = currentQualityLabel()
        stopQualityWatch()
        let record = CallRecord(
            id: UUID(),
            number: dialog.number,
            name: dialog.displayName == dialog.number ? "" : dialog.displayName,
            direction: direction,
            startedAt: dialog.startedAt,
            duration: duration,
            result: result,
            quality: quality
        )
        if call === dialog {
            call = nil
            rtp?.stop()
            rtp = nil
        }
        emit(.ended(dialog.uuid, record))
    }

    private func emitFailed(uuid: UUID, number: String, name: String, direction: CallDirection, result: String) {
        let record = CallRecord(id: UUID(), number: number, name: "", direction: direction, startedAt: Date(), duration: 0, result: result)
        emit(.ended(uuid, record))
    }

    private func callState(_ dialog: LiveDialog, phase: CallPhase) -> SipEvent {
        .outgoing(LiveCallState(
            id: dialog.uuid,
            number: dialog.number,
            name: dialog.displayName,
            phase: phase,
            muted: dialog.muted,
            held: dialog.locallyHeld || dialog.remotelyHeld,
            speaker: speakerEnabled,
            connectedAt: dialog.connectedAt
        ))
    }

    private func emitMedia() {
        guard let call else { return }
        emit(.media(call.uuid, muted: call.muted, held: call.locallyHeld || call.remotelyHeld, speaker: speakerEnabled))
    }

    private func fromHeader(tag: String) -> String {
        guard let account else { return "<sip:unknown>;tag=\(tag)" }
        let uri = "<sip:\(account.extensionNumber)@\(account.domain)>"
        let name = SipText.sanitized(account.displayName).replacingOccurrences(of: "\"", with: "")
        if name.isEmpty { return "\(uri);tag=\(tag)" }
        return "\"\(name)\" \(uri);tag=\(tag)"
    }

    private func toHeader(_ dialog: LiveDialog) -> String {
        dialog.remoteTag.isEmpty ? "<\(dialog.remoteURI)>" : "<\(dialog.remoteURI)>;tag=\(dialog.remoteTag)"
    }

    private func contactHeader(expires: Int?) -> String {
        guard let account else { return "" }
        var value = "<sip:\(account.extensionNumber)@\(advertisedIP):\(advertisedPort);transport=udp>"
        if let expires { value += ";expires=\(expires)" }
        return value
    }

    private func via(_ branch: String) -> String {
        "SIP/2.0/UDP \(advertisedIP):\(advertisedPort);branch=\(branch);rport"
    }

    private func pendingKey(_ callId: String, _ method: String) -> String {
        "\(callId.lowercased())|\(method.uppercased())"
    }

    private func describe(_ packet: SipPacket) -> String {
        switch packet.statusCode {
        case 404: return "That number could not be found."
        case 480, 408: return "There was no answer."
        case 486: return "The number is busy."
        case 488: return "This phone supports G.711 calls only."
        case 603: return "The call was declined."
        default: return "Call failed (\(packet.statusCode) \(packet.reason))."
        }
    }

    private func emit(_ event: SipEvent) {
        let callback = onEvent
        DispatchQueue.main.async { callback?(event) }
    }

    private func resetCallMeasurement() {
        measurementToken += 1
        latencyMs = 0
        latencyMeasured = false
        stopQualityWatch()
        emit(.quality("Not measured"))
    }

    private func stopQualityWatch() {
        qualityItem?.cancel()
        qualityItem = nil
        latencyItem?.cancel()
        latencyItem = nil
    }

    private func startQualityWatch() {
        scheduleQualityTick()
        probeLatency()
        scheduleLatencyProbe()
    }

    private func scheduleQualityTick() {
        qualityItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self, self.call?.connectedAt != nil else { return }
            self.emitQuality()
            self.scheduleQualityTick()
        }
        qualityItem = item
        queue.asyncAfter(deadline: .now() + 1, execute: item)
    }

    private func scheduleLatencyProbe() {
        latencyItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self, self.call?.connectedAt != nil else { return }
            self.probeLatency()
            self.scheduleLatencyProbe()
        }
        latencyItem = item
        queue.asyncAfter(deadline: .now() + 20, execute: item)
    }

    private func probeLatency() {
        guard let account, registered, call?.connectedAt != nil else { return }
        let token = measurementToken
        let started = Date()
        let cseq = optionsCSeq
        optionsCSeq += 1
        let host = advertisedIP.isEmpty ? account.domain : advertisedIP
        transmit(
            method: "OPTIONS",
            uri: "sip:\(account.domain)",
            callId: SipText.callId(host: host),
            cseq: cseq,
            branch: SipText.branch(),
            from: fromHeader(tag: SipText.tag()),
            to: "<sip:\(account.domain)>",
            routes: [],
            extra: [
                ("Contact", contactHeader(expires: nil)),
                ("Accept", "application/sdp")
            ],
            body: "",
            auth: nil,
            proxyAuth: false,
            alreadyRetried: false,
            retransmit: true,
            onProvisional: nil,
            onFinal: { [weak self] packet in
                guard let self, token == self.measurementToken, self.call?.connectedAt != nil else { return }
                guard (200..<300).contains(packet.statusCode) else { return }
                let elapsed = Date().timeIntervalSince(started) * 1000
                guard elapsed > 0 else { return }
                self.latencyMs = elapsed
                self.latencyMeasured = true
                self.emitQuality()
            }
        )
    }

    private func currentQualityLabel() -> String {
        let stats = rtp?.measurement() ?? (receivedPackets: 0, jitterMs: 0.0, lossPercent: 0.0)
        return DeskPhone.qualityLabel(
            receivedPackets: stats.receivedPackets,
            latencyMeasured: latencyMeasured,
            latencyMs: latencyMs,
            jitterMs: stats.jitterMs,
            lossPercent: stats.lossPercent
        )
    }

    private func emitQuality() {
        emit(.quality(currentQualityLabel()))
    }

    private func sendPresence(allowEtagRetry: Bool = true) {
        guard registered, let account else { return }
        if publishCallId.isEmpty {
            publishCallId = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
            publishTag = SipText.tag()
        }
        let status = lineStatus
        let generation = presenceGeneration
        let offline = status.caseInsensitiveCompare("Offline") == .orderedSame || status.caseInsensitiveCompare("Appear Offline") == .orderedSame
        let expires = offline ? 0 : 3600
        let cseq = publishCSeq
        publishCSeq += 1
        var extra: [(String, String)] = [
            ("Contact", contactHeader(expires: nil)),
            ("Event", "presence"),
            ("Expires", "\(expires)"),
            ("Content-Type", "application/pidf+xml")
        ]
        if !publishEtag.isEmpty {
            extra.append(("SIP-If-Match", publishEtag))
        }
        let uri = "sip:\(account.extensionNumber)@\(account.domain)"
        transmit(
            method: "PUBLISH",
            uri: uri,
            callId: publishCallId,
            cseq: cseq,
            branch: SipText.branch(),
            from: fromHeader(tag: publishTag),
            to: "<\(uri)>",
            routes: [],
            extra: extra,
            body: presenceDocument(status, offline: offline),
            auth: nil,
            proxyAuth: false,
            alreadyRetried: false,
            retransmit: true,
            onProvisional: nil,
            onFinal: { [weak self] packet in
                guard let self else { return }
                if (200..<300).contains(packet.statusCode) {
                    if let etag = packet.value("SIP-ETag")?.trimmingCharacters(in: .whitespacesAndNewlines), !etag.isEmpty {
                        self.publishEtag = etag
                    }
                    if offline { self.publishEtag = "" }
                    if generation == self.presenceGeneration {
                        self.presenceNeedsPublish = false
                    }
                } else if packet.statusCode == 412, allowEtagRetry {
                    self.publishEtag = ""
                    self.sendPresence(allowEtagRetry: false)
                }
            }
        )
    }

    private func sendDialogNote() {
        guard registered, let account else { return }
        if notifyCallId.isEmpty {
            notifyCallId = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
            notifyTag = SipText.tag()
        }
        let offHook = DeskPhone.isBusyOrDnd(lineStatus)
        let cseq = notifyCSeq
        notifyCSeq += 1
        let uri = "sip:\(account.extensionNumber)@\(account.domain)"
        let subscriptionState = offHook ? "active;expires=3600" : "terminated;reason=noresource"
        transmit(
            method: "NOTIFY",
            uri: uri,
            callId: notifyCallId,
            cseq: cseq,
            branch: SipText.branch(),
            from: fromHeader(tag: notifyTag),
            to: "<\(uri)>",
            routes: [],
            extra: [
                ("Contact", contactHeader(expires: nil)),
                ("Event", "dialog"),
                ("Subscription-State", subscriptionState),
                ("Content-Type", "application/dialog-info+xml")
            ],
            body: dialogDocument(offHook: offHook),
            auth: nil,
            proxyAuth: false,
            alreadyRetried: false,
            retransmit: true,
            onProvisional: nil,
            onFinal: { _ in }
        )
    }

    private func presenceDocument(_ status: String, offline: Bool) -> String {
        guard let account else { return "" }
        let note = xml(DeskPhone.presenceNote(status))
        let ext = xml(account.extensionNumber)
        let domain = xml(account.domain)
        let basic = offline ? "closed" : "open"
        let activity: String
        switch status.lowercased() {
        case "away", "appear away":
            activity = "      <rpid:away/>"
        case "dnd", "do not disturb":
            activity = "      <rpid:do-not-disturb/>\r\n      <rpid:on-the-phone/>"
        case "busy", "busyhere":
            activity = "      <rpid:busy/>\r\n      <rpid:on-the-phone/>"
        case "available":
            activity = "      <rpid:available/>"
        default:
            activity = ""
        }
        var lines = [
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
            "<presence xmlns=\"urn:ietf:params:xml:ns:pidf\"",
            "          xmlns:dm=\"urn:ietf:params:xml:ns:pidf:data-model\"",
            "          xmlns:rpid=\"urn:ietf:params:xml:ns:pidf:rpid\"",
            "          entity=\"sip:\(ext)@\(domain)\">",
            "  <tuple id=\"\(ext)\">",
            "    <status>",
            "      <basic>\(basic)</basic>",
            "    </status>",
            "    <note>\(note)</note>",
            "  </tuple>"
        ]
        if !activity.isEmpty {
            lines.append("  <dm:person id=\"p_\(ext)\">")
            lines.append("    <rpid:activities>")
            lines.append(activity)
            lines.append("    </rpid:activities>")
            lines.append("    <dm:note>\(note)</dm:note>")
            lines.append("  </dm:person>")
        }
        lines.append("</presence>")
        return lines.joined(separator: "\r\n") + "\r\n"
    }

    private func dialogDocument(offHook: Bool) -> String {
        guard let account else { return "" }
        let ext = xml(account.extensionNumber)
        let domain = xml(account.domain)
        let state = offHook ? "confirmed" : "terminated"
        let note = xml(offHook ? DeskPhone.busyHere : DeskPhone.availableNote)
        return [
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
            "<dialog-info xmlns=\"urn:ietf:params:xml:ns:dialog-info\" version=\"1\" state=\"full\"",
            "             entity=\"sip:\(ext)@\(domain)\">",
            "  <dialog id=\"\(ext)_offhook\" direction=\"recipient\">",
            "    <state>\(state)</state>",
            "    <notes>\(note)</notes>",
            "  </dialog>",
            "</dialog-info>"
        ].joined(separator: "\r\n") + "\r\n"
    }

    private func xml(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    private func subscribeWatched() {
        guard registered, account != nil else { return }
        var seen = Set<String>()
        var targets: [String] = []
        for number in watchedExtensions {
            let normalized = DeskPhone.normalize(number)
            guard !normalized.isEmpty, normalized.count <= 10 else { continue }
            guard seen.insert(normalized.lowercased()).inserted else { continue }
            targets.append(normalized)
        }
        for extensionNumber in targets {
            subscribe(extensionNumber, event: "dialog", accept: "application/dialog-info+xml")
            subscribe(extensionNumber, event: "presence", accept: "application/pidf+xml")
        }
    }

    private func subscribe(_ extensionNumber: String, event: String, accept: String) {
        guard let account else { return }
        let target = extensionNumber.contains("@") ? extensionNumber : "\(extensionNumber)@\(account.domain)"
        let callId = SipText.callId(host: advertisedIP.isEmpty ? account.domain : advertisedIP)
        subscriptionExtensions[callId.lowercased()] = DeskPhone.normalize(extensionNumber)
        let cseq = subscribeCSeq
        subscribeCSeq += 1
        transmit(
            method: "SUBSCRIBE",
            uri: "sip:\(target)",
            callId: callId,
            cseq: cseq,
            branch: SipText.branch(),
            from: fromHeader(tag: SipText.tag()),
            to: "<sip:\(target)>",
            routes: [],
            extra: [
                ("Contact", contactHeader(expires: nil)),
                ("Event", event),
                ("Accept", accept),
                ("Expires", "3600")
            ],
            body: "",
            auth: nil,
            proxyAuth: false,
            alreadyRetried: false,
            retransmit: true,
            onProvisional: nil,
            onFinal: { _ in }
        )
    }

    private func handleBlfNotify(_ packet: SipPacket) {
        let headerEvent = packet.value("Event")?.split(separator: ";").first.map {
            String($0).trimmingCharacters(in: .whitespacesAndNewlines)
        } ?? ""
        let eventName: String
        if packet.body.range(of: "dialog-info", options: .caseInsensitive) != nil {
            eventName = "dialog"
        } else if packet.body.range(of: "pidf", options: .caseInsensitive) != nil || headerEvent.caseInsensitiveCompare("presence") == .orderedSame {
            eventName = "presence"
        } else {
            eventName = headerEvent
        }
        var extensionNumber = subscriptionExtensions[packet.callId.lowercased()] ?? ""
        if extensionNumber.isEmpty {
            extensionNumber = BlfParser.extensionNumber(in: packet.body)
        }
        if extensionNumber.isEmpty {
            let fromExtension = DeskPhone.normalize(packet.value("From") ?? "")
            if fromExtension.caseInsensitiveCompare("asterisk") != .orderedSame && fromExtension.caseInsensitiveCompare("pbx") != .orderedSame {
                extensionNumber = fromExtension
            }
        }
        if extensionNumber.isEmpty {
            extensionNumber = DeskPhone.normalize(packet.value("To") ?? "")
        }
        let presence = BlfParser.state(in: packet.body)
        let key = DeskPhone.normalize(extensionNumber)
        guard !key.isEmpty, !presence.isEmpty else { return }
        let next = (blfChannels[key] ?? BlfChannels()).applying(presence, eventName: eventName)
        blfChannels[key] = next
        emit(.blf(key, next.resolve()))
    }
}
