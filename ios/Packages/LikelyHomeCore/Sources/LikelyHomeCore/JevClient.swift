import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct JevClient: Sendable {
    private let apiKey: String
    private let transport: any HTTPTransport
    private let policy = RankingPolicy()

    public init(apiKey: String, transport: any HTTPTransport = URLSessionTransport()) {
        self.apiKey = apiKey
        self.transport = transport
    }

    public func rank(context: PageContext, channels: [Channel]) async -> Ranking? {
        if channels.count < 2 { return Ranking(orderedIDs: channels.map(\.id), suggestedIDs: Set(channels.map(\.id))) }
        if channels.count <= policy.maxCandidates {
            guard let probabilities = await probabilities(context: context, channels: channels) else { return nil }
            return orderChannels(channels, probabilities: probabilities)
        }
        let batches = stride(from: 0, to: channels.count, by: policy.maxCandidates).map {
            Array(channels[$0..<min($0 + policy.maxCandidates, channels.count)])
        }
        let batchProbabilities = await withTaskGroup(of: (Int, [String: Double]?).self) { group in
            for (index, batch) in batches.enumerated() {
                group.addTask { (index, await probabilities(context: context, channels: batch)) }
            }
            var results = Array<[String: Double]?>(repeating: nil, count: batches.count)
            for await (index, probabilities) in group { results[index] = probabilities }
            return results
        }
        var finalists: [Channel] = []
        for (index, batch) in batches.enumerated() {
            guard let probabilities = batchProbabilities[index] else { return nil }
            finalists += batch.enumerated().sorted {
                let left = probabilities[channelOptionKey($0.element.id)] ?? 0
                let right = probabilities[channelOptionKey($1.element.id)] ?? 0
                return left == right ? $0.offset < $1.offset : left > right
            }.prefix(policy.batchFinalists).map(\.element)
        }
        guard let finalProbabilities = await probabilities(context: context, channels: finalists),
              let final = orderChannels(finalists, probabilities: finalProbabilities) else { return nil }
        let finalistIDs = Set(final.orderedIDs)
        return Ranking(orderedIDs: final.orderedIDs + channels.map(\.id).filter { !finalistIDs.contains($0) }, suggestedIDs: final.suggestedIDs)
    }

    private func probabilities(context: PageContext, channels: [Channel]) async -> [String: Double]? {
        guard let url = URL(string: "https://api.typesafe.ai/v1/systemone") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 1.8
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(JevRequestBody(context: context, channels: channels))
        do {
            let (data, response) = try await transport.data(for: request)
            guard response.statusCode == 200 else { return nil }
            return try JSONDecoder().decode(JevResponse.self, from: data).answers.home.probabilities
        } catch { return nil }
    }
}

private struct JevResponse: Decodable {
    struct Answers: Decodable {
        struct Home: Decodable { let probabilities: [String: Double] }
        let home: Home
    }
    let answers: Answers
}
