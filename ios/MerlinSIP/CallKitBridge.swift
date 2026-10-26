import AVFoundation
import CallKit
import Foundation

final class CallKitBridge: NSObject, CXProviderDelegate {
    var onStart: ((UUID, String) -> Void)?
    var onAnswer: ((UUID) -> Void)?
    var onEnd: ((UUID) -> Void)?
    var onMute: ((UUID, Bool) -> Void)?
    var onHold: ((UUID, Bool) -> Void)?
    var onDTMF: ((UUID, String) -> Void)?
    var onAudio: ((Bool) -> Void)?

    private let provider: CXProvider
    private let controller = CXCallController()

    override init() {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = false
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 1
        configuration.supportedHandleTypes = [.generic, .phoneNumber]
        configuration.includesCallsInRecents = true
        provider = CXProvider(configuration: configuration)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    func startOutgoing(uuid: UUID, number: String, name: String, completion: @escaping (Bool) -> Void) {
        let action = CXStartCallAction(call: uuid, handle: CXHandle(type: .generic, value: number))
        action.isVideo = false
        action.contactIdentifier = name
        controller.request(CXTransaction(action: action)) { error in
            DispatchQueue.main.async { completion(error == nil) }
        }
    }

    func reportIncoming(_ call: IncomingState, completion: @escaping (Bool) -> Void) {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: call.number)
        update.localizedCallerName = call.title
        update.hasVideo = false
        update.supportsHolding = true
        update.supportsDTMF = true
        update.supportsGrouping = false
        update.supportsUngrouping = false
        provider.reportNewIncomingCall(with: call.id, update: update) { error in
            DispatchQueue.main.async { completion(error == nil) }
        }
    }

    func reportConnected(_ uuid: UUID) {
        provider.reportOutgoingCall(with: uuid, connectedAt: Date())
    }

    func answer(_ uuid: UUID) {
        controller.request(CXTransaction(action: CXAnswerCallAction(call: uuid))) { _ in }
    }

    func end(_ uuid: UUID) {
        controller.request(CXTransaction(action: CXEndCallAction(call: uuid))) { _ in }
    }

    func reportEnded(_ uuid: UUID, kind: CallEndKind) {
        let reason: CXCallEndedReason
        switch kind {
        case .remote: reason = .remoteEnded
        case .unanswered: reason = .unanswered
        case .failed: reason = .failed
        }
        provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
    }

    func providerDidReset(_ provider: CXProvider) {
        onAudio?(false)
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        configureSession()
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
        onStart?(action.callUUID, action.handle.value)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        configureSession()
        onAnswer?(action.callUUID)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        onEnd?(action.callUUID)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        onMute?(action.callUUID, action.isMuted)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        onHold?(action.callUUID, action.isOnHold)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXPlayDTMFCallAction) {
        onDTMF?(action.callUUID, action.digits)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        onAudio?(true)
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        onAudio?(false)
    }

    private func configureSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
        try? session.setPreferredIOBufferDuration(0.02)
    }
}

enum CallEndKind {
    case remote
    case unanswered
    case failed
}
