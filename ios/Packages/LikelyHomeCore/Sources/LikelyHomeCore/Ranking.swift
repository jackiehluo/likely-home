import Foundation

public struct RankingPolicy: Equatable, Sendable {
    public let maxCandidates = 255
    public let batchFinalists = 5
    public let minimumTopProbability = 0.20
    public let minimumLead = 0.03
    public let suggestedBand = 0.08
    public let maxSuggested = 3
    public init() {}
}

public func channelOptionKey(_ id: ChannelID) -> String { "channel_\(id.rawValue)" }

public func orderChannels(
    _ channels: [Channel],
    probabilities: [String: Double],
    policy: RankingPolicy = .init()
) -> Ranking? {
    guard !channels.isEmpty else { return Ranking(orderedIDs: [], suggestedIDs: []) }
    let indexed = channels.enumerated().map { ($0.offset, $0.element) }
    let scored: [(Int, Channel, Double)] = indexed.compactMap { index, channel in
        guard let score = probabilities[channelOptionKey(channel.id)], score.isFinite, (0...1).contains(score) else { return nil }
        return (index, channel, score)
    }
    guard scored.count == channels.count else { return nil }
    let sorted = scored.sorted { left, right in left.2 == right.2 ? left.0 < right.0 : left.2 > right.2 }
    let top = sorted[0].2
    let second = sorted.count > 1 ? sorted[1].2 : 0
    guard top >= policy.minimumTopProbability, top - second >= policy.minimumLead else {
        return Ranking(orderedIDs: channels.map(\.id), suggestedIDs: [])
    }
    let suggested = sorted.prefix(policy.maxSuggested).filter { top - $0.2 <= policy.suggestedBand }.map { $0.1.id }
    return Ranking(orderedIDs: sorted.map { $0.1.id }, suggestedIDs: Set(suggested))
}

public struct JevRequestBody: Encodable, Sendable {
    struct Page: Encodable, Sendable {
        let url: String
        let title: String
        let description: String
        let selected_text: String
        let excerpt: String
    }
    struct State: Encodable, Sendable { let page: Page }
    struct Question: Encodable, Sendable {
        let type = "choice"
        let instructions: String
        let criteria: [String: String]
    }
    let model = "jev-latest"
    let state: State
    let questions: [String: Question]

    public init(context: PageContext, channels: [Channel]) {
        state = State(page: Page(
            url: context.url?.absoluteString ?? "",
            title: context.title,
            description: context.description,
            selected_text: context.selectedText,
            excerpt: context.excerpt
        ))
        let criteria = Dictionary(uniqueKeysWithValues: channels.map {
            (channelOptionKey($0.id), $0.title + ($0.description.isEmpty ? "" : " — " + String($0.description.prefix(280))))
        })
        questions = ["home": Question(
            instructions: "Which Are.na channel is the most fitting home for this page or selection? Prefer the channel whose topic and intent most specifically match.",
            criteria: criteria
        )]
    }
}
