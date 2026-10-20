import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import Testing
@testable import LikelyHomeCore

private func channel(_ id: Int, _ title: String = "Channel") -> Channel {
    Channel(id: ChannelID(id), slug: "channel-\(id)", title: title, description: "Description \(id)", visibility: .private)
}

@Test func rankingPreservesOrderWhenConfidenceIsWeak() {
    let channels = [channel(1), channel(2)]
    let result = orderChannels(channels, probabilities: ["channel_1": 0.21, "channel_2": 0.20])
    #expect(result?.orderedIDs == [ChannelID(1), ChannelID(2)])
    #expect(result?.suggestedIDs.isEmpty == true)
}

@Test func rankingOrdersConfidentProbabilities() {
    let channels = [channel(1), channel(2), channel(3)]
    let result = orderChannels(channels, probabilities: ["channel_1": 0.12, "channel_2": 0.61, "channel_3": 0.20])
    #expect(result?.orderedIDs == [ChannelID(2), ChannelID(3), ChannelID(1)])
    #expect(result?.suggestedIDs == [ChannelID(2)])
}

@Test func selectionStopsAtTwenty() {
    var selection = ChannelSelection()
    for id in 1...20 {
        let added = selection.toggle(ChannelID(id))
        #expect(added)
    }
    let addedTwentyFirst = selection.toggle(ChannelID(21))
    #expect(!addedTwentyFirst)
    #expect(selection.ids.count == 20)
}

@Test func cacheRoundTripsAndPrependsCreatedChannel() throws {
    let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    let cache = ChannelCache(fileURL: directory.appending(path: "channels.json"))
    try cache.replace(with: ChannelSnapshot(accountID: 42, channels: [channel(1)]))
    try cache.prepend(channel(2))
    #expect(try cache.read()?.channels.map(\.id) == [ChannelID(2), ChannelID(1)])
}

@Test func htmlContextIncludesCanonicalTitleDescriptionAndExcerpt() throws {
    let url = try #require(URL(string: "https://example.org/story?from=share"))
    let html = """
    <html><head>
    <link href="/story" rel="canonical">
    <meta content="A story about making worlds &amp; play." name="description">
    <title>Making a world</title>
    <script>ignore this script</script>
    </head><body><article>Long, useful text about the story.</article></body></html>
    """
    let context = WebContext.fromHTML(html, url: url)
    #expect(context.url?.absoluteString == "https://example.org/story")
    #expect(context.title == "Making a world")
    #expect(context.description == "A story about making worlds & play.")
    #expect(context.excerpt.contains("Long, useful text about the story."))
    #expect(!context.excerpt.contains("ignore this script"))
}

private struct FakeJevTransport: HTTPTransport {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let body = try #require(request.httpBody)
        let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
        let questions = try #require(json["questions"] as? [String: Any])
        let home = try #require(questions["home"] as? [String: Any])
        let criteria = try #require(home["criteria"] as? [String: String])
        let probabilities = Dictionary(uniqueKeysWithValues: criteria.keys.map { key in
            (key, key == "channel_256" ? 0.9 : key == "channel_1" ? 0.7 : 0.01)
        })
        let data = try JSONSerialization.data(withJSONObject: ["answers": ["home": ["probabilities": probabilities]]])
        return (data, HTTPURLResponse(url: try #require(request.url), statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}

@Test func rankingIncludesEveryChannelAfterBatchTournament() async {
    let channels = (1...300).map { channel($0) }
    let ranking = await JevClient(apiKey: "test", transport: FakeJevTransport()).rank(context: PageContext(url: nil), channels: channels)
    #expect(ranking?.orderedIDs.first == ChannelID(256))
    #expect(ranking?.orderedIDs.count == 300)
    #expect(Set(ranking?.orderedIDs ?? []).count == 300)
}

private actor RecordingArenaTransport: HTTPTransport {
    private(set) var body: Data?

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        body = request.httpBody
        let response = HTTPURLResponse(url: try #require(request.url), statusCode: 201, httpVersion: nil, headerFields: nil)!
        return (Data(#"{"id":42}"#.utf8), response)
    }
}

@Test func oneBlockConnectsToEverySelectedChannel() async throws {
    let transport = RecordingArenaTransport()
    let url = try #require(URL(string: "https://example.org/article"))
    let block = try await ArenaClient(token: "test", transport: transport).save(.link(url), channelIDs: [ChannelID(3), ChannelID(8)])
    let body = try #require(await transport.body)
    let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
    let channels = try #require(json["channels"] as? [[String: Int]])
    #expect(block?.absoluteString == "https://www.are.na/block/42")
    #expect(channels.map { $0["id"] } == [3, 8])
}

private actor RecordingUploadTransport: HTTPTransport {
    private(set) var requests: [URLRequest] = []

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        let response = HTTPURLResponse(url: try #require(request.url), statusCode: request.httpMethod == "PUT" ? 200 : 201, httpVersion: nil, headerFields: nil)!
        let body: String
        switch request.url?.path {
        case "/v3/uploads/presign":
            body = #"{"files":[{"upload_url":"https://s3.amazonaws.com/arena_images-temp/uploads/test.pdf?signature=test","key":"uploads/test.pdf","content_type":"application/pdf"}],"expires_in":3600}"#
        case "/v3/blocks": body = #"{"id":42}"#
        default: body = ""
        }
        return (Data(body.utf8), response)
    }
}

@Test func localPDFUploadsBytesBeforeCreatingAttachmentBlock() async throws {
    let file = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString + ".pdf")
    let bytes = Data("%PDF-1.7 test".utf8)
    try bytes.write(to: file)
    defer { try? FileManager.default.removeItem(at: file) }

    let transport = RecordingUploadTransport()
    let block = try await ArenaClient(token: "test", transport: transport).save(
        .localAsset(fileURL: file, contentType: "application/pdf", filename: "essay.pdf"),
        channelIDs: [ChannelID(3), ChannelID(8)]
    )
    let requests = await transport.requests
    #expect(requests.map(\.httpMethod) == ["POST", "PUT", "POST"])
    #expect(requests[0].url?.path == "/v3/uploads/presign")
    #expect(requests[0].httpBody?.contains(Data("essay.pdf".utf8)) == true)
    #expect(requests[1].httpBody == bytes)
    #expect(requests[1].value(forHTTPHeaderField: "Content-Type") == "application/pdf")
    let blockBody = try #require(requests[2].httpBody)
    let blockJSON = try #require(JSONSerialization.jsonObject(with: blockBody) as? [String: Any])
    #expect(blockJSON["value"] as? String == "https://s3.amazonaws.com/arena_images-temp/uploads/test.pdf")
    let channels = try #require(blockJSON["channels"] as? [[String: Int]])
    #expect(channels.map { $0["id"] } == [3, 8])
    #expect(block?.absoluteString == "https://www.are.na/block/42")
}
