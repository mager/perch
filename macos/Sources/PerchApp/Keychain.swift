import Foundation
import Security
import CryptoKit
import PerchCore

enum TokenStore {
    private static func query(_ config: Configuration) -> [String: Any] {
        let identity = config.origin.absoluteString + "\n" + config.machineID
        let account = SHA256.hash(data: Data(identity.utf8)).map { String(format: "%02x", $0) }.joined()
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "dev.perch.mac.machine",
                kSecAttrAccount as String: account, kSecAttrSynchronizable as String: false]
    }
    static func save(_ token: String, for config: Configuration) throws {
        try Configuration.validateToken(token)
        var values = query(config)
        values[kSecValueData as String] = Data(token.utf8)
        values[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(values as CFDictionary, nil)
        if status == errSecDuplicateItem {
            guard SecItemUpdate(query(config) as CFDictionary, [kSecValueData as String: Data(token.utf8)] as CFDictionary) == errSecSuccess else { throw PerchError.keychain }
        } else if status != errSecSuccess { throw PerchError.keychain }
    }
    static func read(_ config: Configuration) throws -> String {
        var values = query(config)
        values[kSecReturnData as String] = true; values[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(values as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data, let token = String(data: data, encoding: .utf8) else { throw PerchError.keychain }
        try Configuration.validateToken(token)
        return token
    }
    static func delete(_ config: Configuration) throws {
        let status = SecItemDelete(query(config) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw PerchError.keychain }
    }
}
