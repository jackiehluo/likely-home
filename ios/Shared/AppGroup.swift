import Foundation
import LikelyHomeCore
import Security

enum SharedStore {
    static let appGroup = "group.com.jackieluo.likelyhome"
    static var keychainGroup: String {
        Bundle.main.object(forInfoDictionaryKey: "KeychainAccessGroup") as? String ?? ""
    }

    static func cache() throws -> ChannelCache {
        guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            throw SharedStoreError.appGroupUnavailable
        }
        return ChannelCache(fileURL: root.appending(path: "channels-v1.json"))
    }

    static func credential(_ account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "LikelyHome",
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: keychainGroup,
            kSecReturnData as String: true,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func setCredential(_ value: String, account: String) throws {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "LikelyHome",
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: keychainGroup,
        ]
        SecItemDelete(base as CFDictionary)
        var item = base
        item[kSecValueData as String] = Data(value.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw CoreError.invalidResponse }
    }
}

private enum SharedStoreError: LocalizedError {
    case appGroupUnavailable

    var errorDescription: String? {
        "The shared storage is unavailable. Install a signed build of Likely Home."
    }
}
