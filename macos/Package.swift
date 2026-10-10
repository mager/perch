// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "Perch", platforms: [.macOS(.v13)],
    products: [.executable(name: "Perch", targets: ["PerchApp"])],
    targets: [
        .target(name: "PerchCore"),
        .executableTarget(name: "PerchApp", dependencies: ["PerchCore"]),
        .testTarget(name: "PerchCoreTests", dependencies: ["PerchCore"])
    ],
    swiftLanguageModes: [.v5]
)
