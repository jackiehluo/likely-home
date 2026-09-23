import AuthenticationServices
import CryptoKit
import LikelyHomeCore
import SwiftUI

@main
struct LikelyHomeApp: App {
    @State private var model = SetupModel()
    var body: some Scene { WindowGroup { SetupView(model: model) } }
}

@MainActor @Observable
final class SetupModel: NSObject, ASWebAuthenticationPresentationContextProviding {
    var arenaConnected = SharedStore.credential("arena-token") != nil
    var jevKey = SharedStore.credential("jev-key") ?? ""
    var hasSavedJevKey = SharedStore.credential("jev-key") != nil
    var channelCount = (try? SharedStore.cache().read()?.channels.count) ?? 0
    var isWorking = false
    var message: String?
    private var session: ASWebAuthenticationSession?

    func signIn() async {
        isWorking = true; defer { isWorking = false }
        do {
            let cache = try SharedStore.cache()
            guard let clientID = Bundle.main.object(forInfoDictionaryKey: "ArenaClientID") as? String,
                  !clientID.isEmpty else { throw SetupError.oauthClientMissing }
            let verifier = Self.randomURLSafe(count: 64)
            let state = Self.randomURLSafe(count: 32)
            let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded
            var parts = URLComponents(string: "https://www.are.na/oauth/authorize")!
            parts.queryItems = [
                .init(name: "client_id", value: clientID),
                .init(name: "redirect_uri", value: "likelyhome://oauth/arena"),
                .init(name: "response_type", value: "code"), .init(name: "scope", value: "write"),
                .init(name: "state", value: state), .init(name: "code_challenge", value: challenge),
                .init(name: "code_challenge_method", value: "S256"),
            ]
            let callback = try await authenticate(parts.url!)
            guard URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "state" })?.value == state,
                  let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else { throw CoreError.invalidResponse }
            var request = URLRequest(url: URL(string: "https://api.are.na/v3/oauth/token")!)
            request.httpMethod = "POST"; request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            var form = URLComponents(); form.queryItems = [
                .init(name: "grant_type", value: "authorization_code"),
                .init(name: "client_id", value: clientID),
                .init(name: "code", value: code), .init(name: "redirect_uri", value: "likelyhome://oauth/arena"),
                .init(name: "code_verifier", value: verifier),
            ]
            request.httpBody = form.percentEncodedQuery?.data(using: .utf8)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let token = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let value = token["access_token"] as? String else { throw CoreError.invalidResponse }
            let snapshot = try await ArenaClient(token: value).fetchChannels()
            try cache.replace(with: snapshot)
            try SharedStore.setCredential(value, account: "arena-token")
            channelCount = snapshot.channels.count
            arenaConnected = true
        } catch { message = error.localizedDescription }
    }

    func saveJevKey() {
        do {
            try SharedStore.setCredential(jevKey.trimmingCharacters(in: .whitespacesAndNewlines), account: "jev-key")
            hasSavedJevKey = true
            message = "Jev key saved."
        }
        catch { message = error.localizedDescription }
    }

    func refreshChannels() async throws {
        guard let token = SharedStore.credential("arena-token") else { throw CoreError.setupRequired }
        let snapshot = try await ArenaClient(token: token).fetchChannels()
        try SharedStore.cache().replace(with: snapshot)
        channelCount = snapshot.channels.count
    }

    private func authenticate(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "likelyhome") { url, error in
                if let url { continuation.resume(returning: url) }
                else { continuation.resume(throwing: error ?? CoreError.invalidResponse) }
            }
            session.presentationContextProvider = self; self.session = session; session.start()
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
    private static func randomURLSafe(count: Int) -> String { Data((0..<count).map { _ in UInt8.random(in: 0...255) }).base64URLEncoded }
}

private enum SetupError: LocalizedError {
    case oauthClientMissing

    var errorDescription: String? {
        "Add the iOS Are.na OAuth client ID to Config.xcconfig."
    }
}

private extension Data {
    var base64URLEncoded: String { base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
}

struct SetupView: View {
    @Bindable var model: SetupModel

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(spacing: 0) {
                        HouseMark()
                            .frame(width: 40, height: 40)
                            .padding(.bottom, 18)
                        Text("likely home")
                            .font(.custom("Arial-BoldMT", size: 18))
                            .foregroundStyle(ink)
                            .padding(.bottom, 10)
                        Text("sort your are.na channels by where a page probably belongs.")
                            .font(.custom("Arial", size: 14))
                            .multilineTextAlignment(.center)
                            .foregroundStyle(ink)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 48)

                    if !model.arenaConnected {
                        primaryButton("connect are.na") { Task { await model.signIn() } }
                            .disabled(model.isWorking)
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("are.na connected")
                            .font(.custom("Arial-BoldMT", size: 15))
                            .foregroundStyle(ink)
                            .padding(.bottom, 6)
                        Button("reconnect are.na") { Task { await model.signIn() } }
                            .buttonStyle(.plain)
                            .font(.custom("Arial", size: 13))
                            .underline()
                            .foregroundStyle(muted)
                            .disabled(model.isWorking)
                            .padding(.bottom, 42)

                        Text("jev api key")
                            .font(.custom("Arial-BoldMT", size: 15))
                            .foregroundStyle(ink)
                            .padding(.bottom, 8)
                        Text("Jev sorts your channels by where a page probably belongs.")
                            .font(.custom("Arial", size: 14))
                            .foregroundStyle(muted)
                            .padding(.bottom, 16)
                        SecureField("api key", text: $model.jevKey)
                            .font(.custom("Arial", size: 14))
                            .padding(.horizontal, 12)
                            .frame(height: 42)
                            .background(Color(red: 0.965, green: 0.965, blue: 0.955))
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(.bottom, 12)
                        primaryButton(model.hasSavedJevKey ? "update key" : "save key") {
                            model.saveJevKey()
                        }
                        .disabled(
                            model.jevKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        )
                        .padding(.bottom, 14)
                        Link(
                            "where do i get a key?",
                            destination: URL(string: "https://console.typesafe.ai/keys")!
                        )
                        .font(.custom("Arial", size: 13))
                        .underline()
                        .foregroundStyle(muted)
                        .padding(.bottom, 42)

                        Button("refresh \(model.channelCount) channels") {
                            Task {
                                model.isWorking = true
                                defer { model.isWorking = false }
                                do { try await model.refreshChannels() } catch {
                                    model.message = error.localizedDescription
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .font(.custom("Arial", size: 14))
                        .underline()
                        .foregroundStyle(ink)
                        .disabled(model.isWorking)

                        if model.hasSavedJevKey {
                            Text("Ready. Share a page and choose Likely Home.")
                                .font(.custom("Arial", size: 13))
                                .foregroundStyle(muted)
                                .padding(.top, 16)
                        }
                    }
                    if model.arenaConnected { Spacer(minLength: 32) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.top, model.arenaConnected ? 44 : 0)
                .frame(
                    minHeight: geometry.size.height,
                    alignment: model.arenaConnected ? .top : .center)
            }
        }
        .background(.white)
        .preferredColorScheme(.light)
        .alert("Likely Home", isPresented: .constant(model.message != nil)) {
            Button("OK") { model.message = nil }
        } message: { Text(model.message ?? "") }
    }

    private var ink: Color { Color(white: 0.09) }
    private var muted: Color { Color(white: 0.39) }

    private func primaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .font(.custom("Arial", size: 14))
            .foregroundStyle(.white)
            .frame(minHeight: 40)
            .padding(.horizontal, 16)
            .background(ink)
            .buttonStyle(.plain)
    }
}
