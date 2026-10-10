// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "Perch", platforms: [.macOS(.v13)],
    products: [.executable(name: "Perch", targets: ["PerchApp"])],
    targets: [
        .target(name: "PerchCore"),
        .executableTarget(name: "PerchApp", dependencies: ["PerchCore"]),
        .testTarget(name: "PerchCoreTests", dependencies: ["PerchCore"])
    ]
)
