import LikelyHomeCore
import PDFKit
import SwiftUI
import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private var model: ShareModel?

    override func viewDidLoad() {
        super.viewDidLoad()
        preferredContentSize = CGSize(width: 0, height: 480)
        let model = ShareModel(extensionContext: extensionContext)
        self.model = model
        let host = UIHostingController(rootView: ShareView(model: model))
        addChild(host)
        view.addSubview(host.view)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)
        Task { await model.start() }
    }
}

@MainActor
final class ShareModel: ObservableObject {
    enum Phase: Equatable { case loading, ready, saving, saved, setup, failed(String) }
    @Published var phase: Phase = .loading
    @Published var capture: Capture?
    @Published var channels: [Channel] = []
    @Published var order: [ChannelID] = []
    @Published var selection = ChannelSelection()
    @Published var query = ""
    @Published var showingCreate = false
    @Published var newChannelTitle = ""
    @Published var newChannelVisibility: ChannelVisibility = .private
    private weak var extensionContext: NSExtensionContext?

    init(extensionContext: NSExtensionContext?) { self.extensionContext = extensionContext }

    var needsUploadService: Bool {
        guard let capture else { return false }
        if case .localAsset = capture.target { return true }
        return false
    }

    var visibleChannels: [Channel] {
        let byID = Dictionary(uniqueKeysWithValues: channels.map { ($0.id, $0) })
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return order.compactMap { byID[$0] }.filter { needle.isEmpty || "\($0.title) \($0.description)".lowercased().contains(needle) }
    }

    func start() async {
        guard SharedStore.credential("arena-token") != nil,
              let key = SharedStore.credential("jev-key"), !key.isEmpty,
              let snapshot = try? SharedStore.cache().read() else { phase = .setup; return }
        do {
            capture = try await ShareResolver.resolve(extensionContext?.inputItems ?? [])
            channels = snapshot.channels; order = channels.map(\.id); phase = .ready
            if let capture, let ranking = await JevClient(apiKey: key).rank(context: capture.context, channels: channels) {
                order = ranking.orderedIDs
            }
        } catch { phase = .failed(error.localizedDescription) }
    }

    func toggle(_ id: ChannelID) { _ = selection.toggle(id) }

    func createChannel() async {
        guard let token = SharedStore.credential("arena-token") else { phase = .setup; return }
        do {
            let channel = try await ArenaClient(token: token).createChannel(title: newChannelTitle, visibility: newChannelVisibility)
            try SharedStore.cache().prepend(channel)
            channels.insert(channel, at: 0); order.removeAll { $0 == channel.id }; order.insert(channel.id, at: 0)
            _ = selection.toggle(channel.id); showingCreate = false; newChannelTitle = ""
        } catch { phase = .failed(error.localizedDescription) }
    }

    func save() async {
        guard let token = SharedStore.credential("arena-token"), let capture else { phase = .setup; return }
        phase = .saving
        do {
            _ = try await ArenaClient(token: token).save(capture.target, channelIDs: selection.ids)
            phase = .saved
            try? await Task.sleep(for: .milliseconds(350))
            extensionContext?.completeRequest(returningItems: nil)
        } catch { phase = .failed(error.localizedDescription) }
    }

    func cancel() { extensionContext?.cancelRequest(withError: CocoaError(.userCancelled)) }
}

@MainActor enum ShareResolver {
    static func resolve(_ items: [Any]) async throws -> Capture {
        let providers = items.compactMap { $0 as? NSExtensionItem }.flatMap { $0.attachments ?? [] }
        if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier) }),
           let payload = try? await provider.loadSafariPayload(),
           let url = URL(string: payload.url) {
            let context = PageContext(url: url, title: payload.title, description: payload.description, excerpt: payload.excerpt, selectedText: payload.selectedText)
            let target: CaptureTarget = payload.selectedText.isEmpty
                ? arenaTarget(for: url)
                : .text(value: payload.selectedText, sourceURL: url, sourceTitle: payload.title)
            return Capture(target: target, context: context)
        }
        if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }),
           let url = try? await provider.loadSharedURL() {
            let context = await WebContext.fetch(url)
            return Capture(target: arenaTarget(for: context.url ?? url), context: context)
        }
        if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }),
           let text = try? await provider.loadSharedText() {
            if let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)), ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
                let context = await WebContext.fetch(url)
                return Capture(target: arenaTarget(for: context.url ?? url), context: context)
            }
            return Capture(target: .text(value: text, sourceURL: nil, sourceTitle: ""), context: PageContext(url: nil, excerpt: text, selectedText: text))
        }
        for type in [UTType.image, UTType.pdf] {
            if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(type.identifier) }),
               let file = try? await provider.copySharedFile(type: type) {
                let excerpt = type == .pdf ? (PDFDocument(url: file)?.string ?? "") : ""
                return Capture(target: .localAsset(fileURL: file, contentType: type.preferredMIMEType ?? "application/octet-stream", filename: file.lastPathComponent), context: PageContext(url: nil, title: file.lastPathComponent, excerpt: excerpt))
            }
        }
        throw CoreError.invalidResponse
    }

    private static func arenaTarget(for url: URL) -> CaptureTarget {
        guard url.host()?.hasSuffix("are.na") == true else { return .link(url) }
        let parts = url.pathComponents.filter { $0 != "/" }
        if parts.count == 2, parts[0] == "block", let id = Int(parts[1]) { return .arenaBlock(id: id, sourceURL: url) }
        if parts.count == 2 { return .arenaChannel(slug: parts[1], sourceURL: url) }
        return .link(url)
    }
}

private struct SafariPayload: Sendable {
    let url: String
    let title: String
    let description: String
    let excerpt: String
    let selectedText: String
}

@MainActor private extension NSItemProvider {
    func loadSafariPayload() async throws -> SafariPayload {
        try await withCheckedThrowingContinuation { continuation in
            loadItem(forTypeIdentifier: UTType.propertyList.identifier) { item, error in
                if let error { continuation.resume(throwing: error); return }
                guard let outer = item as? [String: Any],
                      let result = outer[NSExtensionJavaScriptPreprocessingResultsKey] as? [String: Any],
                      let url = result["url"] as? String else {
                    continuation.resume(throwing: CoreError.invalidResponse)
                    return
                }
                continuation.resume(returning: SafariPayload(
                    url: url,
                    title: result["title"] as? String ?? "",
                    description: result["description"] as? String ?? "",
                    excerpt: result["excerpt"] as? String ?? "",
                    selectedText: result["selectedText"] as? String ?? ""
                ))
            }
        }
    }

    func loadSharedURL() async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            loadItem(forTypeIdentifier: UTType.url.identifier) { item, error in
                if let error { continuation.resume(throwing: error) }
                else if let url = item as? URL { continuation.resume(returning: url) }
                else if let text = item as? String, let url = URL(string: text) { continuation.resume(returning: url) }
                else { continuation.resume(throwing: CoreError.invalidResponse) }
            }
        }
    }

    func loadSharedText() async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, error in
                if let error { continuation.resume(throwing: error) }
                else if let text = item as? String { continuation.resume(returning: text) }
                else { continuation.resume(throwing: CoreError.invalidResponse) }
            }
        }
    }

    func copySharedFile(type: UTType) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            loadFileRepresentation(forTypeIdentifier: type.identifier) { source, error in
                do {
                    if let error { throw error }
                    guard let source,
                          let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: SharedStore.appGroup) else {
                        throw CoreError.invalidResponse
                    }
                    let root = group.appending(path: "Shares", directoryHint: .isDirectory)
                    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
                    let suffix = source.pathExtension.isEmpty ? type.preferredFilenameExtension ?? "file" : source.pathExtension
                    let destination = root.appending(path: UUID().uuidString + "." + suffix)
                    try FileManager.default.copyItem(at: source, to: destination)
                    continuation.resume(returning: destination)
                } catch { continuation.resume(throwing: error) }
            }
        }
    }
}

struct ShareView: View {
    @ObservedObject var model: ShareModel

    var body: some View {
        VStack(spacing: 0) {
            header
            switch model.phase {
            case .loading: status("Loading…")
            case .setup: status("Finish setup in the Likely Home app.")
            case .saving: status("Saving…")
            case .saved: status("Saved")
            case .failed(let message): status(message)
            case .ready: picker
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .preferredColorScheme(.light)
    }

    private var header: some View {
        HStack(spacing: 10) {
            HouseMark().frame(width: 24, height: 24)
                .accessibilityLabel("Likely Home")
            VStack(alignment: .leading, spacing: 3) {
                if let capture = model.capture {
                    Text(captureTitle(capture))
                        .font(.custom("Arial", size: 14))
                        .foregroundStyle(ShareStyle.ink)
                        .lineLimit(1)
                    Text(capture.context.url?.host() ?? "Selected text")
                        .font(.custom("Arial", size: 12))
                        .foregroundStyle(ShareStyle.muted)
                        .lineLimit(1)
                } else {
                    Text("likely home")
                        .font(.custom("Arial-BoldMT", size: 14))
                        .foregroundStyle(ShareStyle.ink)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: model.cancel) {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .medium))
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
            .foregroundStyle(ShareStyle.muted)
            .accessibilityLabel("Close")
        }
        .padding(.leading, 16)
        .padding(.trailing, 10)
        .frame(height: 64)
        .overlay(alignment: .bottom) { ShareStyle.rule }
    }

    private var picker: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14))
                    .foregroundStyle(ShareStyle.muted)
                TextField("Search channels", text: $model.query)
                    .font(.custom("Arial", size: 14))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            .padding(.horizontal, 10)
            .frame(height: 36)
            .overlay(Rectangle().stroke(ShareStyle.searchBorder, lineWidth: 1))
            .padding(10)
            .overlay(alignment: .bottom) { ShareStyle.rule }

            ScrollView {
                LazyVStack(spacing: 0) {
                    if model.needsUploadService {
                        Text("Local files need an upload service. Share a public URL instead.")
                            .font(.custom("Arial", size: 13))
                            .foregroundStyle(ShareStyle.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                    }
                    if model.showingCreate { createForm }
                    else {
                        Button("+ New channel") { model.showingCreate = true }
                            .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
                            .padding(.horizontal, 14)
                            .buttonStyle(.plain)
                            .font(.custom("Arial", size: 14))
                            .overlay(alignment: .bottom) { ShareStyle.rule }
                    }
                    ForEach(model.visibleChannels) { channel in channelRow(channel) }
                    if model.visibleChannels.isEmpty {
                        Text("No matching channels.")
                            .font(.custom("Arial", size: 13))
                            .foregroundStyle(ShareStyle.muted)
                            .padding(24)
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            footer
        }
    }

    private func channelRow(_ channel: Channel) -> some View {
        let selected = model.selection.ids.contains(channel.id)
        return Button { model.toggle(channel.id) } label: {
            HStack(spacing: 10) {
                ZStack {
                    Rectangle()
                        .fill(selected ? ShareStyle.ink : .white)
                    Rectangle()
                        .stroke(selected ? ShareStyle.ink : ShareStyle.checkboxBorder, lineWidth: 1)
                    if selected {
                        Image(systemName: "checkmark")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 18, height: 18)
                Text(channel.title)
                    .font(.custom("Arial", size: 14))
                    .foregroundStyle(ShareStyle.ink)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .frame(height: 42)
            .frame(maxWidth: .infinity)
            .background(selected ? ShareStyle.selected : .white)
            .overlay(alignment: .bottom) { ShareStyle.rule }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var createForm: some View {
        VStack(spacing: 9) {
            TextField("Channel name", text: $model.newChannelTitle)
                .font(.custom("Arial", size: 14))
                .padding(.horizontal, 9)
                .frame(height: 36)
                .background(.white)
                .overlay(Rectangle().stroke(ShareStyle.searchBorder, lineWidth: 1))
            HStack(spacing: 4) {
                ForEach(ChannelVisibility.allCases, id: \.self) { visibility in
                    let selected = model.newChannelVisibility == visibility
                    Button(visibility.rawValue.capitalized) { model.newChannelVisibility = visibility }
                        .font(.custom("Arial", size: 11))
                        .foregroundStyle(selected ? .white : ShareStyle.muted)
                        .frame(maxWidth: .infinity, minHeight: 30)
                        .background(selected ? ShareStyle.ink : .white)
                        .overlay(Rectangle().stroke(selected ? ShareStyle.ink : ShareStyle.searchBorder, lineWidth: 1))
                }
            }
            HStack {
                Spacer()
                Button("Cancel") { model.showingCreate = false }
                    .foregroundStyle(ShareStyle.muted)
                Button("Create") { Task { await model.createChannel() } }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .frame(height: 30)
                    .background(ShareStyle.ink)
                    .disabled(model.newChannelTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .font(.custom("Arial", size: 13))
        }
        .buttonStyle(.plain)
        .padding(12)
        .background(ShareStyle.form)
        .overlay(alignment: .bottom) { ShareStyle.rule }
    }

    private var footer: some View {
        HStack {
            Spacer()
            Button(model.selection.ids.isEmpty ? "Save" : "Save to \(model.selection.ids.count)") {
                Task { await model.save() }
            }
            .font(.custom("Arial", size: 14))
            .foregroundStyle(.white)
            .frame(minWidth: 96, minHeight: 36)
            .background(model.selection.ids.isEmpty || model.needsUploadService ? ShareStyle.disabled : ShareStyle.ink)
            .disabled(model.selection.ids.isEmpty || model.needsUploadService)
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .frame(height: 52)
        .overlay(alignment: .top) { ShareStyle.rule }
    }

    private func status(_ message: String) -> some View {
        Text(message)
            .font(.custom("Arial", size: 14))
            .foregroundStyle(ShareStyle.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(24)
    }

    private func captureTitle(_ capture: Capture) -> String {
        if !capture.context.title.isEmpty { return capture.context.title }
        switch capture.target {
        case .text(let value, _, _): return String(value.prefix(120))
        case .localAsset(_, _, let filename): return filename
        default: return capture.context.url?.absoluteString ?? "Shared item"
        }
    }

}

private enum ShareStyle {
    static let ink = Color(white: 0.07)
    static let muted = Color(white: 0.45)
    static let line = Color(white: 0.86)
    static let searchBorder = Color(white: 0.67)
    static let checkboxBorder = Color(white: 0.55)
    static let selected = Color(white: 0.94)
    static let form = Color(red: 0.97, green: 0.97, blue: 0.955)
    static let disabled = Color(white: 0.78)
    static var rule: some View { Rectangle().fill(line).frame(height: 1) }
}
