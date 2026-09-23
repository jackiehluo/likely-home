import Foundation

public struct ChannelCache: Sendable {
    public let fileURL: URL
    public init(fileURL: URL) { self.fileURL = fileURL }

    public func read() throws -> ChannelSnapshot? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        let snapshot = try JSONDecoder().decode(ChannelSnapshot.self, from: Data(contentsOf: fileURL))
        guard snapshot.schemaVersion == ChannelSnapshot.currentSchema else { return nil }
        return snapshot
    }

    public func replace(with snapshot: ChannelSnapshot) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(snapshot)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUnlessOpen])
    }

    public func prepend(_ channel: Channel) throws {
        guard let current = try read() else { return }
        try replace(with: ChannelSnapshot(
            accountID: current.accountID,
            fetchedAt: current.fetchedAt,
            channels: [channel] + current.channels.filter { $0.id != channel.id }
        ))
    }
}
