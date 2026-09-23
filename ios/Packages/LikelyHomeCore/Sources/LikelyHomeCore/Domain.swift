import Foundation

public struct ChannelID: Hashable, Codable, Sendable {
    public let rawValue: Int
    public init(_ rawValue: Int) { self.rawValue = rawValue }
}

public enum ChannelVisibility: String, Codable, CaseIterable, Sendable {
    case `public`, closed, `private`
}

public struct Channel: Identifiable, Codable, Equatable, Sendable {
    public let id: ChannelID
    public let slug: String
    public let title: String
    public let description: String
    public let visibility: ChannelVisibility

    public init(id: ChannelID, slug: String, title: String, description: String, visibility: ChannelVisibility) {
        self.id = id
        self.slug = slug
        self.title = title
        self.description = description
        self.visibility = visibility
    }
}

public struct PageContext: Equatable, Sendable {
    public let url: URL?
    public let title: String
    public let description: String
    public let excerpt: String
    public let selectedText: String

    public init(url: URL?, title: String = "", description: String = "", excerpt: String = "", selectedText: String = "") {
        self.url = url
        self.title = title
        self.description = description
        self.excerpt = String(excerpt.prefix(4_000))
        self.selectedText = String(selectedText.prefix(4_000))
    }
}

public enum CaptureTarget: Equatable, Sendable {
    case link(URL)
    case text(value: String, sourceURL: URL?, sourceTitle: String)
    case remoteAsset(URL, sourceURL: URL?, sourceTitle: String)
    case arenaBlock(id: Int, sourceURL: URL)
    case arenaChannel(slug: String, sourceURL: URL)
    case localAsset(fileURL: URL, contentType: String, filename: String)
}

public struct Capture: Equatable, Sendable {
    public let target: CaptureTarget
    public let context: PageContext

    public init(target: CaptureTarget, context: PageContext) {
        self.target = target
        self.context = context
    }
}

public struct Ranking: Equatable, Sendable {
    public let orderedIDs: [ChannelID]
    public let suggestedIDs: Set<ChannelID>

    public init(orderedIDs: [ChannelID], suggestedIDs: Set<ChannelID>) {
        self.orderedIDs = orderedIDs
        self.suggestedIDs = suggestedIDs
    }
}

public struct ChannelSelection: Equatable, Sendable {
    public static let limit = 20
    public private(set) var ids: [ChannelID] = []

    public init() {}

    @discardableResult
    public mutating func toggle(_ id: ChannelID) -> Bool {
        if let index = ids.firstIndex(of: id) {
            ids.remove(at: index)
            return true
        }
        guard ids.count < Self.limit else { return false }
        ids.append(id)
        return true
    }
}

public struct ChannelSnapshot: Codable, Equatable, Sendable {
    public static let currentSchema = 1
    public let schemaVersion: Int
    public let accountID: Int
    public let fetchedAt: Date
    public let channels: [Channel]

    public init(accountID: Int, fetchedAt: Date = .now, channels: [Channel]) {
        self.schemaVersion = Self.currentSchema
        self.accountID = accountID
        self.fetchedAt = fetchedAt
        self.channels = channels
    }
}

public enum CoreError: LocalizedError, Equatable {
    case invalidResponse
    case unauthorized
    case setupRequired
    case noChannelsSelected
    case localAssetNeedsPublisher

    public var errorDescription: String? {
        switch self {
        case .invalidResponse: "The service returned an invalid response."
        case .unauthorized: "Your Are.na session expired. Sign in again."
        case .setupRequired: "Finish setup in Likely Home first."
        case .noChannelsSelected: "Choose at least one channel."
        case .localAssetNeedsPublisher: "This photo or file needs the Likely Home upload service."
        }
    }
}
