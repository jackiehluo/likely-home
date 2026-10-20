import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public protocol HTTPTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
    func upload(for request: URLRequest, from fileURL: URL) async throws -> (Data, HTTPURLResponse)
}

public extension HTTPTransport {
    func upload(for request: URLRequest, from fileURL: URL) async throws -> (Data, HTTPURLResponse) {
        var request = request
        request.httpBody = try Data(contentsOf: fileURL)
        return try await data(for: request)
    }
}

public struct URLSessionTransport: HTTPTransport {
    public init() {}
    public func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CoreError.invalidResponse }
        return (data, http)
    }

    public func upload(for request: URLRequest, from fileURL: URL) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await URLSession.shared.upload(for: request, fromFile: fileURL)
        guard let http = response as? HTTPURLResponse else { throw CoreError.invalidResponse }
        return (data, http)
    }
}

public struct ArenaClient: Sendable {
    private let token: String
    private let transport: any HTTPTransport
    private let decoder = JSONDecoder()

    public init(token: String, transport: any HTTPTransport = URLSessionTransport()) {
        self.token = token
        self.transport = transport
    }

    private func request(path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        guard let url = URL(string: "https://api.are.na\(path)") else { throw CoreError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await transport.data(for: request)
        if response.statusCode == 401 { throw CoreError.unauthorized }
        guard (200..<300).contains(response.statusCode) else { throw CoreError.invalidResponse }
        return data
    }

    public func fetchChannels() async throws -> ChannelSnapshot {
        let me = try decoder.decode(UserWire.self, from: await request(path: "/v3/me"))
        var page = 1
        var output: [Channel] = []
        var seen = Set<ChannelID>()
        while true {
            let result = try decoder.decode(ChannelPageWire.self, from: await request(path: "/v3/users/\(me.id)/contents?type=Channel&page=\(page)&per=100"))
            for wire in result.data where wire.can?.addTo != false {
                let channel = wire.domain
                if seen.insert(channel.id).inserted { output.append(channel) }
            }
            guard page < result.meta.totalPages else { break }
            page += 1
        }
        return ChannelSnapshot(accountID: me.id, channels: output)
    }

    public func createChannel(title: String, visibility: ChannelVisibility) async throws -> Channel {
        let body = try JSONEncoder().encode(CreateChannelBody(title: title.trimmingCharacters(in: .whitespacesAndNewlines), visibility: visibility))
        return try decoder.decode(ChannelWire.self, from: await request(path: "/v3/channels", method: "POST", body: body)).domain
    }

    public func save(_ target: CaptureTarget, channelIDs: [ChannelID]) async throws -> URL? {
        guard (1...ChannelSelection.limit).contains(channelIDs.count) else { throw CoreError.noChannelsSelected }
        let channels = channelIDs.map { ChannelReference(id: $0.rawValue) }
        switch target {
        case .arenaBlock(let id, _):
            let body = try JSONEncoder().encode(ConnectionBody(connectableID: id, connectableType: "Block", channels: channels))
            _ = try await request(path: "/v3/connections", method: "POST", body: body)
            return nil
        case .arenaChannel(let slug, _):
            let encoded = slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? slug
            let channel = try decoder.decode(ChannelWire.self, from: await request(path: "/v3/channels/\(encoded)"))
            let body = try JSONEncoder().encode(ConnectionBody(connectableID: channel.id, connectableType: "Channel", channels: channels))
            _ = try await request(path: "/v3/connections", method: "POST", body: body)
            return nil
        case .localAsset(let fileURL, let contentType, let filename):
            return try await uploadAndCreateBlock(fileURL: fileURL, contentType: contentType, filename: filename, channels: channels)
        case .link(let url):
            return try await createBlock(value: url.absoluteString, title: nil, sourceURL: nil, sourceTitle: nil, channels: channels)
        case .text(let value, let sourceURL, let sourceTitle):
            return try await createBlock(value: value, title: sourceTitle, sourceURL: sourceURL, sourceTitle: sourceTitle, channels: channels)
        case .remoteAsset(let url, let sourceURL, let sourceTitle):
            return try await createBlock(value: url.absoluteString, title: nil, sourceURL: sourceURL, sourceTitle: sourceTitle, channels: channels)
        }
    }

    private func uploadAndCreateBlock(fileURL: URL, contentType: String, filename: String, channels: [ChannelReference]) async throws -> URL? {
        let body = try JSONEncoder().encode(PresignBody(files: [.init(filename: filename, contentType: contentType)]))
        let presign = try decoder.decode(PresignResponse.self, from: await request(path: "/v3/uploads/presign", method: "POST", body: body))
        guard presign.files.count == 1, let file = presign.files.first,
              let uploadURL = URL(string: file.uploadURL), uploadURL.scheme == "https" else {
            throw CoreError.invalidResponse
        }

        var upload = URLRequest(url: uploadURL)
        upload.httpMethod = "PUT"
        upload.setValue(file.contentType, forHTTPHeaderField: "Content-Type")
        let (_, response) = try await transport.upload(for: upload, from: fileURL)
        guard (200..<300).contains(response.statusCode) else { throw CoreError.uploadFailed }

        var location = URLComponents()
        location.scheme = "https"
        location.host = "s3.amazonaws.com"
        location.path = "/arena_images-temp/\(file.key)"
        guard let value = location.url else { throw CoreError.invalidResponse }
        return try await createBlock(value: value.absoluteString, title: filename, sourceURL: nil, sourceTitle: nil, channels: channels)
    }

    private func createBlock(value: String, title: String?, sourceURL: URL?, sourceTitle: String?, channels: [ChannelReference]) async throws -> URL? {
        let body = try JSONEncoder().encode(CreateBlockBody(value: value, title: title, originalSourceURL: sourceURL?.absoluteString, originalSourceTitle: sourceTitle, channels: channels))
        let block = try decoder.decode(BlockWire.self, from: await request(path: "/v3/blocks", method: "POST", body: body))
        return URL(string: "https://www.are.na/block/\(block.id)")
    }
}

private struct UserWire: Decodable { let id: Int }
private struct MetaWire: Decodable { let totalPages: Int; enum CodingKeys: String, CodingKey { case totalPages = "total_pages" } }
private struct AbilityWire: Decodable { let addTo: Bool?; enum CodingKeys: String, CodingKey { case addTo = "add_to" } }
private struct MarkdownWire: Decodable {
    let plain: String?
    let markdown: String?
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) { plain = string; markdown = nil; return }
        let object = try? container.decode([String: String].self)
        plain = object?["plain"]; markdown = object?["markdown"]
    }
}
private struct ChannelWire: Decodable {
    let id: Int
    let slug: String
    let title: String
    let visibility: ChannelVisibility?
    let status: ChannelVisibility?
    let description: MarkdownWire?
    let can: AbilityWire?
    var domain: Channel { Channel(id: ChannelID(id), slug: slug, title: title, description: description?.plain ?? description?.markdown ?? "", visibility: visibility ?? status ?? .public) }
}
private struct ChannelPageWire: Decodable { let data: [ChannelWire]; let meta: MetaWire }
private struct BlockWire: Decodable { let id: Int }
private struct PresignBody: Encodable {
    struct File: Encodable {
        let filename: String
        let contentType: String
        enum CodingKeys: String, CodingKey { case filename, contentType = "content_type" }
    }
    let files: [File]
}
private struct PresignResponse: Decodable {
    struct File: Decodable {
        let uploadURL: String
        let key: String
        let contentType: String
        enum CodingKeys: String, CodingKey { case uploadURL = "upload_url", key, contentType = "content_type" }
    }
    let files: [File]
}
private struct ChannelReference: Codable { let id: Int }
private struct CreateChannelBody: Encodable { let title: String; let visibility: ChannelVisibility }
private struct ConnectionBody: Encodable {
    let connectableID: Int; let connectableType: String; let channels: [ChannelReference]
    enum CodingKeys: String, CodingKey { case connectableID = "connectable_id", connectableType = "connectable_type", channels }
}
private struct CreateBlockBody: Encodable {
    let value: String; let title: String?; let originalSourceURL: String?; let originalSourceTitle: String?; let channels: [ChannelReference]
    enum CodingKeys: String, CodingKey { case value, title, originalSourceURL = "original_source_url", originalSourceTitle = "original_source_title", channels }
}
