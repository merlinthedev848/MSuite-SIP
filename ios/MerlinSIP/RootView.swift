import SwiftUI

struct RootView: View {
    @EnvironmentObject private var phone: PhoneModel

    var body: some View {
        ZStack {
            Theme.canvas.ignoresSafeArea()
            if phone.signedIn {
                MainPhoneView()
            } else {
                SetupView()
            }
            if phone.incoming != nil && phone.liveCall == nil {
                IncomingCallView()
            }
            if phone.liveCall != nil {
                ActiveCallView()
            }
        }
    }
}
