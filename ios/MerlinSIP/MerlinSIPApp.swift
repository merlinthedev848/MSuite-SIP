import SwiftUI

@main
struct MerlinSIPApp: App {
    @StateObject private var phone = PhoneModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(phone)
                .tint(Theme.amber)
                .preferredColorScheme(phone.liveCall == nil && phone.incoming == nil ? .light : .dark)
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active {
                        phone.becameActive()
                    }
                }
        }
    }
}
