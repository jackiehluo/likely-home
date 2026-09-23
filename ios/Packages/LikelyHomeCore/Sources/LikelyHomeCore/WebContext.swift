import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum WebContext {
    public static func fromHTML(_ html: String, url: URL, suppliedTitle: String = "") -> PageContext {
        let tags = matches(in: html, pattern: #"<(?:meta|link)\b[^>]*>"#, options: [.caseInsensitive])
        var description = ""
        var title = suppliedTitle
        var canonical = url
        for tag in tags {
            let attributes = parseAttributes(tag)
            let name = (attributes["name"] ?? attributes["property"] ?? "").lowercased()
            if name == "description" || name == "og:description", description.isEmpty {
                description = decodeEntities(attributes["content"] ?? "")
            }
            if name == "og:title", title.isEmpty { title = decodeEntities(attributes["content"] ?? "") }
            if attributes["rel"]?.lowercased() == "canonical",
               let href = attributes["href"], let resolved = URL(string: href, relativeTo: url)?.absoluteURL,
               resolved.scheme == "https" || resolved.scheme == "http" {
                canonical = resolved
            }
        }
        if title.isEmpty, let raw = firstCapture(in: html, pattern: #"<title\b[^>]*>([\s\S]*?)</title>"#) {
            title = decodeEntities(stripTags(raw))
        }
        let withoutScripts = html.replacingOccurrences(of: #"<(script|style|noscript)\b[^>]*>[\s\S]*?</\1>"#, with: " ", options: [.regularExpression, .caseInsensitive])
        let excerpt = normalize(decodeEntities(stripTags(withoutScripts)))
        return PageContext(url: canonical, title: normalize(title), description: normalize(description), excerpt: excerpt)
    }

    public static func fetch(_ url: URL, suppliedTitle: String = "") async -> PageContext {
        var request = URLRequest(url: url)
        request.timeoutInterval = 2
        request.setValue("text/html", forHTTPHeaderField: "Accept")
        request.setValue("bytes=0-524287", forHTTPHeaderField: "Range")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode),
                  http.mimeType?.contains("html") == true else {
                return PageContext(url: url, title: suppliedTitle)
            }
            let html = String(decoding: data.prefix(524_288), as: UTF8.self)
            return fromHTML(html, url: url, suppliedTitle: suppliedTitle)
        } catch {
            return PageContext(url: url, title: suppliedTitle)
        }
    }

    private static func parseAttributes(_ tag: String) -> [String: String] {
        let pattern = #"([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#
        guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [:] }
        let range = NSRange(tag.startIndex..<tag.endIndex, in: tag)
        return expression.matches(in: tag, range: range).reduce(into: [:]) { output, match in
            guard let keyRange = Range(match.range(at: 1), in: tag) else { return }
            let value = (2...4).compactMap { Range(match.range(at: $0), in: tag).map { String(tag[$0]) } }.first ?? ""
            output[String(tag[keyRange]).lowercased()] = value
        }
    }

    private static func matches(in input: String, pattern: String, options: NSRegularExpression.Options = []) -> [String] {
        guard let expression = try? NSRegularExpression(pattern: pattern, options: options) else { return [] }
        return expression.matches(in: input, range: NSRange(input.startIndex..<input.endIndex, in: input))
            .compactMap { Range($0.range, in: input).map { String(input[$0]) } }
    }

    private static func firstCapture(in input: String, pattern: String) -> String? {
        guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = expression.firstMatch(in: input, range: NSRange(input.startIndex..<input.endIndex, in: input)),
              let range = Range(match.range(at: 1), in: input) else { return nil }
        return String(input[range])
    }

    private static func stripTags(_ value: String) -> String {
        value.replacingOccurrences(of: #"<[^>]+>"#, with: " ", options: .regularExpression)
    }

    private static func decodeEntities(_ value: String) -> String {
        value.replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
    }

    private static func normalize(_ value: String) -> String {
        String(value.split(whereSeparator: \.isWhitespace).joined(separator: " ").prefix(4_000))
    }
}
